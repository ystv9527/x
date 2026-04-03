#!/usr/bin/env node
/**
 * Fill bilingual fields in data/contents.json.
 *
 * Rule:
 * - If only one language exists, translate to the other.
 * - If both contentChinese/contentEnglish are empty but content exists:
 *   detect source language and fill both.
 *
 * Translation engine:
 * - Fast path: translate.googleapis.com (public endpoint, no key).
 * - Fallback: configured AI endpoint in config.json (if available).
 *
 * Usage examples:
 *   node scripts/fill-bilingual-content.js
 *   node scripts/fill-bilingual-content.js --limit=200
 *   node scripts/fill-bilingual-content.js --dry-run
 *   node scripts/fill-bilingual-content.js --concurrency=8 --save-every=50
 *   node scripts/fill-bilingual-content.js --no-build
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONTENTS_FILE = path.join(DATA_DIR, 'contents.json');
const LATEST_FILE = path.join(DATA_DIR, 'latest.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const LATEST_COUNT = 100;

function parseArgs(argv) {
  const args = {
    limit: null,
    dryRun: false,
    concurrency: 6,
    saveEvery: 60,
    noBuild: false
  };

  for (const raw of argv) {
    if (raw === '--dry-run') args.dryRun = true;
    if (raw === '--no-build') args.noBuild = true;

    if (raw.startsWith('--limit=')) {
      const n = Number(raw.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) args.limit = Math.floor(n);
    }
    if (raw.startsWith('--concurrency=')) {
      const n = Number(raw.slice('--concurrency='.length));
      if (Number.isFinite(n) && n > 0 && n <= 20) args.concurrency = Math.floor(n);
    }
    if (raw.startsWith('--save-every=')) {
      const n = Number(raw.slice('--save-every='.length));
      if (Number.isFinite(n) && n > 0 && n <= 2000) args.saveEvery = Math.floor(n);
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function cleanText(value) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}

function backupFile(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, out);
  return out;
}

function buildTasks(items, limit = null) {
  const tasks = [];
  for (const item of items) {
    const contentChinese = cleanText(item.contentChinese || '');
    const contentEnglish = cleanText(item.contentEnglish || '');
    const content = cleanText(item.content || '');

    if (contentChinese && contentEnglish) continue;
    if (!contentChinese && !contentEnglish && !content) continue;

    tasks.push({
      id: Number(item.id),
      title: cleanText(item.title || ''),
      contentChinese,
      contentEnglish,
      content
    });

    if (limit && tasks.length >= limit) break;
  }
  return tasks;
}

function splitForTranslate(text, chunkSize = 1400) {
  const normalized = cleanText(text);
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if (!current) {
      current = line;
      continue;
    }
    if ((current.length + 1 + line.length) <= chunkSize) {
      current += `\n${line}`;
      continue;
    }
    chunks.push(current);
    current = line;
  }
  if (current) chunks.push(current);
  return chunks;
}

function detectLanguage(text) {
  const input = cleanText(text);
  if (!input) return 'unknown';

  const cjk = (input.match(/[\u3400-\u9FFF]/g) || []).length;
  const latin = (input.match(/[A-Za-z]/g) || []).length;

  if (cjk === 0 && latin === 0) return 'unknown';
  if (cjk >= latin * 0.6) return 'zh';
  if (latin > cjk * 1.2) return 'en';
  return 'mixed';
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function googleTranslateChunk(text, target, source = 'auto', attempt = 1) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', source);
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Unexpected translation response shape');
    }

    const translated = data[0]
      .map((seg) => (Array.isArray(seg) ? (seg[0] || '') : ''))
      .join('')
      .trim();

    if (!translated) throw new Error('Empty translation output');
    return translated;
  } catch (error) {
    clearTimeout(timer);
    if (attempt < 3) {
      await sleep(attempt * 500);
      return googleTranslateChunk(text, target, source, attempt + 1);
    }
    throw error;
  }
}

async function googleTranslateText(text, target, source = 'auto') {
  const chunks = splitForTranslate(text);
  if (chunks.length === 0) return '';

  const outputs = [];
  for (const chunk of chunks) {
    outputs.push(await googleTranslateChunk(chunk, target, source));
  }
  return outputs.join('\n').trim();
}

function getAiConfig(config) {
  if (!config || !config.ai) return null;
  if (!config.ai.apiUrl || !config.ai.apiKey || !config.ai.model) return null;
  return {
    apiUrl: String(config.ai.apiUrl).replace(/\/+$/, ''),
    apiKey: config.ai.apiKey,
    model: config.ai.model,
    maxTokens: Math.min(6000, Number(config.ai.maxTokens) || 2000)
  };
}

async function aiTranslateText(ai, text, targetLanguage) {
  const url = `${ai.apiUrl}/chat/completions`;
  const targetName = targetLanguage === 'zh-CN' ? '简体中文' : 'English';
  const payload = {
    model: ai.model,
    messages: [
      {
        role: 'system',
        content: `Translate the user text into ${targetName}. Keep meaning and structure. Return translated text only.`
      },
      {
        role: 'user',
        content: text
      }
    ],
    temperature: 0.1,
    max_tokens: ai.maxTokens
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ai.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const translated = cleanText(data?.choices?.[0]?.message?.content || '');
    if (!translated) throw new Error('Empty AI translation');
    return translated;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

async function translateText(text, target, source, aiConfig) {
  const sourceText = cleanText(text);
  if (!sourceText) return '';

  try {
    return await googleTranslateText(sourceText, target, source);
  } catch (googleError) {
    if (aiConfig) {
      try {
        return await aiTranslateText(aiConfig, sourceText, target);
      } catch (aiError) {
        throw new Error(`google+ai failed: ${googleError.message}; ${aiError.message}`);
      }
    }
    throw new Error(`google failed: ${googleError.message}`);
  }
}

async function safeTranslateText(text, target, source, aiConfig, fallbackText = '') {
  try {
    return await translateText(text, target, source, aiConfig);
  } catch {
    return cleanText(fallbackText);
  }
}

async function completeTask(task, aiConfig) {
  const out = {
    id: task.id,
    contentChinese: cleanText(task.contentChinese),
    contentEnglish: cleanText(task.contentEnglish)
  };

  // Already complete.
  if (out.contentChinese && out.contentEnglish) return out;

  // One side exists.
  if (!out.contentChinese && out.contentEnglish) {
    out.contentChinese = await safeTranslateText(out.contentEnglish, 'zh-CN', 'en', aiConfig, out.contentEnglish);
    return out;
  }
  if (out.contentChinese && !out.contentEnglish) {
    out.contentEnglish = await safeTranslateText(out.contentChinese, 'en', 'zh-CN', aiConfig, out.contentChinese);
    return out;
  }

  // Both sides missing, fallback to content.
  const source = cleanText(task.content);
  if (!source) throw new Error('No source text available');

  const lang = detectLanguage(source);
  if (lang === 'zh') {
    out.contentChinese = source;
    out.contentEnglish = await safeTranslateText(source, 'en', 'zh-CN', aiConfig, source);
    return out;
  }
  if (lang === 'en') {
    out.contentEnglish = source;
    out.contentChinese = await safeTranslateText(source, 'zh-CN', 'en', aiConfig, source);
    return out;
  }

  // Mixed/unknown: translate into both sides.
  out.contentChinese = await safeTranslateText(source, 'zh-CN', 'auto', aiConfig, source);
  out.contentEnglish = await safeTranslateText(source, 'en', 'auto', aiConfig, source);
  return out;
}

function rebuildLatestArchiveFromContents(contentsItems) {
  const generatedAt = new Date().toISOString();
  const latestItems = contentsItems.slice(-LATEST_COUNT);
  const archiveItems = contentsItems.slice(0, -LATEST_COUNT);

  const globalTagCount = {};
  for (const item of contentsItems) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    for (const tag of tags) {
      if (!tag) continue;
      globalTagCount[tag] = (globalTagCount[tag] || 0) + 1;
    }
  }

  writeJson(LATEST_FILE, {
    generatedAt,
    totalCount: latestItems.length,
    hasMore: archiveItems.length > 0,
    globalStats: {
      totalCount: contentsItems.length,
      tagCount: globalTagCount
    },
    items: latestItems
  });

  writeJson(ARCHIVE_FILE, {
    generatedAt,
    totalCount: archiveItems.length,
    items: archiveItems
  });
}

function runBuild() {
  execSync('node scripts/generate-pages.js', { cwd: ROOT_DIR, stdio: 'inherit' });
  execSync('node scripts/generate-sitemap.js', { cwd: ROOT_DIR, stdio: 'inherit' });
}

async function runPool(tasks, concurrency, worker, onDone) {
  let index = 0;
  let active = 0;

  return new Promise((resolve) => {
    const launch = () => {
      while (active < concurrency && index < tasks.length) {
        const current = index;
        index += 1;
        active += 1;

        Promise.resolve()
          .then(() => worker(tasks[current], current))
          .then((result) => onDone(null, result, tasks[current], current))
          .catch((error) => onDone(error, null, tasks[current], current))
          .finally(() => {
            active -= 1;
            if (index >= tasks.length && active === 0) {
              resolve();
            } else {
              launch();
            }
          });
      }
    };

    launch();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(CONTENTS_FILE)) throw new Error('data/contents.json not found');
  const config = fs.existsSync(CONFIG_FILE) ? readJson(CONFIG_FILE) : {};
  const aiConfig = getAiConfig(config);

  const payload = readJson(CONTENTS_FILE);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const itemById = new Map(items.map((it) => [Number(it.id), it]));

  const tasks = buildTasks(items, args.limit);
  console.log(`Total items: ${items.length}`);
  console.log(`Tasks to fill bilingual: ${tasks.length}`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(`AI fallback: ${aiConfig ? 'enabled' : 'disabled'}`);

  if (tasks.length === 0) {
    console.log('No tasks to process.');
    return;
  }

  if (args.dryRun) {
    console.log('Dry-run mode: no write.');
    return;
  }

  const backup = backupFile(CONTENTS_FILE);
  console.log(`Backup created: ${backup}`);

  let processed = 0;
  let filledZh = 0;
  let filledEn = 0;
  let completeNow = 0;
  let failed = 0;

  await runPool(
    tasks,
    args.concurrency,
    async (task) => completeTask(task, aiConfig),
    (error, result, task) => {
      processed += 1;
      const item = itemById.get(Number(task.id));
      if (!item) {
        failed += 1;
        return;
      }

      if (error || !result) {
        failed += 1;
      } else {
        const beforeZh = nonEmpty(item.contentChinese);
        const beforeEn = nonEmpty(item.contentEnglish);

        if (!beforeZh && nonEmpty(result.contentChinese)) item.contentChinese = cleanText(result.contentChinese);
        if (!beforeEn && nonEmpty(result.contentEnglish)) item.contentEnglish = cleanText(result.contentEnglish);

        const afterZh = nonEmpty(item.contentChinese);
        const afterEn = nonEmpty(item.contentEnglish);

        if (!beforeZh && afterZh) filledZh += 1;
        if (!beforeEn && afterEn) filledEn += 1;
        if ((!beforeZh || !beforeEn) && afterZh && afterEn) completeNow += 1;
        if (!afterZh || !afterEn) failed += 1;
      }

      if (processed % args.saveEvery === 0) {
        payload.generatedAt = new Date().toISOString();
        writeJson(CONTENTS_FILE, payload);
      }

      if (processed % 20 === 0 || processed === tasks.length) {
        process.stdout.write(`\rProcessed ${processed}/${tasks.length} | failed=${failed}`);
      }
    }
  );
  process.stdout.write('\n');

  payload.generatedAt = new Date().toISOString();
  writeJson(CONTENTS_FILE, payload);
  rebuildLatestArchiveFromContents(items);

  const summary = {
    processedTasks: processed,
    filledZh,
    filledEn,
    completeNow,
    failedTasks: failed
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!args.noBuild) {
    runBuild();
  } else {
    console.log('Build skipped by --no-build');
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error('Failed:', error?.message || error);
  process.exit(1);
});
