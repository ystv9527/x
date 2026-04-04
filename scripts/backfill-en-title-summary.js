#!/usr/bin/env node
/**
 * One-time backfill: English title/summary for historical items.
 *
 * Default scope:
 * - id <= 599
 * - image/video items only
 *
 * Usage:
 *   node scripts/backfill-en-title-summary.js
 *   node scripts/backfill-en-title-summary.js --max-id=1200
 *   node scripts/backfill-en-title-summary.js --all
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONTENTS_FILE = path.join(DATA_DIR, 'contents.json');
const LATEST_FILE = path.join(DATA_DIR, 'latest.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const CACHE_FILE = path.join(DATA_DIR, 'en-title-summary-cache.json');
const LATEST_COUNT = 100;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasCjkText(value) {
  return /[\u3400-\u9FFF]/.test(cleanText(value));
}

function parseArgs(argv) {
  const args = {
    maxId: 599,
    all: false
  };
  for (const raw of argv) {
    if (raw === '--all') args.all = true;
    if (raw.startsWith('--max-id=')) {
      const n = Number(raw.slice('--max-id='.length));
      if (Number.isFinite(n) && n > 0) args.maxId = Math.floor(n);
    }
  }
  return args;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

function isImageOrVideoItem(item) {
  const tags = normalizeTags(item.tags);
  const hasMediaTag = tags.includes('图片') || tags.includes('视频') || tags.includes('Image') || tags.includes('Video');
  const hasImage = Array.isArray(item.images) && item.images.length > 0;
  const hasVideo = Array.isArray(item.videos) && item.videos.length > 0;
  return hasMediaTag || hasImage || hasVideo;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadAiTranslateConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const config = readJson(CONFIG_FILE);
    const ai = config && config.ai ? config.ai : null;
    if (!ai || !ai.apiUrl || !ai.apiKey || !ai.model) return null;
    return {
      apiUrl: String(ai.apiUrl).replace(/\/+$/, ''),
      apiKey: String(ai.apiKey),
      model: String(ai.model),
      maxTokens: Math.max(200, Math.min(1200, Number(ai.maxTokens) || 800))
    };
  } catch (error) {
    return null;
  }
}

function extractAiText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const direct = payload?.choices?.[0]?.message?.content;
  if (typeof direct === 'string') return direct.trim();
  if (Array.isArray(direct)) {
    return direct
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part.text === 'string') return part.text;
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

async function translateByGoogle(text) {
  const input = cleanText(text);
  if (!input) return '';

  const endpoint = new URL('https://translate.googleapis.com/translate_a/single');
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', 'auto');
  endpoint.searchParams.set('tl', 'en');
  endpoint.searchParams.set('dt', 't');
  endpoint.searchParams.set('q', input);

  return new Promise((resolve) => {
    const req = https.get(endpoint.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve('');
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!Array.isArray(data) || !Array.isArray(data[0])) {
            resolve('');
            return;
          }
          const translated = data[0]
            .map((seg) => (Array.isArray(seg) ? String(seg[0] || '') : ''))
            .join('')
            .trim();
          resolve(translated);
        } catch (error) {
          resolve('');
        }
      });
    });
    req.setTimeout(10000, () => {
      req.destroy();
      resolve('');
    });
    req.on('error', () => resolve(''));
  });
}

async function translateByAi(text, ai) {
  if (!ai) return '';
  const input = cleanText(text);
  if (!input) return '';

  const payload = JSON.stringify({
    model: ai.model,
    messages: [
      {
        role: 'system',
        content: 'Translate the user text into natural English. Keep meaning accurate. Output translated text only.'
      },
      {
        role: 'user',
        content: input
      }
    ],
    reasoning_effort: 'low',
    temperature: 0.1,
    max_tokens: ai.maxTokens
  });

  return new Promise((resolve) => {
    const apiUrl = new URL(`${ai.apiUrl}/chat/completions`);
    const client = apiUrl.protocol === 'http:' ? http : https;
    const req = client.request({
      protocol: apiUrl.protocol,
      hostname: apiUrl.hostname,
      port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
      path: `${apiUrl.pathname}${apiUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ai.apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve('');
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve(extractAiText(parsed));
        } catch (error) {
          resolve('');
        }
      });
    });
    req.setTimeout(12000, () => {
      req.destroy();
      resolve('');
    });
    req.on('error', () => resolve(''));
    req.write(payload);
    req.end();
  });
}

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return { title: {}, summary: {} };
    const raw = readJson(CACHE_FILE);
    return {
      title: raw && typeof raw.title === 'object' ? raw.title : {},
      summary: raw && typeof raw.summary === 'object' ? raw.summary : {}
    };
  } catch (error) {
    return { title: {}, summary: {} };
  }
}

function saveCache(cache) {
  writeJson(CACHE_FILE, cache);
}

async function translateWithFallback(text, ai) {
  const byAi = await translateByAi(text, ai);
  if (byAi) return byAi;
  return translateByGoogle(text);
}

function rebuildSplitFiles(items) {
  const allItems = Array.isArray(items) ? items : [];
  const latestItems = allItems.slice(-LATEST_COUNT);
  const archiveItems = allItems.slice(0, -LATEST_COUNT);

  const globalTagCount = {};
  for (const item of allItems) {
    for (const tag of normalizeTags(item.tags)) {
      globalTagCount[tag] = (globalTagCount[tag] || 0) + 1;
    }
  }

  writeJson(LATEST_FILE, {
    generatedAt: new Date().toISOString(),
    totalCount: latestItems.length,
    hasMore: archiveItems.length > 0,
    globalStats: {
      totalCount: allItems.length,
      tagCount: globalTagCount
    },
    items: latestItems
  });

  writeJson(ARCHIVE_FILE, {
    generatedAt: new Date().toISOString(),
    totalCount: archiveItems.length,
    items: archiveItems
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ai = loadAiTranslateConfig();
  const cache = loadCache();

  const dataset = readJson(CONTENTS_FILE);
  const items = Array.isArray(dataset.items) ? dataset.items : [];
  if (!items.length) {
    console.log('No items found in contents.json');
    return;
  }

  const scopeItems = items.filter((item) => {
    const inIdScope = Number(item.id) > 0 && Number(item.id) <= args.maxId;
    if (!inIdScope) return false;
    if (args.all) return true;
    return isImageOrVideoItem(item);
  });

  let needTitle = 0;
  let needSummary = 0;
  for (const item of scopeItems) {
    if (hasCjkText(item.title) && !cleanText(item.titleEnglish)) needTitle += 1;
    if (hasCjkText(item.summary) && !cleanText(item.summaryEnglish)) needSummary += 1;
  }

  console.log(`Scope items: ${scopeItems.length} (maxId=${args.maxId}, all=${args.all})`);
  console.log(`Need translation: title=${needTitle}, summary=${needSummary}`);
  if (needTitle === 0 && needSummary === 0) {
    console.log('Nothing to backfill.');
    return;
  }
  if (!ai) {
    console.log('AI fallback unavailable (config.ai incomplete). Will try Google translate only.');
  }

  let doneTitle = 0;
  let doneSummary = 0;
  let failTitle = 0;
  let failSummary = 0;

  let progress = 0;
  for (const item of scopeItems) {
    progress += 1;
    const title = cleanText(item.title);
    const summary = cleanText(item.summary);

    if (hasCjkText(title) && !cleanText(item.titleEnglish)) {
      const cached = cleanText(cache.title[title]);
      if (cached) {
        item.titleEnglish = cached;
        doneTitle += 1;
      } else {
        const translated = cleanText(await translateWithFallback(title, ai));
        if (translated) {
          item.titleEnglish = translated;
          cache.title[title] = translated;
          doneTitle += 1;
        } else {
          failTitle += 1;
        }
      }
    }

    if (hasCjkText(summary) && !cleanText(item.summaryEnglish)) {
      const cached = cleanText(cache.summary[summary]);
      if (cached) {
        item.summaryEnglish = cached;
        doneSummary += 1;
      } else {
        const translated = cleanText(await translateWithFallback(summary, ai));
        if (translated) {
          item.summaryEnglish = translated;
          cache.summary[summary] = translated;
          doneSummary += 1;
        } else {
          failSummary += 1;
        }
      }
    }

    if (progress % 20 === 0) {
      console.log(`Progress ${progress}/${scopeItems.length} | title ${doneTitle}/${needTitle} | summary ${doneSummary}/${needSummary}`);
      saveCache(cache);
    }
  }

  dataset.generatedAt = new Date().toISOString();
  dataset.totalCount = items.length;
  dataset.items = items;

  writeJson(CONTENTS_FILE, dataset);
  rebuildSplitFiles(items);
  saveCache(cache);

  console.log('\nBackfill completed:');
  console.log(`Title:   success=${doneTitle}, failed=${failTitle}, target=${needTitle}`);
  console.log(`Summary: success=${doneSummary}, failed=${failSummary}, target=${needSummary}`);
}

main().catch((error) => {
  console.error('Backfill failed:', error.message || error);
  process.exit(1);
});
