#!/usr/bin/env node

/**
 * Content Collector Server - Support for Form Upload
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const { spawn } = require('child_process');

// 代理支持
let HttpsProxyAgent;
try {
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch(e) {
  console.log('⚠️ https-proxy-agent not installed, proxy will not work');
}

// 文件上传支持
const formidable = require('formidable');

const PORT = 3000;
const COLLECTION_FILE = path.join(__dirname, 'content/collection.md');
const IMAGES_DIR = path.join(__dirname, 'images');
const VIDEOS_DIR = path.join(__dirname, 'videos');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const XHS_DEFAULT_SKILL_ROOT = path.join(os.homedir(), '.skills-manager', 'skills', 'xhs-auto-suite');
const XHS_VIRAL_TITLE_SKILL_ROOT = path.join(os.homedir(), '.skills-manager', 'skills', 'xhs-viral-title');
const DATA_DIR = path.join(__dirname, 'data');
const XHS_SCHEDULER_FILE = path.join(DATA_DIR, 'xhs-scheduler.json');
const XHS_SCHEDULER_LOCK_FILE = path.join(DATA_DIR, 'xhs-scheduler.lock');
const XHS_CONTENT_LIMIT = 1000;
const XHS_LONG_PROMPT_THRESHOLD = 900;

// Ensure directories exist
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * 🎬 下载 M3U8 视频（使用 ffmpeg）
 * @param {string} m3u8Url - M3U8 播放列表URL
 * @param {string} outputPath - 输出文件路径
 * @param {function} callback - 回调函数 (error)
 */
function downloadM3U8(m3u8Url, outputPath, callback) {
  const { exec } = require('child_process');

  // 检查 ffmpeg 是否可用
  exec('ffmpeg -version', (error) => {
    if (error) {
      console.error('❌ ffmpeg 未安装！请先安装 ffmpeg：');
      console.error('   Windows: choco install ffmpeg  或从 https://ffmpeg.org 下载');
      console.error('   Mac: brew install ffmpeg');
      console.error('   Linux: apt install ffmpeg 或 yum install ffmpeg');

      callback(new Error('ffmpeg 未安装，无法下载 M3U8 视频'));
      return;
    }

    // 使用 ffmpeg 下载并转换 M3U8
    const command = `ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${outputPath}" -y`;
    console.log('🎬 执行命令:', command);

    const ffmpegProcess = exec(command, {
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });

    ffmpegProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('✅ M3U8 视频下载完成');
        callback(null);
      } else {
        console.error(`❌ ffmpeg 退出码: ${code}`);
        callback(new Error(`ffmpeg 下载失败，退出码: ${code}`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      console.error('❌ ffmpeg 执行错误:', err);
      callback(err);
    });

    // 打印 ffmpeg 输出（用于调试）
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('time=') || output.includes('speed=')) {
        // 只打印进度信息的最后一行
        process.stdout.write('\r' + output.trim().split('\n').pop());
      }
    });
  });
}

const DEFAULT_CONFIG = {
  ai: {
    enabled: false
  },
  wechat: {
    apiBaseUrl: 'https://wx.limyai.com',
    apiKey: '',
    defaultAppid: '',
    publicBaseUrl: '',
    author: '',
    contentFormat: 'markdown',
    articleType: 'news',
    autoOptimize: true
  },
  xhs: {
    enabled: false,
    autoPublish: false,
    pythonCmd: 'python',
    skillRoot: XHS_DEFAULT_SKILL_ROOT,
    viralTitleSkillRoot: XHS_VIRAL_TITLE_SKILL_ROOT,
    account: 'default',
    headless: true,
    publicBaseUrl: '',
    autoOptimizeTitle: true,
    forcePromptTag: true,
    scheduleEnabled: false,
    scheduleMinHours: 2,
    scheduleMaxHours: 3
  }
};

function normalizeConfig(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  return {
    ...safeConfig,
    ai: {
      ...DEFAULT_CONFIG.ai,
      ...(safeConfig.ai || {})
    },
    wechat: {
      ...DEFAULT_CONFIG.wechat,
      ...(safeConfig.wechat || {})
    },
    xhs: {
      ...DEFAULT_CONFIG.xhs,
      ...(safeConfig.xhs || {})
    }
  };
}

// Helper function: Load config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const rawConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return normalizeConfig(rawConfig);
    }
  } catch (error) {
    console.error('配置文件读取失败:', error);
  }
  return normalizeConfig({});
}

// Helper function: Save config
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function readJsonFileSafe(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    return fallbackValue;
  }
}

function writeJsonFileSafe(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

function normalizeXhsSchedulerState(state) {
  const normalized = { accounts: {} };
  if (!state || typeof state !== 'object') {
    return normalized;
  }

  const pushAccountState = (accountKey, value) => {
    const key = String(accountKey || '').trim().toLowerCase();
    if (!key) return;
    const lastScheduledAt = String(value?.lastScheduledAt || '').trim();
    if (!lastScheduledAt || !Number.isFinite(Date.parse(lastScheduledAt))) return;
    normalized.accounts[key] = { lastScheduledAt };
  };

  if (state.accounts && typeof state.accounts === 'object') {
    for (const [accountKey, value] of Object.entries(state.accounts)) {
      pushAccountState(accountKey, value);
    }
  }

  // Backward compatibility: migrate legacy top-level lastScheduledAt into default account.
  if (!normalized.accounts.default) {
    pushAccountState('default', state);
  }

  return normalized;
}

function loadXhsSchedulerState() {
  return normalizeXhsSchedulerState(readJsonFileSafe(XHS_SCHEDULER_FILE, {}));
}

function saveXhsSchedulerState(state) {
  const normalized = normalizeXhsSchedulerState(state);
  normalized.updatedAt = new Date().toISOString();
  writeJsonFileSafe(XHS_SCHEDULER_FILE, normalized);
}

let staticRebuildRunning = false;
let staticRebuildPending = false;
let xhsSchedulerLock = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withXhsSchedulerFileLock(task, options = {}) {
  const lockFile = options.lockFile || XHS_SCHEDULER_LOCK_FILE;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : 10000;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? Math.max(25, options.retryDelayMs) : 100;
  const startedAt = Date.now();

  while (true) {
    let handle = null;
    try {
      handle = await fs.promises.open(lockFile, 'wx');
      await handle.writeFile(String(process.pid), 'utf-8');
      try {
        return await task();
      } finally {
        await handle.close().catch(() => {});
        await fs.promises.unlink(lockFile).catch(() => {});
      }
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
      }

      if (error && error.code === 'EEXIST' && (Date.now() - startedAt) < timeoutMs) {
        await sleep(retryDelayMs);
        continue;
      }

      throw error;
    }
  }
}

function withXhsSchedulerLock(task) {
  const wrappedTask = () => withXhsSchedulerFileLock(task);
  const run = xhsSchedulerLock.then(() => wrappedTask(), () => wrappedTask());
  xhsSchedulerLock = run.catch(() => {});
  return run;
}

function runNodeScript(scriptRelativePath, label) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptRelativePath);
    const child = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      windowsHide: true
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(`[${label}] ${chunk.toString()}`);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(`[${label}] ${chunk.toString()}`);
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });
  });
}

async function runStaticRebuild(trigger = 'manual') {
  console.log(`[build] Start static rebuild (${trigger})`);
  const startedAt = Date.now();
  await runNodeScript('scripts/generate-pages.js', 'generate-pages');
  await runNodeScript('scripts/generate-sitemap.js', 'generate-sitemap');
  console.log(`[build] Static rebuild done in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

function scheduleStaticRebuild(trigger = 'manual') {
  if (staticRebuildRunning) {
    staticRebuildPending = true;
    console.log('[build] Rebuild already running; queued one more run.');
    return;
  }

  staticRebuildRunning = true;
  (async () => {
    do {
      staticRebuildPending = false;
      try {
        await runStaticRebuild(trigger);
      } catch (error) {
        console.error('[build] Static rebuild failed:', error.message);
      }
    } while (staticRebuildPending);
  })().finally(() => {
    staticRebuildRunning = false;
  });
}

const TAG_TO_ENGLISH = Object.freeze({
  '图片': 'Image',
  '视频': 'Video',
  '摄影': 'Photography',
  '创意': 'Creative',
  '创意设计': 'Creative Design',
  '设计': 'Design',
  '数字艺术': 'Digital Art',
  '工具': 'Tools',
  '教程': 'Tutorial',
  '灵感': 'Inspiration',
  '资源': 'Resources',
  '图像编辑': 'Image Editing',
  '人像编辑': 'Portrait Editing',
  '3D转换': '3D Conversion',
  '图像转换': 'Image Transformation',
  '风格转换': 'Style Transfer',
  '图像合成': 'Image Compositing',
  '图像修复': 'Image Restoration',
  '后期': 'Post-processing',
  '动画': 'Animation',
  '广告': 'Advertising',
  '社交媒体': 'Social Media',
  '系统提示词': 'System Prompt',
  '时尚': 'Fashion',
  '生活': 'Lifestyle',
  '写实': 'Realistic',
  '技巧': 'Tips',
  '产品设计': 'Product Design',
  '产品摄影': 'Product Photography',
  '海报设计': 'Poster Design',
  '案例': 'Case Study',
  '科普': 'Popular Science'
});

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractTweetTextFromOEmbedHtml(html) {
  const source = String(html || '');
  if (!source) return '';

  const paragraphMatch = source.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  let text = paragraphMatch ? paragraphMatch[1] : source;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => !(idx === arr.length - 1 && /^[-—]\s*@?/.test(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

async function fetchXPostTextViaOEmbed(postUrl) {
  const normalizedUrl = safeTrim(postUrl).replace('twitter.com', 'x.com');
  if (!normalizedUrl) return '';

  const endpoint = new URL('https://publish.twitter.com/oembed');
  endpoint.searchParams.set('omit_script', 'true');
  endpoint.searchParams.set('dnt', 'true');
  endpoint.searchParams.set('url', normalizedUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal
    });
    if (!response.ok) return '';

    const payload = await response.json();
    const text = extractTweetTextFromOEmbedHtml(payload?.html);
    if (text.length < 20) return '';
    return text;
  } catch (error) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function ensurePostContentFallback(data) {
  if (!data || typeof data !== 'object') return;
  const hasPrompt =
    !!safeTrim(data.content) ||
    !!safeTrim(data.contentChinese) ||
    !!safeTrim(data.contentEnglish);
  if (hasPrompt) return;

  const sourceUrl = safeTrim(data.url);
  if (!sourceUrl) return;
  if (!/https?:\/\/(?:x|twitter)\.com\/[^/]+\/status\/\d+/i.test(sourceUrl)) return;

  const oembedText = await fetchXPostTextViaOEmbed(sourceUrl);
  if (oembedText) {
    data.contentChinese = oembedText;
    console.log(`[oembed] Filled missing content from post URL (${oembedText.length} chars)`);
  }
}

function splitByExplicitSeparator(contentText) {
  const text = String(contentText || '');
  if (!text.trim()) return null;

  const patterns = [
    /\r?\n\s*-{6,}\s*\r?\n/,
    /\r?\n\s*[—–-]{6,}\s*\r?\n/,
    /(?:^|\s)-{6,}(?:\s|$)/
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match || !Number.isFinite(match.index)) continue;
    const first = text.slice(0, match.index).trim();
    const second = text.slice(match.index + match[0].length).trim();
    if (!first && !second) continue;
    return { first, second, method: 'separator' };
  }
  return null;
}

function splitByLanguageBoundary(contentText) {
  const text = String(contentText || '');
  if (!/[A-Za-z]/.test(text) || !/[\u3400-\u9FFF]/.test(text)) return null;

  const firstCjk = text.search(/[\u3400-\u9FFF]/);
  const firstLatin = text.search(/[A-Za-z]/);
  if (firstCjk < 0 || firstLatin < 0 || firstCjk === firstLatin) return null;

  if (firstLatin < firstCjk) {
    let splitIndex = firstCjk;
    const nearNewline = text.lastIndexOf('\n', splitIndex);
    if (nearNewline >= 0 && splitIndex - nearNewline <= 120) {
      splitIndex = nearNewline + 1;
    }
    const first = text.slice(0, splitIndex).trim();
    const second = text.slice(splitIndex).trim();
    if (first.length >= 8 && second.length >= 8) {
      return { first, second, method: 'language-fallback' };
    }
    return null;
  }

  let splitIndex = firstLatin;
  const nearNewline = text.lastIndexOf('\n', splitIndex);
  if (nearNewline >= 0 && splitIndex - nearNewline <= 120) {
    splitIndex = nearNewline + 1;
  }
  const first = text.slice(0, splitIndex).trim();
  const second = text.slice(splitIndex).trim();
  if (first.length >= 8 && second.length >= 8) {
    return { first, second, method: 'language-fallback' };
  }
  return null;
}

function mapSplitPartsToBilingual(parts) {
  if (!parts) return null;
  const first = safeTrim(parts.first);
  const second = safeTrim(parts.second);
  if (!first && !second) return null;

  const firstHasCjk = /[\u3400-\u9FFF]/.test(first);
  const secondHasCjk = /[\u3400-\u9FFF]/.test(second);
  const firstHasLatin = /[A-Za-z]/.test(first);
  const secondHasLatin = /[A-Za-z]/.test(second);

  if (firstHasCjk && secondHasLatin && !firstHasLatin) {
    return { chinese: first, english: second, method: parts.method };
  }
  if (firstHasLatin && secondHasCjk && !secondHasLatin) {
    return { english: first, chinese: second, method: parts.method };
  }

  // Default: keep historical semantics "left = English, right = Chinese"
  return { english: first, chinese: second, method: parts.method };
}

function splitBilingualContent(contentText) {
  const explicit = splitByExplicitSeparator(contentText);
  const mappedExplicit = mapSplitPartsToBilingual(explicit);
  if (mappedExplicit) return mappedExplicit;

  const fallback = splitByLanguageBoundary(contentText);
  const mappedFallback = mapSplitPartsToBilingual(fallback);
  if (mappedFallback) return mappedFallback;

  return null;
}

function applyBilingualSplitIfNeeded(data) {
  if (!data || typeof data !== 'object') return;
  if (!safeTrim(data.content) || safeTrim(data.contentChinese) || safeTrim(data.contentEnglish)) return;

  const split = splitBilingualContent(String(data.content));
  if (!split) return;

  data.contentEnglish = split.english || '';
  data.contentChinese = split.chinese || '';
  delete data.content;
  console.log(`[split] Auto split by ${split.method || 'unknown'} strategy`);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => safeTrim(tag)).filter(Boolean);
  }
  if (typeof tags === 'string') {
    return tags.split(',').map((tag) => safeTrim(tag)).filter(Boolean);
  }
  return [];
}

function hasCjk(value) {
  return /[\u3400-\u9FFF]/.test(safeTrim(value));
}

function hasLatin(value) {
  return /[A-Za-z]/.test(safeTrim(value));
}

async function translateTextViaGoogle(text, target, source = 'auto') {
  const input = safeTrim(text);
  if (!input) return '';

  const apiUrl = new URL('https://translate.googleapis.com/translate_a/single');
  apiUrl.searchParams.set('client', 'gtx');
  apiUrl.searchParams.set('sl', source);
  apiUrl.searchParams.set('tl', target);
  apiUrl.searchParams.set('dt', 't');
  apiUrl.searchParams.set('q', input);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal
    });

    if (!response.ok) return '';
    const data = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) return '';

    return data[0]
      .map((seg) => (Array.isArray(seg) ? String(seg[0] || '') : ''))
      .join('')
      .trim();
  } catch (error) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function translateTextViaAi(text, target, source = 'auto') {
  const input = safeTrim(text);
  if (!input) return '';

  const config = loadConfig();
  if (!config?.ai?.enabled || !safeTrim(config?.ai?.apiUrl) || !safeTrim(config?.ai?.apiKey) || !safeTrim(config?.ai?.model)) {
    return '';
  }

  const targetLabel = /^zh/i.test(target) ? 'Simplified Chinese' : 'English';
  const sourceLabel = source === 'auto' ? 'auto-detect' : source;
  const prompt = [
    `Translate the text below into ${targetLabel}.`,
    `Source language hint: ${sourceLabel}.`,
    'Rules:',
    '- Return translation only.',
    '- Preserve line breaks and prompt structure.',
    '- Do not add commentary, quotation marks, or labels.',
    '',
    input
  ].join('\n');

  try {
    const response = await fetch(`${config.ai.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.apiKey}`
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: Math.min(12000, Number(config.ai.maxTokens) || 4000)
      })
    });

    if (!response.ok) return '';
    const result = await response.json();
    return extractAIContent(result);
  } catch (error) {
    return '';
  }
}

async function translateTextSmart(text, target, source = 'auto') {
  const aiResult = await translateTextViaAi(text, target, source);
  if (aiResult) return aiResult;
  return translateTextViaGoogle(text, target, source);
}

async function ensureBilingualContent(data) {
  if (!data || typeof data !== 'object') return;

  const rawContent = safeTrim(data.content);
  let chinese = safeTrim(data.contentChinese);
  let english = safeTrim(data.contentEnglish);

  if (!chinese && !english && rawContent) {
    const rawHasCjk = hasCjk(rawContent);
    const rawHasLatin = hasLatin(rawContent);
    if (rawHasLatin && !rawHasCjk) {
      english = rawContent;
    } else if (rawHasCjk && !rawHasLatin) {
      chinese = rawContent;
    }
  }

  if (english && !chinese) {
    const translated = await translateTextSmart(english, 'zh-CN', 'en');
    if (translated) chinese = translated;
  }

  if (chinese && !english) {
    const translated = await translateTextSmart(chinese, 'en', 'zh-CN');
    if (translated) english = translated;
  }

  if (chinese) data.contentChinese = chinese;
  if (english) data.contentEnglish = english;

  if (rawContent && (!hasCjk(rawContent) || !hasLatin(rawContent)) && (chinese || english)) {
    delete data.content;
  }
}

function buildMergedBilingualContent(data) {
  const english = safeTrim(data?.contentEnglish);
  const chinese = safeTrim(data?.contentChinese);
  const raw = safeTrim(data?.content);

  if (english && chinese) {
    return `${english}\n------\n${chinese}`;
  }
  return english || chinese || raw;
}

async function buildBilingualMeta(data) {
  const title = safeTrim(data.title);
  const summary = safeTrim(data.summary);

  if (title) {
    if (hasCjk(title)) {
      data.titleChinese = data.titleChinese || title;
      if (!safeTrim(data.titleEnglish)) {
        const translated = await translateTextSmart(title, 'en');
        if (translated) data.titleEnglish = translated;
      }
    } else if (hasLatin(title)) {
      data.titleEnglish = data.titleEnglish || title;
      if (!safeTrim(data.titleChinese)) {
        const translated = await translateTextSmart(title, 'zh-CN');
        if (translated) data.titleChinese = translated;
      }
    }
  }

  if (summary) {
    if (hasCjk(summary)) {
      data.summaryChinese = data.summaryChinese || summary;
      if (!safeTrim(data.summaryEnglish)) {
        const translated = await translateTextSmart(summary, 'en');
        if (translated) data.summaryEnglish = translated;
      }
    } else if (hasLatin(summary)) {
      data.summaryEnglish = data.summaryEnglish || summary;
      if (!safeTrim(data.summaryChinese)) {
        const translated = await translateTextSmart(summary, 'zh-CN');
        if (translated) data.summaryChinese = translated;
      }
    }
  }

  const rawTags = String(data.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (rawTags.length && !safeTrim(data.tagsEnglish)) {
    const mapped = rawTags.map((tag) => {
      if (!hasCjk(tag)) return tag;
      return TAG_TO_ENGLISH[tag] || tag;
    });
    data.tagsEnglish = mapped.join(',');
  }
}

// Helper function: Extract text content from AI response for different API formats
function extractAIContent(result) {
  const chunks = [];

  const appendContent = (content) => {
    if (!content) return;
    if (typeof content === 'string') {
      const trimmed = content.trim();
      if (trimmed) chunks.push(trimmed);
      return;
    }
    if (Array.isArray(content)) {
      content.forEach(item => appendContent(item));
      return;
    }
    if (typeof content === 'object') {
      if (typeof content.text === 'string') {
        appendContent(content.text);
        return;
      }
      if (Array.isArray(content.text)) {
        appendContent(content.text);
      }
      if (typeof content.content === 'string') {
        appendContent(content.content);
        return;
      }
      if (Array.isArray(content.content)) {
        appendContent(content.content);
      }
    }
  };

  if (result?.choices?.length) {
    appendContent(result.choices[0]?.message?.content);
  }

  if (!chunks.length && result?.output) {
    appendContent(result.output);
  }
  if (!chunks.length && result?.response) {
    appendContent(result.response);
  }
  if (!chunks.length && result?.result) {
    appendContent(result.result);
  }

  return chunks.join('').trim();
}

function buildWechatOptimizePrompt(content) {
  const lines = [
    'You are a Chinese copywriter. Optimize the following content for a WeChat viral-post style.',
    'Target audience: AI beginners interested in prompts, case breakdowns, and tool tutorials.',
    '',
    'Return ONLY a JSON object in this exact shape:',
    '{',
    '  "title": "20-36 Chinese characters",',
    '  "summary": "60-120 Chinese characters"',
    '}',
    '',
    'If you cannot return JSON, output in this plain format:',
    'Title: ...',
    'Summary: ...',
    '',
    'Rules:',
    '- Title must include at least ONE of: AI\u63d0\u793a\u8bcd / AI\u7ed8\u56fe / AI\u56fe\u7247\u751f\u6210.',
    '- Summary must include the main keyword and 1-2 long-tail phrases like \u65b0\u624b\u5165\u95e8 / \u6848\u4f8b\u89e3\u6790 / \u5de5\u5177\u6559\u7a0b / \u5173\u952e\u8bcd\u6e05\u5355.',
    '- Tone: clear, practical, not exaggerated marketing.',
    '',
    'Content:',
    content
  ];
  return lines.join('\n');
}

function requestWechatOptimize(config, content) {
  return new Promise((resolve, reject) => {
    if (!config || !config.ai || !config.ai.enabled) {
      resolve(null);
      return;
    }
    if (!config.ai.apiUrl || !config.ai.apiKey || !content) {
      resolve(null);
      return;
    }

    const prompt = buildWechatOptimizePrompt(content);
    const apiData = JSON.stringify({
      model: config.ai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.ai.temperature,
      max_tokens: config.ai.maxTokens,
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.apiKey}`
      }
    };

    const apiRequest = https.request(
      `${config.ai.apiUrl}/chat/completions`,
      options,
      (apiRes) => {
        let responseData = '';
        apiRes.on('data', chunk => responseData += chunk);
        apiRes.on('end', () => {
          try {
            let result = null;
            try {
              result = JSON.parse(responseData);
            } catch (error) {
              resolve(null);
              return;
            }
            const aiResponse = extractAIContent(result);
            if (!aiResponse) {
              console.warn('WeChat AI optimize: empty response text.');
              resolve(null);
              return;
            }

            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

            let parsed = null;
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[0]);
              } catch (error) {
                parsed = null;
              }
            }

            if (!parsed || typeof parsed !== 'object') {
              parsed = {};
            }

            if (!parsed.title || !parsed.summary) {
              const titleCandidate = parsed.title || parsed.Title || parsed.TITLE
                || parsed.title_suggestion || parsed.titleSuggestion
                || (Array.isArray(parsed.title_suggestions) ? parsed.title_suggestions[0] : null)
                || (Array.isArray(parsed.titleSuggestions) ? parsed.titleSuggestions[0] : null);
              const summaryCandidate = parsed.summary || parsed.Summary || parsed.SUMMARY
                || parsed.summary_suggestion || parsed.summarySuggestion
                || (Array.isArray(parsed.summary_suggestions) ? parsed.summary_suggestions[0] : null)
                || (Array.isArray(parsed.summarySuggestions) ? parsed.summarySuggestions[0] : null);

              if (!parsed.title && titleCandidate) {
                parsed.title = String(titleCandidate).trim();
              }
              if (!parsed.summary && summaryCandidate) {
                parsed.summary = String(summaryCandidate).trim();
              }
            }

            if (!parsed.title || !parsed.summary) {
              const titleMatch = aiResponse.match(/(?:^|\n)\s*["']?(?:title|\u6807\u9898)["']?\s*[:\uff1a]\s*(.+)/i);
              const summaryMatch = aiResponse.match(/(?:^|\n)\s*["']?(?:summary|\u6458\u8981)["']?\s*[:\uff1a]\s*(.+)/i);
              if (!parsed.title && titleMatch) parsed.title = titleMatch[1].trim();
              if (!parsed.summary && summaryMatch) parsed.summary = summaryMatch[1].trim();
            }

            if (!parsed.title && !parsed.summary) {
              const preview = aiResponse.length > 800 ? `${aiResponse.slice(0, 800)}...` : aiResponse;
              console.warn('WeChat AI optimize: no usable output. Raw preview:', preview);
              resolve(null);
              return;
            }

            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    apiRequest.on('error', (error) => reject(error));
    apiRequest.write(apiData);
    apiRequest.end();
  });
}

function clampText(text, maxLength) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function isLocalhostUrl(value) {
  if (!isHttpUrl(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname === '::1';
  } catch (error) {
    return false;
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function downloadRemoteFile(urlString, savePath, requestOptions = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch (error) {
      reject(new Error(`Invalid URL: ${urlString}`));
      return;
    }

    const client = parsedUrl.protocol === 'http:' ? http : https;
    const request = client.get(parsedUrl, requestOptions, (response) => {
      const statusCode = response.statusCode || 0;

      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error('Too many redirects'));
          return;
        }
        const nextUrl = new URL(response.headers.location, parsedUrl).toString();
        downloadRemoteFile(nextUrl, savePath, requestOptions, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(savePath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve({ statusCode, headers: response.headers }));
      });
      fileStream.on('error', (error) => {
        response.destroy();
        reject(error);
      });
    });

    request.on('error', reject);
    request.setTimeout(45000, () => {
      request.destroy(new Error('Download timeout'));
    });
  });
}

function resolveLocalImagePath(imagePath) {
  if (!imagePath) return '';
  if (isHttpUrl(imagePath)) {
    try {
      const parsed = new URL(imagePath);
      const cleanPath = normalizeRelativeAssetPath(parsed.pathname);
      if (!cleanPath) return '';
      return path.join(__dirname, cleanPath);
    } catch (error) {
      return '';
    }
  }

  if (path.isAbsolute(imagePath)) return imagePath;
  const cleanPath = normalizeRelativeAssetPath(imagePath);
  if (!cleanPath) return '';
  return path.join(__dirname, cleanPath);
}

function normalizeTmpfilesUrl(value) {
  if (!value || typeof value !== 'string') return '';
  let urlString = value.trim();
  if (!urlString) return '';
  if (urlString.startsWith('http://')) {
    urlString = 'https://' + urlString.slice('http://'.length);
  }

  try {
    const parsed = new URL(urlString);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts[0] === 'dl') {
      return parsed.toString();
    }
    if (parts.length >= 2) {
      parsed.pathname = `/dl/${parts[0]}/${parts.slice(1).join('/')}`;
      return parsed.toString();
    }
    return parsed.toString();
  } catch (error) {
    return urlString;
  }
}

function normalizeRelativeAssetPath(value) {
  if (!value || typeof value !== 'string') return '';
  let cleanPath = value.replace(/\\/g, '/').trim();
  if (!cleanPath) return '';
  cleanPath = cleanPath.replace(/^(\.\/)+/, '');
  cleanPath = cleanPath.replace(/^(\.\.\/)+/, '');
  cleanPath = cleanPath.replace(/^\/+/, '');
  return cleanPath;
}

function uploadToTmpfiles(filePath) {
  return new Promise((resolve, reject) => {
    const apiUrl = 'https://tmpfiles.org/api/v1/upload';
    const boundary = `----tmpfiles-${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const filename = path.basename(filePath);
    const mimeType = getMimeType(filePath);

    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(filePath);
    } catch (error) {
      reject(error);
      return;
    }

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
      'utf8'
    );
    const ending = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([preamble, fileBuffer, ending]);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = https.request(apiUrl, options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          const url = parsed && parsed.data && parsed.data.url ? parsed.data.url : '';
          const normalized = normalizeTmpfilesUrl(url);
          if (parsed && parsed.status === 'success' && isHttpUrl(normalized)) {
            resolve(normalized);
          } else {
            reject(new Error(`Tmpfiles upload failed: ${responseData.trim() || 'empty response'}`));
          }
        } catch (error) {
          reject(new Error(`Tmpfiles upload failed: ${responseData.trim() || error.message}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(body);
    req.end();
  });
}

function rewriteUrlWithBase(value, baseUrl) {
  if (!baseUrl) return value;
  try {
    const parsedBase = new URL(baseUrl);
    const parsedValue = new URL(value);
    return `${parsedBase.origin}${parsedValue.pathname}${parsedValue.search}${parsedValue.hash}`;
  } catch (error) {
    return value;
  }
}

function resolveAssetUrl(value, baseUrl) {
  if (!value) return '';
  if (isHttpUrl(value)) {
    if (baseUrl && isLocalhostUrl(value)) {
      return rewriteUrlWithBase(value, baseUrl);
    }
    return value;
  }
  if (!baseUrl) return value;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  try {
    const cleanPath = normalizeRelativeAssetPath(value);
    return new URL(cleanPath, normalizedBase).toString();
  } catch (error) {
    return value;
  }
}

function buildSummaryFallback(item) {
  const parts = [];
  if (item.summary) parts.push(item.summary);
  if (item.contentChinese) parts.push(item.contentChinese);
  if (item.contentEnglish) parts.push(item.contentEnglish);
  if (item.content) parts.push(item.content);
  const combined = parts.join(' ').replace(/\s+/g, ' ').trim();
  return clampText(combined, 120);
}

function buildWechatMarkdown(item, baseUrl) {
  const sections = [];

  if (item.summary && item.summary.trim()) {
    sections.push(item.summary.trim(), '');
  }

  const hasChinese = item.contentChinese && item.contentChinese.trim();
  const hasEnglish = item.contentEnglish && item.contentEnglish.trim();

  if (hasChinese) {
    sections.push('## Chinese', item.contentChinese.trim(), '');
  }
  if (hasEnglish) {
    sections.push('## English', item.contentEnglish.trim(), '');
  }
  if (!hasChinese && !hasEnglish && item.content && item.content.trim()) {
    sections.push(item.content.trim(), '');
  }

  if (Array.isArray(item.images) && item.images.length > 0) {
    sections.push('## Images');
    item.images.forEach((image, index) => {
      const imageUrl = resolveAssetUrl(image, baseUrl);
      if (isHttpUrl(imageUrl)) {
        sections.push(`![Image ${index + 1}](${imageUrl})`);
      }
    });
    sections.push('');
  }

  if (Array.isArray(item.videos) && item.videos.length > 0) {
    sections.push('## Videos');
    item.videos.forEach((video, index) => {
      const videoUrl = resolveAssetUrl(video, baseUrl);
      if (isHttpUrl(videoUrl)) {
        sections.push(`- Video ${index + 1}: ${videoUrl}`);
      }
    });
    sections.push('');
  }

  return sections.join('\n').trim();
}

function formatHtmlText(text) {
  if (!text) return '';
  return text.replace(/\r?\n/g, '<br>');
}

function buildWechatHtml(item, baseUrl) {
  const sections = [];

  if (item.summary && item.summary.trim()) {
    sections.push(`<p>${formatHtmlText(item.summary.trim())}</p>`);
  }

  const hasChinese = item.contentChinese && item.contentChinese.trim();
  const hasEnglish = item.contentEnglish && item.contentEnglish.trim();

  if (hasChinese) {
    sections.push(`<h2>Chinese</h2><p>${formatHtmlText(item.contentChinese.trim())}</p>`);
  }
  if (hasEnglish) {
    sections.push(`<h2>English</h2><p>${formatHtmlText(item.contentEnglish.trim())}</p>`);
  }
  if (!hasChinese && !hasEnglish && item.content && item.content.trim()) {
    sections.push(`<p>${formatHtmlText(item.content.trim())}</p>`);
  }

  if (Array.isArray(item.images) && item.images.length > 0) {
    sections.push('<h2>Images</h2>');
    item.images.forEach((image, index) => {
      const imageUrl = resolveAssetUrl(image, baseUrl);
      if (isHttpUrl(imageUrl)) {
        sections.push(`<p><img src="${imageUrl}" alt="Image ${index + 1}"></p>`);
      }
    });
  }

  if (Array.isArray(item.videos) && item.videos.length > 0) {
    sections.push('<h2>Videos</h2>');
    item.videos.forEach((video, index) => {
      const videoUrl = resolveAssetUrl(video, baseUrl);
      if (isHttpUrl(videoUrl)) {
        sections.push(`<p>Video ${index + 1}: <a href="${videoUrl}">${videoUrl}</a></p>`);
      }
    });
  }

  return sections.join('\n').trim();
}

function buildWechatContent(item, baseUrl, contentFormat) {
  if (contentFormat === 'html') {
    return buildWechatHtml(item, baseUrl);
  }
  return buildWechatMarkdown(item, baseUrl);
}

async function resolveWechatImages(item, wechatConfig, options = {}) {
  const images = Array.isArray(item.images) ? item.images : [];
  const results = [];
  const useTempStorage = Boolean(options.useTempStorage);

  for (const image of images) {
    if (isHttpUrl(image) && !isLocalhostUrl(image)) {
      results.push(image);
      continue;
    }

    if (useTempStorage) {
      const localPath = resolveLocalImagePath(image);
      if (localPath && fs.existsSync(localPath)) {
        try {
          const uploadedUrl = await uploadToTmpfiles(localPath);
          if (uploadedUrl) {
            results.push(uploadedUrl);
            continue;
          }
        } catch (error) {
          console.warn('Tmpfiles upload failed:', error.message);
        }
      }
    }

    const fallback = resolveAssetUrl(image, wechatConfig.publicBaseUrl);
    if (isHttpUrl(fallback) && !isLocalhostUrl(fallback)) {
      results.push(fallback);
    }
  }

  return results;
}

function loadContentItemById(id) {
  if (id === undefined || id === null) return null;
  const dataPath = path.join(__dirname, 'data/contents.json');
  if (!fs.existsSync(dataPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const items = Array.isArray(data.items) ? data.items : [];
    return items.find((item) => String(item.id) === String(id)) || null;
  } catch (error) {
    console.error('Failed to read content data:', error);
    return null;
  }
}

function loadContentItemByUrl(targetUrl) {
  if (!targetUrl) return null;
  const dataPath = path.join(__dirname, 'data/contents.json');
  if (!fs.existsSync(dataPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const items = Array.isArray(data.items) ? data.items : [];
    return findContentItemByUrl(items, targetUrl);
  } catch (error) {
    console.error('Failed to read content data:', error);
    return null;
  }
}

function normalizeUrlForCompare(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (error) {
    return trimmed;
  }
}

function findContentItemByUrl(items, targetUrl) {
  if (!Array.isArray(items) || !targetUrl) return null;
  const normalizedTarget = normalizeUrlForCompare(targetUrl);
  if (!normalizedTarget) return null;
  return items.find((item) => {
    if (!item || !item.url) return false;
    return normalizeUrlForCompare(item.url) === normalizedTarget;
  }) || null;
}

function postJsonRequest(urlString, headers, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const urlObject = new URL(urlString);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    };

    const apiRequest = https.request(urlObject, options, (apiRes) => {
      let responseData = '';
      apiRes.on('data', (chunk) => responseData += chunk);
      apiRes.on('end', () => {
        resolve({
          statusCode: apiRes.statusCode || 500,
          body: responseData
        });
      });
    });

    apiRequest.on('error', (error) => {
      reject(error);
    });

    apiRequest.write(body);
    apiRequest.end();
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', (error) => reject(error));
  });
}

function toAbsolutePath(p) {
  if (!p || typeof p !== 'string') return '';
  if (path.isAbsolute(p)) return p;
  return path.join(__dirname, normalizeRelativeAssetPath(p));
}

function resolveLocalVideoPath(videoPath) {
  if (!videoPath) return '';
  if (isHttpUrl(videoPath)) {
    try {
      const parsed = new URL(videoPath);
      const cleanPath = normalizeRelativeAssetPath(parsed.pathname);
      if (!cleanPath) return '';
      return path.join(__dirname, cleanPath);
    } catch (error) {
      return '';
    }
  }

  return toAbsolutePath(videoPath);
}

function trimToLength(text, maxLength) {
  const normalized = safeTrim(text);
  if (!normalized) return '';
  if (!maxLength || normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).trim();
}

function extractJsonFromText(text) {
  const input = safeTrim(text);
  if (!input) return null;
  const jsonMatch = input.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    return null;
  }
}

function pickFirstCandidateValue(parsed, keys) {
  if (!parsed || typeof parsed !== 'object') return '';
  for (const key of keys) {
    const value = parsed[key];
    if (typeof value === 'string' && safeTrim(value)) {
      return safeTrim(value);
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value.find((item) => typeof item === 'string' && safeTrim(item));
      if (first) return safeTrim(first);
    }
  }
  return '';
}

function stripXhsTitlePrefix(text) {
  let value = safeTrim(text);
  if (!value) return '';

  value = value
    .replace(/^(?:趋势|案例|Case|CASE|Trend|TREND)\s*#?\s*\d+\s*[:：\-]\s*/i, '')
    .replace(/^#\s*\d+\s*[:：\-]\s*/i, '')
    .replace(/^\d+\s*[:：\-]\s*/i, '')
    .replace(/^(?:小红书|XHS|MeiGen|Meigen)\s*[:：\-]\s*/i, '')
    .trim();

  return value;
}

function normalizeXhsTitleSeed(item, payloadTitle) {
  return stripXhsTitlePrefix(
    safeTrim(payloadTitle)
    || safeTrim(item?.titleChinese)
    || safeTrim(item?.title)
    || safeTrim(item?.caseNumber)
    || ''
  );
}

function finalizeXhsTitle(text) {
  let value = stripXhsTitlePrefix(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^["'“”‘’【\[]+|["'“”‘’】\]]+$/g, '')
    .trim();

  if (!value) return '';
  if (!/(AI|Prompt|提示词)/i.test(value)) {
    value = `${value}AI提示词`;
  }
  return trimToLength(value, 20);
}

function loadXhsViralTitlePrompt(skillRoot) {
  const root = safeTrim(skillRoot) || XHS_VIRAL_TITLE_SKILL_ROOT;
  const promptPath = path.join(root, 'references', 'title_prompt.md');
  try {
    if (!fs.existsSync(promptPath)) return '';
    return fs.readFileSync(promptPath, 'utf8');
  } catch (error) {
    return '';
  }
}

function buildXhsViralTitlePrompt(item, baseTitle, content, skillRoot) {
  const template = loadXhsViralTitlePrompt(skillRoot);
  const summary = safeTrim(item?.summaryChinese)
    || safeTrim(item?.summary)
    || safeTrim(item?.summaryEnglish);
  const tags = normalizeTags(item?.tags).join(', ');
  const sourceUrl = safeTrim(item?.url);
  const contentPreview = trimToLength(
    safeTrim(item?.contentChinese)
    || safeTrim(item?.content)
    || safeTrim(item?.contentEnglish)
    || safeTrim(content),
    2400
  );

  const fallbackPrompt = [
    '你现在是“小红书爆款标题编辑”，只负责输出一个最终中文标题。',
    '返回 JSON：{"title":"最终标题"}',
    '规则：',
    '- 14-20 个中文字符为佳，硬上限 20 字。',
    '- 删除趋势编号/案例编号/来源站点痕迹。',
    '- 保留原始题材，不要跑题。',
    '- 如果是提示词/案例拆解/AI绘图内容，优先自然融入 AI提示词 / AI绘图 / Prompt。',
    '- 只输出一个最终标题，不要多个候选。',
    '',
    `原始标题：${baseTitle}`,
    `摘要：${summary}`,
    `正文关键信息：${contentPreview}`,
    `标签：${tags}`,
    `来源链接：${sourceUrl}`
  ].join('\n');

  if (!template) return fallbackPrompt;

  return template
    .replaceAll('{{BASE_TITLE}}', baseTitle || '')
    .replaceAll('{{SUMMARY}}', summary || '')
    .replaceAll('{{CONTENT}}', contentPreview || '')
    .replaceAll('{{TAGS}}', tags || '')
    .replaceAll('{{SOURCE_URL}}', sourceUrl || '');
}

function requestXhsTitleOptimize(config, item, title, content, skillRoot) {
  return new Promise((resolve, reject) => {
    if (!config || !config.ai || !config.ai.enabled) {
      resolve(null);
      return;
    }
    if (!config.ai.apiUrl || !config.ai.apiKey) {
      resolve(null);
      return;
    }

    const prompt = buildXhsViralTitlePrompt(item, title, content, skillRoot);
    const apiData = JSON.stringify({
      model: config.ai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.ai.temperature,
      max_tokens: Math.min(Number(config.ai.maxTokens) || 2000, 4000)
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.apiKey}`
      }
    };

    const apiRequest = https.request(
      `${config.ai.apiUrl}/chat/completions`,
      options,
      (apiRes) => {
        let responseData = '';
        apiRes.on('data', (chunk) => responseData += chunk);
        apiRes.on('end', () => {
          try {
            const result = JSON.parse(responseData);
            const aiResponse = extractAIContent(result);
            if (!aiResponse) {
              console.warn('XHS AI optimize: empty response text.');
              resolve(null);
              return;
            }

            const parsed = extractJsonFromText(aiResponse) || {};
            let candidate = pickFirstCandidateValue(parsed, [
              'title',
              'Title',
              'TITLE',
              'headline',
              'Headline',
              'final_title',
              'finalTitle',
              'best_title',
              'bestTitle',
              'title_suggestion',
              'titleSuggestion',
              'title_suggestions',
              'titleSuggestions',
              'titles',
              'options'
            ]);

            if (!candidate) {
              const titleMatch = aiResponse.match(/(?:^|\n)\s*["']?(?:title|标题)["']?\s*[:：]\s*(.+)/i);
              if (titleMatch) {
                candidate = safeTrim(titleMatch[1]);
              }
            }

            const finalTitle = finalizeXhsTitle(candidate);
            if (!finalTitle) {
              const preview = aiResponse.length > 500 ? `${aiResponse.slice(0, 500)}...` : aiResponse;
              console.warn('XHS AI optimize: no usable title. Raw preview:', preview);
              resolve(null);
              return;
            }

            resolve({ title: finalTitle, raw: aiResponse });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    apiRequest.on('error', (error) => reject(error));
    apiRequest.write(apiData);
    apiRequest.end();
  });
}

function buildXhsTitle(item, payloadTitle) {
  const preferred = normalizeXhsTitleSeed(item, payloadTitle) || 'AI提示词案例分享';
  return finalizeXhsTitle(preferred);
}

function buildXhsTagList(item, forcePromptTag) {
  const tags = normalizeTags(item?.tags)
    .slice(0, 4)
    .map((tag) => `#${String(tag || '').replace(/\s+/g, '')}`)
    .filter(Boolean);
  if (forcePromptTag && !tags.some((tag) => /^#prompt$/i.test(tag))) {
    tags.unshift('#prompt');
  }
  return tags.slice(0, 5);
}

function buildXhsPromptBody(item, payloadContent) {
  if (safeTrim(payloadContent)) return safeTrim(payloadContent);
  if (safeTrim(item?.contentChinese)) return item.contentChinese.trim();
  if (safeTrim(item?.content)) return item.content.trim();
  if (safeTrim(item?.contentEnglish)) return item.contentEnglish.trim();
  if (safeTrim(item?.summaryChinese)) return item.summaryChinese.trim();
  if (safeTrim(item?.summary)) return item.summary.trim();
  return '';
}

function buildXhsSummaryBody(item, fullPrompt) {
  const summary = safeTrim(item?.summaryChinese) || safeTrim(item?.summary);
  if (summary) return summary;

  const title = safeTrim(item?.title) || 'AI提示词案例';
  const promptPreview = trimToLength(fullPrompt, 260);
  return `${title}\n\n这组内容适合做 AI 出图参考，完整提示词已整理到最后一页图片，方便保存和复用。\n\n${promptPreview}`;
}

function buildXhsContentPlan(item, payloadContent, options = {}) {
  const forcePromptTag = options.forcePromptTag !== false;
  const tagsText = buildXhsTagList(item, forcePromptTag).join(' ');
  const fullPrompt = buildXhsPromptBody(item, payloadContent);

  if (!fullPrompt) {
    return {
      content: tagsText,
      fullPrompt: '',
      shouldCreatePromptCard: false
    };
  }

  const fullContent = [fullPrompt, tagsText].filter(Boolean).join('\n\n').trim();
  if (fullContent.length <= XHS_LONG_PROMPT_THRESHOLD) {
    return {
      content: trimToLength(fullContent, XHS_CONTENT_LIMIT),
      fullPrompt,
      shouldCreatePromptCard: false
    };
  }

  const summaryBody = trimToLength(buildXhsSummaryBody(item, fullPrompt), 720);
  const content = [
    summaryBody,
    '完整提示词见最后一页图片。',
    tagsText
  ].filter(Boolean).join('\n\n').trim();

  return {
    content: trimToLength(content, XHS_CONTENT_LIMIT),
    fullPrompt,
    shouldCreatePromptCard: true
  };
}

function buildXhsContent(item, payloadContent, options = {}) {
  return buildXhsContentPlan(item, payloadContent, options).content;
}

async function createXhsPromptCardImage(pythonCmd, tempDir, key, title, promptText) {
  const prompt = safeTrim(promptText);
  if (!prompt) return '';

  const inputFile = path.join(tempDir, `prompt-card-${key}.json`);
  const outputFile = path.join(tempDir, `prompt-card-${key}.png`);
  fs.writeFileSync(inputFile, JSON.stringify({
    title: safeTrim(title) || '完整提示词',
    prompt
  }), 'utf8');

  const script = String.raw`
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

input_path, output_path = sys.argv[1], sys.argv[2]
with open(input_path, "r", encoding="utf-8") as f:
    data = json.load(f)

title = str(data.get("title") or "完整提示词").strip()
prompt = str(data.get("prompt") or "").strip()

font_candidates = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
]

def load_font(size):
    for font_path in font_candidates:
        if os.path.exists(font_path):
            return ImageFont.truetype(font_path, size)
    return ImageFont.load_default()

width = 1242
margin = 76
title_font = load_font(56)
body_font = load_font(32)
small_font = load_font(26)
line_gap = 14
max_width = width - margin * 2

probe = Image.new("RGB", (width, 200), "white")
draw = ImageDraw.Draw(probe)

def text_width(text, font):
    if not text:
        return 0
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0]

def wrap_paragraph(text, font, max_line_width):
    lines = []
    current = ""
    for ch in text:
        candidate = current + ch
        if current and text_width(candidate, font) > max_line_width:
            lines.append(current)
            current = ch
        else:
            current = candidate
    lines.append(current)
    return lines

def wrap_text(text, font, max_line_width):
    lines = []
    for paragraph in text.splitlines():
        if not paragraph.strip():
            lines.append("")
            continue
        lines.extend(wrap_paragraph(paragraph, font, max_line_width))
    return lines

title_lines = wrap_text(title, title_font, max_width)
body_lines = wrap_text(prompt, body_font, max_width)
line_height = body_font.size + line_gap
height = margin + len(title_lines) * 72 + 120 + len(body_lines) * line_height + margin
height = max(1600, height)

image = Image.new("RGB", (width, height), (255, 250, 238))
draw = ImageDraw.Draw(image)

for y in range(height):
    ratio = y / max(1, height - 1)
    r = int(255 * (1 - ratio) + 245 * ratio)
    g = int(250 * (1 - ratio) + 238 * ratio)
    b = int(238 * (1 - ratio) + 214 * ratio)
    draw.line([(0, y), (width, y)], fill=(r, g, b))

draw.rounded_rectangle([38, 38, width - 38, height - 38], radius=42, fill=(255, 255, 248), outline=(226, 190, 112), width=4)

y = margin
for line in title_lines:
    draw.text((margin, y), line, fill=(54, 43, 30), font=title_font)
    y += 72
y += 12
draw.rounded_rectangle([margin, y, margin + 220, y + 46], radius=23, fill=(54, 43, 30))
draw.text((margin + 28, y + 7), "完整提示词", fill=(255, 246, 218), font=small_font)
y += 78

for line in body_lines:
    draw.text((margin, y), line, fill=(42, 42, 42), font=body_font)
    y += line_height

image.save(output_path, "PNG")
`;

  const result = await runCommandWithOutput(pythonCmd || 'python', ['-c', script, inputFile, outputFile], {
    cwd: __dirname,
    timeoutMs: 60 * 1000
  });

  try { fs.unlinkSync(inputFile); } catch (error) {}

  if (result.code !== 0 || !fs.existsSync(outputFile)) {
    throw new Error(`Failed to create XHS prompt card: ${result.stderr || result.stdout || result.code}`);
  }

  return outputFile;
}

function normalizeScheduleHours(value, fallbackValue) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallbackValue;
  return num;
}

function resolveXhsScheduleAccountKey(payload, config) {
  const account = safeTrim(payload?.account) || safeTrim(config?.xhs?.account) || 'default';
  return account.toLowerCase();
}

function getXhsAccountLastScheduledAt(state, accountKey) {
  const key = String(accountKey || '').trim().toLowerCase();
  if (!key) return '';
  const value = state?.accounts?.[key]?.lastScheduledAt;
  return safeTrim(value);
}

function setXhsAccountLastScheduledAt(state, accountKey, scheduledAt) {
  const key = String(accountKey || '').trim().toLowerCase() || 'default';
  const normalized = normalizeXhsSchedulerState(state);
  normalized.accounts[key] = {
    ...normalized.accounts[key],
    lastScheduledAt: scheduledAt
  };
  normalized.updatedAt = new Date().toISOString();
  return normalized;
}

async function releaseXhsScheduledTime(accountKey, scheduledAt, previousScheduledAt) {
  if (!scheduledAt) return;

  await withXhsSchedulerLock(async () => {
    const state = loadXhsSchedulerState();
    const key = String(accountKey || '').trim().toLowerCase() || 'default';
    const currentScheduledAt = getXhsAccountLastScheduledAt(state, key);

    if (currentScheduledAt !== scheduledAt) {
      return;
    }

    const normalized = normalizeXhsSchedulerState(state);
    const previousValue = safeTrim(previousScheduledAt);
    if (previousValue) {
      normalized.accounts[key] = {
        ...normalized.accounts[key],
        lastScheduledAt: previousValue
      };
    } else {
      delete normalized.accounts[key];
    }
    saveXhsSchedulerState(normalized);
  });
}

function getRandomXhsIntervalMs(xhsConfig) {
  const minHours = normalizeScheduleHours(xhsConfig?.scheduleMinHours, 2);
  const maxHours = Math.max(minHours, normalizeScheduleHours(xhsConfig?.scheduleMaxHours, 3));
  const randomHours = minHours + (Math.random() * (maxHours - minHours));
  return Math.round(randomHours * 60 * 60 * 1000);
}

function getXhsMinimumIntervalMs(xhsConfig) {
  return Math.round(normalizeScheduleHours(xhsConfig?.scheduleMinHours, 2) * 60 * 60 * 1000);
}

function formatLocalDateTimeForXhs(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function computeNextXhsPlatformScheduledAt(config, state, accountKey) {
  const xhsConfig = config?.xhs || {};
  const lastScheduledAt = Date.parse(getXhsAccountLastScheduledAt(state, accountKey) || '') || 0;
  const baseTime = Math.max(Date.now(), lastScheduledAt);
  return new Date(baseTime + getRandomXhsIntervalMs(xhsConfig)).toISOString();
}

async function allocateXhsScheduledTime(payload, config, requestedPostTime) {
  return withXhsSchedulerLock(async () => {
    const schedulerState = loadXhsSchedulerState();
    const accountKey = resolveXhsScheduleAccountKey(payload, config);
    const xhsConfig = config?.xhs || {};
    const lastScheduledAt = Date.parse(getXhsAccountLastScheduledAt(schedulerState, accountKey) || '') || 0;
    const previousScheduledAt = getXhsAccountLastScheduledAt(schedulerState, accountKey);
    let scheduledAt = '';

    if (requestedPostTime) {
      const parsed = new Date(requestedPostTime.replace(' ', 'T'));
      if (!Number.isFinite(parsed.getTime())) {
        throw new Error(`Invalid postTime: ${requestedPostTime}`);
      }
      const minimumScheduledAt = lastScheduledAt ? lastScheduledAt + getXhsMinimumIntervalMs(xhsConfig) : 0;
      scheduledAt = new Date(Math.max(parsed.getTime(), minimumScheduledAt)).toISOString();
    } else {
      scheduledAt = computeNextXhsPlatformScheduledAt(config, schedulerState, accountKey);
    }

    const postTime = formatLocalDateTimeForXhs(scheduledAt);
    const nextState = setXhsAccountLastScheduledAt(schedulerState, accountKey, scheduledAt);
    saveXhsSchedulerState(nextState);

    return {
      accountKey,
      scheduledAt,
      previousScheduledAt,
      postTime
    };
  });
}

function resolveXhsMedia(item, xhsConfig, globalConfig, options = {}) {
  const preferredMedia = safeTrim(options.preferredMedia).toLowerCase();
  const publicBase = safeTrim(xhsConfig?.publicBaseUrl) || safeTrim(globalConfig?.wechat?.publicBaseUrl);
  const result = {
    mode: '',
    localImages: [],
    remoteImages: [],
    localVideo: '',
    remoteVideo: ''
  };

  const images = Array.isArray(item?.images) ? item.images : [];
  for (const image of images) {
    if (isHttpUrl(image)) {
      if (!isLocalhostUrl(image)) {
        result.remoteImages.push(image);
        continue;
      }
      const localPath = resolveLocalImagePath(image);
      if (localPath && fs.existsSync(localPath)) {
        result.localImages.push(localPath);
        continue;
      }
      const rewritten = resolveAssetUrl(image, publicBase);
      if (isHttpUrl(rewritten) && !isLocalhostUrl(rewritten)) {
        result.remoteImages.push(rewritten);
      }
      continue;
    }

    const localPath = resolveLocalImagePath(image);
    if (localPath && fs.existsSync(localPath)) {
      result.localImages.push(localPath);
      continue;
    }
    const rewritten = resolveAssetUrl(image, publicBase);
    if (isHttpUrl(rewritten) && !isLocalhostUrl(rewritten)) {
      result.remoteImages.push(rewritten);
    }
  }

  const videos = Array.isArray(item?.videos) ? item.videos : [];
  const primaryVideo = videos.find(Boolean);

  const imageMedia = {};
  const videoMedia = {};

  if (result.localImages.length > 0) {
    imageMedia.mode = 'images-local';
    imageMedia.localImages = result.localImages;
  } else if (result.remoteImages.length > 0) {
    imageMedia.mode = 'images-remote';
    imageMedia.remoteImages = result.remoteImages;
  }

  if (primaryVideo) {
    if (isHttpUrl(primaryVideo)) {
      if (!isLocalhostUrl(primaryVideo)) {
        videoMedia.mode = 'video-remote';
        videoMedia.remoteVideo = primaryVideo;
      } else {
        const localVideo = resolveLocalVideoPath(primaryVideo);
        if (localVideo && fs.existsSync(localVideo)) {
          videoMedia.mode = 'video-local';
          videoMedia.localVideo = localVideo;
        } else {
          const rewritten = resolveAssetUrl(primaryVideo, publicBase);
          if (isHttpUrl(rewritten) && !isLocalhostUrl(rewritten)) {
            videoMedia.mode = 'video-remote';
            videoMedia.remoteVideo = rewritten;
          }
        }
      }
    } else {
      const localVideo = resolveLocalVideoPath(primaryVideo);
      if (localVideo && fs.existsSync(localVideo)) {
        videoMedia.mode = 'video-local';
        videoMedia.localVideo = localVideo;
      }
    }
  }

  const applyImage = () => {
    if (!imageMedia.mode) return false;
    result.mode = imageMedia.mode;
    result.localImages = imageMedia.localImages || [];
    result.remoteImages = imageMedia.remoteImages || [];
    return true;
  };
  const applyVideo = () => {
    if (!videoMedia.mode) return false;
    result.mode = videoMedia.mode;
    result.localVideo = videoMedia.localVideo || '';
    result.remoteVideo = videoMedia.remoteVideo || '';
    return true;
  };

  if (preferredMedia === 'video') {
    if (applyVideo()) return result;
    applyImage();
    return result;
  }
  if (preferredMedia === 'image') {
    if (applyImage()) return result;
    applyVideo();
    return result;
  }

  // Auto strategy: prefer images first, fallback to video.
  if (applyImage()) return result;
  applyVideo();
  return result;
}

function runCommandWithOutput(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8 * 60 * 1000;
    const child = spawn(command, args, {
      cwd: options.cwd || __dirname,
      shell: false,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: typeof code === 'number' ? code : -1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

async function runXhsPublish(payload, item, config) {
  const xhsConfig = config.xhs || {};
  const pythonCmd = safeTrim(payload.pythonCmd) || safeTrim(xhsConfig.pythonCmd) || 'python';
  const skillRoot = safeTrim(payload.skillRoot) || safeTrim(xhsConfig.skillRoot) || XHS_DEFAULT_SKILL_ROOT;
  const viralTitleSkillRoot = safeTrim(payload.viralTitleSkillRoot) || safeTrim(xhsConfig.viralTitleSkillRoot) || XHS_VIRAL_TITLE_SKILL_ROOT;
  const scriptPath = path.join(skillRoot, 'scripts', 'xhs_auto_pipeline.py');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`xhs_auto_pipeline.py not found: ${scriptPath}`);
  }

  const autoOptimizeTitle = payload.autoOptimizeTitle === true
    || payload.autoOptimizeTitle === 'true'
    || payload.autoOptimizeTitle === 1
    || payload.autoOptimizeTitle === '1'
    || (payload.autoOptimizeTitle === undefined && xhsConfig.autoOptimizeTitle !== false);
  const forcePromptTag = payload.forcePromptTag === true
    || payload.forcePromptTag === 'true'
    || payload.forcePromptTag === 1
    || payload.forcePromptTag === '1'
    || (payload.forcePromptTag === undefined && xhsConfig.forcePromptTag !== false);

  let title = buildXhsTitle(item, payload.title);
  const contentPlan = buildXhsContentPlan(item, payload.content, { forcePromptTag });
  const content = contentPlan.content;
  if (!title || !content) {
    throw new Error('XHS title/content is empty');
  }

  if (autoOptimizeTitle) {
    try {
      const optimized = await requestXhsTitleOptimize(config, item, title, content, viralTitleSkillRoot);
      if (optimized && optimized.title) {
        title = optimized.title;
        console.log('XHS AI optimize title:', title);
      } else {
        console.warn('XHS AI optimize skipped: no usable title returned.');
      }
    } catch (error) {
      console.warn('XHS AI optimize failed:', error.message);
    }
  }

  const preferredMedia = safeTrim(payload.preferredMedia || payload.mediaType).toLowerCase();
  const media = resolveXhsMedia(item, xhsConfig, config, { preferredMedia });
  if (!media.mode) {
    throw new Error('No usable image/video found for XHS publish');
  }

  const tempDir = path.join(__dirname, 'tmp', 'xhs');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const key = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const titleFile = path.join(tempDir, `title-${key}.txt`);
  const contentFile = path.join(tempDir, `content-${key}.txt`);
  let promptCardPath = '';
  if (contentPlan.shouldCreatePromptCard && media.mode === 'images-local') {
    promptCardPath = await createXhsPromptCardImage(pythonCmd, tempDir, key, title, contentPlan.fullPrompt);
    media.localImages = [...media.localImages, promptCardPath];
  }
  fs.writeFileSync(titleFile, title, 'utf8');
  fs.writeFileSync(contentFile, content, 'utf8');

  const args = [scriptPath, 'publish', '--title-file', titleFile, '--content-file', contentFile];
  if (media.mode === 'images-local') {
    args.push('--images', ...media.localImages.map((p) => toAbsolutePath(p)));
  } else if (media.mode === 'images-remote') {
    args.push('--image-urls', ...media.remoteImages);
  } else if (media.mode === 'video-local') {
    args.push('--video', toAbsolutePath(media.localVideo));
  } else if (media.mode === 'video-remote') {
    args.push('--video-url', media.remoteVideo);
  }

  const headless = payload.headless !== undefined ? Boolean(payload.headless) : Boolean(xhsConfig.headless);
  if (headless) args.push('--headless');

  const account = safeTrim(payload.account) || safeTrim(xhsConfig.account);
  if (account) {
    args.push('--account', account);
  }

  const postTime = safeTrim(payload.postTime);
  if (postTime) {
    args.push('--post-time', postTime);
  }

  const commandResult = await runCommandWithOutput(pythonCmd, args, {
    cwd: skillRoot,
    timeoutMs: 8 * 60 * 1000
  });

  try { fs.unlinkSync(titleFile); } catch (error) {}
  try { fs.unlinkSync(contentFile); } catch (error) {}
  if (promptCardPath) {
    try { fs.unlinkSync(promptCardPath); } catch (error) {}
  }

  return {
    ...commandResult,
    mediaMode: media.mode,
    title,
    postTime,
    contentPreview: trimToLength(content, 120),
    promptCard: Boolean(promptCardPath)
  };
}

async function runXhsCheckLogin(payload, config) {
  const xhsConfig = config.xhs || {};
  const pythonCmd = safeTrim(payload.pythonCmd) || safeTrim(xhsConfig.pythonCmd) || 'python';
  const skillRoot = safeTrim(payload.skillRoot) || safeTrim(xhsConfig.skillRoot) || XHS_DEFAULT_SKILL_ROOT;
  const scriptPath = path.join(skillRoot, 'scripts', 'xhs_auto_pipeline.py');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`xhs_auto_pipeline.py not found: ${scriptPath}`);
  }

  const args = [scriptPath, 'test-browser', '--action', 'check-login'];
  return runCommandWithOutput(pythonCmd, args, { cwd: skillRoot, timeoutMs: 2 * 60 * 1000 });
}


function getNextCaseNumber() {
  try {
    if (!fs.existsSync(COLLECTION_FILE)) {
      return '案例001';
    }

    const content = fs.readFileSync(COLLECTION_FILE, 'utf-8');
    const matches = content.match(/- \*\*编号\*\*:\s*案例(\d+)/g);

    if (!matches || matches.length === 0) {
      return '案例001';
    }

    // 提取所有编号
    const numbers = matches.map(match => {
      const num = match.match(/案例(\d+)/);
      return num ? parseInt(num[1]) : 0;
    });

    // 找到最大编号
    const maxNumber = Math.max(...numbers);
    const nextNumber = maxNumber + 1;

    // 格式化为3位数字
    return `案例${String(nextNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('获取编号失败:', error);
    return '案例001';
  }
}

const server = http.createServer({ maxHeaderSize: 1024 * 1024 }, (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API: Status check endpoint (for extension)
  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // API: Get config
  if (pathname === '/api/config' && req.method === 'GET') {
    const config = loadConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // API: Save config
  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const incomingConfig = JSON.parse(body);
        const currentConfig = loadConfig();
        const mergedConfig = {
          ...currentConfig,
          ...incomingConfig,
          ai: {
            ...currentConfig.ai,
            ...(incomingConfig.ai || {})
          },
          wechat: {
            ...currentConfig.wechat,
            ...(incomingConfig.wechat || {})
          },
          xhs: {
            ...currentConfig.xhs,
            ...(incomingConfig.xhs || {})
          }
        };
        saveConfig(mergedConfig);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: '配置保存成功' }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: error.message }));
      }
    });
    return;
  }

  // API: Test AI connection
  if (pathname === '/api/test-ai' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { apiUrl, apiKey, model } = JSON.parse(body);

        const testData = JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        });

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        };

        const apiRequest = https.request(
          `${apiUrl}/chat/completions`,
          options,
          (apiRes) => {
            let responseData = '';
            apiRes.on('data', chunk => responseData += chunk);
            apiRes.on('end', () => {
              if (apiRes.statusCode === 200) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  error: `API返回错误: ${apiRes.statusCode}`
                }));
              }
            });
          }
        );

        apiRequest.on('error', (error) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        });

        apiRequest.write(testData);
        apiRequest.end();
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: WeChat accounts
  if (pathname === '/api/wechat-accounts' && (req.method === 'GET' || req.method === 'POST')) {
    const config = loadConfig();
    const wechatConfig = config.wechat || {};

    const respondAccounts = (apiKey, apiBaseUrl) => {
      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'WeChat API key is missing' }));
        return;
      }

      postJsonRequest(
        `${apiBaseUrl}/api/openapi/wechat-accounts`,
        { 'X-API-Key': apiKey },
        {}
      ).then((result) => {
        res.writeHead(result.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(result.body || JSON.stringify({ success: false, error: 'Empty response' }));
      }).catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      });
    };

    if (req.method === 'GET') {
      const apiKey = wechatConfig.apiKey;
      const apiBaseUrl = (wechatConfig.apiBaseUrl || DEFAULT_CONFIG.wechat.apiBaseUrl).replace(/\/+$/, '');
      respondAccounts(apiKey, apiBaseUrl);
      return;
    }

    readJsonBody(req).then(async (payload) => {
      const apiKey = payload.apiKey || wechatConfig.apiKey;
      const apiBaseUrl = (payload.apiBaseUrl || wechatConfig.apiBaseUrl || DEFAULT_CONFIG.wechat.apiBaseUrl).replace(/\/+$/, '');
      respondAccounts(apiKey, apiBaseUrl);
    }).catch((error) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Invalid JSON: ${error.message}` }));
    });

    return;
  }

  // API: WeChat publish
  if (pathname === '/api/wechat-publish' && req.method === 'POST') {
    readJsonBody(req).then(async (payload) => {
      const config = loadConfig();
      const wechatConfig = config.wechat || {};
      const apiKey = payload.apiKey || wechatConfig.apiKey;
      const apiBaseUrl = (payload.apiBaseUrl || wechatConfig.apiBaseUrl || DEFAULT_CONFIG.wechat.apiBaseUrl).replace(/\/+$/, '');

      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'WeChat API key is missing' }));
        return;
      }

      const wechatAppid = payload.wechatAppid || wechatConfig.defaultAppid;
      if (!wechatAppid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'wechatAppid is required' }));
        return;
      }

      const useTempStorage = payload.useTempStorage === true
        || payload.useTempStorage === 'true'
        || payload.useTempStorage === 1
        || payload.useTempStorage === '1';
      const autoOptimize = payload.autoOptimize === true
        || payload.autoOptimize === 'true'
        || payload.autoOptimize === 1
        || payload.autoOptimize === '1'
        || (payload.autoOptimize === undefined && wechatConfig.autoOptimize);
      let title = payload.title;
      let content = payload.content;
      let summary = payload.summary;
      let coverImage = payload.coverImage;
      const author = payload.author || wechatConfig.author;
      const contentFormat = payload.contentFormat || wechatConfig.contentFormat || 'markdown';
      const articleType = payload.articleType || wechatConfig.articleType || 'news';

      const itemId = payload.id || payload.itemId;
      const itemUrl = payload.url;
      let item = null;
      if (itemId !== undefined && itemId !== null) {
        item = loadContentItemById(itemId);
      }

      if (!item && itemUrl) {
        item = loadContentItemByUrl(itemUrl);
      }

      if (!item && (!title || !content)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Content item not found' }));
        return;
      }

      let wechatItem = item;
      let resolvedImages = [];
      if (item) {
        resolvedImages = await resolveWechatImages(item, wechatConfig, { useTempStorage });
        wechatItem = { ...item, images: resolvedImages };
      }

      if (!title && wechatItem) {
        title = wechatItem.title || wechatItem.caseNumber || 'Untitled';
      }

      if (!content && wechatItem) {
        content = buildWechatContent(wechatItem, wechatConfig.publicBaseUrl, contentFormat);
      }

      if (!summary && wechatItem) {
        summary = wechatItem.summary || buildSummaryFallback(wechatItem);
      }

      if (autoOptimize && content) {
        try {
          const optimized = await requestWechatOptimize(config, content);
          if (!optimized || (!optimized.title && !optimized.summary)) {
            console.warn('WeChat AI optimize skipped: no usable title/summary returned.');
          } else {
            if (optimized.title) {
              title = optimized.title;
            }
            if (optimized.summary) {
              summary = optimized.summary;
            }
          }
        } catch (error) {
          console.warn('WeChat AI optimize failed:', error.message);
        }
      }

      if (!coverImage && wechatItem && Array.isArray(wechatItem.images) && wechatItem.images.length > 0) {
        const resolvedCover = wechatItem.images[0];
        if (isHttpUrl(resolvedCover)) {
          coverImage = resolvedCover;
        }
      }

      if (articleType === 'newspic' && (!resolvedImages || resolvedImages.length === 0)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'newspic requires at least one image' }));
        return;
      }

      const hasMarkdownImages = typeof content === 'string' && /!\[.*?\]\(\s*https?:\/\/[^\s)]+\s*\)/i.test(content);
      const hasHtmlImages = typeof content === 'string' && /<img\s[^>]*src=/i.test(content);
      console.log('📤 WeChat publish debug:', {
        itemId: itemId ?? null,
        itemUrl: itemUrl || null,
        useTempStorage,
        contentFormat,
        resolvedImages: resolvedImages.length,
        coverImage: coverImage || null,
        hasMarkdownImages,
        hasHtmlImages
      });

      if (!title || !content) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'title and content are required' }));
        return;
      }

      const publishPayload = {
        wechatAppid,
        title: clampText(title, 64),
        content
      };

      if (summary) publishPayload.summary = clampText(summary, 120);
      if (coverImage) publishPayload.coverImage = coverImage;
      if (author) publishPayload.author = author;
      if (contentFormat) publishPayload.contentFormat = contentFormat;
      if (articleType) publishPayload.articleType = articleType;

      postJsonRequest(
        `${apiBaseUrl}/api/openapi/wechat-publish`,
        { 'X-API-Key': apiKey },
        publishPayload
      ).then((result) => {
        res.writeHead(result.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(result.body || JSON.stringify({ success: false, error: 'Empty response' }));
      }).catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      });
    }).catch((error) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Invalid JSON: ${error.message}` }));
    });

    return;
  }

  // API: XHS login check
  if (pathname === '/api/xhs-check-login' && (req.method === 'GET' || req.method === 'POST')) {
    const runCheck = async (payload) => {
      const config = loadConfig();
      const result = await runXhsCheckLogin(payload || {}, config);
      const mergedLog = `${result.stdout}\n${result.stderr}`.trim();
      const notLoggedIn = /NOT LOGGED IN|not logged in|请扫描|scan the QR/i.test(mergedLog);
      if (result.code === 0 && !notLoggedIn) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            loggedIn: true,
            message: 'XHS logged in'
          }
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: notLoggedIn ? 'XHS account not logged in. Please scan QR code once.' : 'XHS login check failed',
        data: {
          loggedIn: false,
          code: result.code,
          log: trimToLength(mergedLog, 1200)
        }
      }));
    };

    if (req.method === 'GET') {
      runCheck({}).catch((error) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      });
      return;
    }

    readJsonBody(req).then(async (payload) => {
      await runCheck(payload || {});
    }).catch((error) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Invalid JSON: ${error.message}` }));
    });
    return;
  }

  // API: XHS publish (image or video)
  if (pathname === '/api/xhs-publish' && req.method === 'POST') {
    readJsonBody(req).then(async (payload) => {
      const config = loadConfig();
      const xhsConfig = config.xhs || {};
      if (!xhsConfig.enabled) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'XHS publishing is disabled in settings'
        }));
        return;
      }

      const itemId = payload.id || payload.itemId;
      const itemUrl = payload.url;
      let item = null;
      if (itemId !== undefined && itemId !== null) {
        item = loadContentItemById(itemId);
      }
      if (!item && itemUrl) {
        item = loadContentItemByUrl(itemUrl);
      }
      if (!item) {
        item = {
          title: payload.title || '',
          summary: payload.summary || '',
          content: payload.content || '',
          contentChinese: payload.contentChinese || '',
          contentEnglish: payload.contentEnglish || '',
          tags: payload.tags || '',
          images: Array.isArray(payload.images) ? payload.images : [],
          videos: Array.isArray(payload.videos) ? payload.videos : []
        };
      }

      const shouldSchedule = payload.schedule === true
        || payload.schedule === 'true'
        || payload.schedule === 1
        || payload.schedule === '1'
        || (payload.schedule === undefined && xhsConfig.scheduleEnabled);

      const requestedPostTime = safeTrim(payload.postTime);
      let scheduledAt = '';
      let postTime = '';
      let scheduleAccountKey = '';
      let previousScheduledAt = '';
      const effectivePayload = { ...payload };

      if (shouldSchedule) {
        const allocated = await allocateXhsScheduledTime(payload, config, requestedPostTime);
        scheduledAt = allocated.scheduledAt;
        postTime = allocated.postTime;
        scheduleAccountKey = allocated.accountKey;
        previousScheduledAt = allocated.previousScheduledAt;
        effectivePayload.postTime = postTime;
      }

      const publishResult = await runXhsPublish(effectivePayload, item, config);
      const mergedLog = `${publishResult.stdout}\n${publishResult.stderr}`.trim();
      const notLoggedIn = /NOT LOGGED IN|not logged in|请扫描|scan the QR/i.test(mergedLog);

      if (publishResult.code !== 0 || notLoggedIn) {
        if (shouldSchedule && scheduledAt) {
          await releaseXhsScheduledTime(scheduleAccountKey, scheduledAt, previousScheduledAt);
        }
        const statusCode = notLoggedIn ? 401 : 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: notLoggedIn
            ? 'XHS account not logged in. Please scan QR code and retry.'
            : 'XHS publish failed',
          data: {
            code: publishResult.code,
            mediaMode: publishResult.mediaMode,
            log: trimToLength(mergedLog, 1800)
          }
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          status: shouldSchedule ? 'scheduled' : 'published',
          scheduledAt: shouldSchedule ? scheduledAt : '',
          postTime: shouldSchedule ? postTime : '',
          scheduleAccount: shouldSchedule ? scheduleAccountKey : '',
          mediaMode: publishResult.mediaMode,
          title: publishResult.title,
          message: shouldSchedule
            ? `已提交到小红书平台原生定时发布：${postTime}`
            : 'Published to XHS successfully',
          log: trimToLength(publishResult.stdout || publishResult.stderr || '', 1000)
        }
      }));
    }).catch((error) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: `Invalid JSON: ${error.message}` }));
    });

    return;
  }

  // API: AI Optimize content
  // 标签白名单 - 固定的标签库
  const TAG_WHITELIST = [
    // 主题类
    'AI', '设计', '摄影', '动画', '创意',
    // 内容类型
    '教程', '技巧', '工具', '案例', '灵感', '资源',
    // 媒体类型（自动添加）
    '图片', '视频',
    // 领域类
    '数字艺术', '产品设计', 'UI设计', '3D', '特效', '后期',
    // 其他
    '社交媒体', '营销', '商务', '旅行', '时尚', '科技'
  ];

  // 常见工具名称列表（这些标签会被自动识别和保留）
  const TOOL_NAMES = [
    // AI 对话工具
    'ChatGPT', 'GPT-4', 'GPT-3.5', 'GPT-4o', 'Claude', 'Grok', 'Gemini', 'Copilot', 'Perplexity', 'Kimi',
    'DeepSeek', '文心一言', '通义千问', '讯飞星火', '豆包',

    // AI 图像生成
    'Midjourney', 'DALL-E', 'DALL-E 3', 'Stable Diffusion', 'SDXL', 'Leonardo', 'Firefly',
    'Playground', 'Ideogram', 'Flux', 'PixArt', 'Imagen', 'Bing Image Creator',

    // AI 视频生成
    'Runway', 'Gen-2', 'Gen-3', 'Pika', 'Sora', 'Veo', 'Veo-3.1', 'Luma', 'Kling', 'PixVerse', 'Haiper',
    'Viggle', 'HeyGen', 'D-ID',

    // AI 图像编辑/增强
    'Upscale', 'Magnific', 'Topaz', 'Gigapixel', 'RemBG', 'ClipDrop', 'Cleanup', 'Photoroom',

    // 设计工具
    'Figma', 'Sketch', 'Adobe XD', 'Canva', 'Photoshop', 'Illustrator', 'InDesign',
    'After Effects', 'Premiere', 'Lightroom', 'Framer', 'Webflow',

    // 3D 工具
    'Blender', 'Cinema4D', 'Maya', 'Houdini', '3ds Max', 'ZBrush', 'Substance', 'Unreal Engine', 'Unity',

    // 代码/开发工具
    'VSCode', 'Cursor', 'Windsurf', 'GitHub', 'GitLab', 'Copilot', 'Replit', 'CodeSandbox', 'v0',

    // 笔记/知识管理
    'Notion', 'Obsidian', 'Roam', 'Logseq', 'Evernote', 'Craft', 'Bear',

    // 其他常见工具
    'ComfyUI', 'Fooocus', 'Automatic1111', 'ControlNet', 'LoRA', 'Zapier', 'Make', 'n8n'
  ];

  // API: 获取标签白名单
  if (pathname === '/api/tags' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tags: TAG_WHITELIST }));
    return;
  }

  if (pathname === '/api/ai-optimize' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { content } = JSON.parse(body);
        const config = loadConfig();

        if (!config.ai || !config.ai.enabled) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'AI功能未启用，请先在设置中配置'
          }));
          return;
        }

        const prompt = [
          'You are a content editor. Read the content below and return ONLY a JSON object.',
          'Required JSON keys:',
          '  "title": 20-40 characters, concise and value-focused.',
          '  "summary": 50-100 characters, 1-2 sentences.',
          '  "tags": 3-5 tags, comma-separated.',
          '',
          'Rules:',
          '- Title and summary MUST be in Simplified Chinese, even if the source is English.',
          '- Tags can include tool names in English when relevant.',
          '- If the content mentions tools (e.g. ChatGPT, Midjourney, Photoshop), include those tool names as tags.',
          `- Prefer tags from this whitelist when they fit: ${TAG_WHITELIST.join(', ')}`,
          `- Common tool names you can keep as tags: ${TOOL_NAMES.join(', ')}`,
          '- Return JSON only. Do not include markdown or extra text.',
          '',
          'Content:',
          content
        ].join('\n');

        const apiData = JSON.stringify({
          model: config.ai.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: config.ai.temperature,
          max_tokens: config.ai.maxTokens,
            });

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.ai.apiKey}`
          }
        };

        const apiRequest = https.request(
          `${config.ai.apiUrl}/chat/completions`,
          options,
          (apiRes) => {
            let responseData = '';
            apiRes.on('data', chunk => responseData += chunk);
            apiRes.on('end', () => {
              try {
                const result = JSON.parse(responseData);
                const finishReason = result?.choices?.[0]?.finish_reason;
                const reasoningTokens = result?.usage?.completion_tokens_details?.reasoning_tokens || 0;
                const aiResponse = extractAIContent(result);

                if (!aiResponse) {
                  console.warn('AI响应缺少文本内容:', responseData);
                  if (finishReason === 'length') {
                    throw new Error(
                      `AI输出被截断（已使用${config.ai.maxTokens} Max Tokens，推理消耗 ${reasoningTokens}）` +
                      '，请在设置中调大“最大Token”或使用更轻量的模型'
                    );
                  }
                  throw new Error('AI返回格式错误：未找到文本内容');
                }

                // 提取JSON
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const optimized = JSON.parse(jsonMatch[0]);

                  if (!optimized.title) {
                    if (Array.isArray(optimized.title_suggestions) && optimized.title_suggestions.length > 0) {
                      optimized.title = String(optimized.title_suggestions[0]).trim();
                    } else if (optimized.title_suggestion) {
                      optimized.title = String(optimized.title_suggestion).trim();
                    }
                  }

                  if (!optimized.summary) {
                    if (Array.isArray(optimized.summary_suggestions) && optimized.summary_suggestions.length > 0) {
                      optimized.summary = String(optimized.summary_suggestions[0]).trim();
                    } else if (optimized.summary_suggestion) {
                      optimized.summary = String(optimized.summary_suggestion).trim();
                    }
                  }

                  if (!optimized.tags) {
                    if (Array.isArray(optimized.tag_suggestions) && optimized.tag_suggestions.length > 0) {
                      optimized.tags = optimized.tag_suggestions.map(tag => String(tag).trim()).filter(Boolean).join(',');
                    } else if (Array.isArray(optimized.tags_suggestions) && optimized.tags_suggestions.length > 0) {
                      optimized.tags = optimized.tags_suggestions.map(tag => String(tag).trim()).filter(Boolean).join(',');
                    } else if (typeof optimized.tags_suggestion === 'string') {
                      optimized.tags = optimized.tags_suggestion.trim();
                    }
                  }

                  // 标签智能排序：工具名称 > 白名单标签 > 其他标签（全部保留）
                  if (optimized.tags) {
                    const tags = optimized.tags.split(',').map(t => t.trim()).filter(t => t);

                    // 分类标签
                    const toolTags = [];      // 工具名称标签
                    const whitelistTags = []; // 白名单标签
                    const otherTags = [];     // 其他标签（用户可能手动添加）

                    tags.forEach(tag => {
                      // 不区分大小写匹配工具名称
                      const isToolTag = TOOL_NAMES.some(tool =>
                        tool.toLowerCase() === tag.toLowerCase()
                      );

                      if (isToolTag) {
                        // 使用标准工具名称（保持大小写）
                        const matchedTool = TOOL_NAMES.find(tool =>
                          tool.toLowerCase() === tag.toLowerCase()
                        );
                        toolTags.push(matchedTool);
                      } else if (TAG_WHITELIST.includes(tag)) {
                        whitelistTags.push(tag);
                      } else {
                        // 其他标签也保留（不过滤），可能是用户自定义的工具名称
                        otherTags.push(tag);
                      }
                    });

                    // 智能排序：工具标签优先，然后白名单，最后其他标签（全部保留）
                    const finalTags = [...toolTags, ...whitelistTags, ...otherTags];

                    // 日志输出
                    if (toolTags.length > 0) {
                      console.log(`✅ 识别到工具标签: ${toolTags.join(', ')}`);
                    }
                    if (whitelistTags.length > 0) {
                      console.log(`✅ 白名单标签: ${whitelistTags.join(', ')}`);
                    }
                    if (otherTags.length > 0) {
                      console.log(`✅ 其他标签（保留）: ${otherTags.join(', ')}`);
                    }
                    console.log(`✅ 最终标签（${finalTags.length}个）: ${finalTags.join(', ')}`);

                    optimized.tags = finalTags.join(',');
                  }

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, data: optimized }));
                } else {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    success: false,
                    error: 'AI返回格式错误'
                  }));
                }
              } catch (error) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
              }
            });
          }
        );

        apiRequest.on('error', (error) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        });

        apiRequest.write(apiData);
        apiRequest.end();
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  if (pathname === '/api/translate-bilingual' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { content } = JSON.parse(body || '{}');
        const input = safeTrim(content);
        if (!input || input.length < 10) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '内容太短，无法翻译补全' }));
          return;
        }

        const data = { content: input };
        applyBilingualSplitIfNeeded(data);
        await ensureBilingualContent(data);

        const english = safeTrim(data.contentEnglish);
        const chinese = safeTrim(data.contentChinese);
        if (!english && !chinese) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '未识别到可翻译的正文内容' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            contentEnglish: english,
            contentChinese: chinese,
            mergedContent: buildMergedBilingualContent(data)
          }
        }));
      } catch (error) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: Simple collect endpoint (from console)
  if (req.method === 'POST' && pathname === '/api/collect') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        await ensurePostContentFallback(data);
        {
          const raw = String(data.content || '');
          const preview = raw.slice(0, 220).replace(/\r?\n/g, '\\n');
          console.log(`[split-debug][collect] rawLen=${raw.length} hasSep=${/-{6,}/.test(raw)} preview=${preview}`);
        }
        applyBilingualSplitIfNeeded(data);
        await ensureBilingualContent(data);
        console.log(`[split-debug][collect] zhLen=${String(data.contentChinese || '').length} enLen=${String(data.contentEnglish || '').length} rawLeft=${String(data.content || '').length}`);
        console.log('📝 Content received:', data.title);

        // 标签去重
        if (data.tags) {
          const tags = data.tags.split(',').map(t => t.trim()).filter(t => t);
          const uniqueTags = [...new Set(tags)]; // 去重
          data.tags = uniqueTags.join(',');
          console.log(`🏷️ 标签去重后: ${data.tags}`);
        }

        // Generate Markdown
        const markdown = generateMarkdown(data);
        fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');

        console.log('✅ Content saved:', data.title);
        const imageCount = data.images ? data.images.length : 0;
        const videoCount = data.videos ? data.videos.length : 0;
        console.log('📊 统计: 图片', imageCount, '个, 视频', videoCount, '个');

        // 自动生成 JSON 数据
        console.log('🔄 自动生成 JSON 数据...');
        const { execSync } = require('child_process');
        try {
          execSync('node scripts/generate-dataset.js --auto', {
            cwd: __dirname,
            stdio: 'inherit'  // 显示子进程的输出
          });
          console.log('✅ JSON 数据已自动更新');
        } catch (err) {
          console.error('⚠️ JSON 生成失败:', err.message);
          console.error(err.stdout ? err.stdout.toString() : '');
          console.error(err.stderr ? err.stderr.toString() : '');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Content saved',
          url: 'http://localhost:3000/add-auto.html?title=' + encodeURIComponent(data.title)
        }));
      } catch(error) {
        console.error('❌ Save failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: Download image from URL (server-side)
  if (req.method === 'POST' && pathname === '/api/download-image') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { imageUrl, tweetId, index } = JSON.parse(body);
        if (!isHttpUrl(imageUrl)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid image URL' }));
          return;
        }

        console.log(`Downloading image ${index}: ${imageUrl.substring(0, 80)}...`);

        const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
        const requestOptions = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': 'https://x.com/'
          }
        };

        if (proxyUrl && HttpsProxyAgent) {
          console.log(`Using proxy: ${proxyUrl}`);
          requestOptions.agent = new HttpsProxyAgent(proxyUrl);
        }

        const filename = `tweet-${tweetId || Date.now()}-${index || 1}.jpg`;
        const savePath = path.join(IMAGES_DIR, filename);
        await downloadRemoteFile(imageUrl, savePath, requestOptions);

        console.log(`Image saved: ${filename}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, filename }));
      } catch (error) {
        console.error('Image download failed:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  // API: Add content with form data (file upload)
  if (req.method === 'POST' && pathname === '/api/add-content') {
    let body = Buffer.alloc(0);

    req.on('data', chunk => {
      body = Buffer.concat([body, chunk]);
    });

    req.on('end', async () => {
      try {
        const contentType = req.headers['content-type'] || '';

        let data = {};
        let downloadedImages = [];
        let downloadedVideos = [];

        if (contentType.includes('application/json')) {
          // JSON format (old method)
          data = JSON.parse(body.toString());
        } else if (contentType.includes('multipart/form-data')) {
          // Form data with file upload
          const boundary = contentType.split('boundary=')[1];
          const bodyText = body.toString('utf-8');
          const parts = bodyText.split('--' + boundary);

          for (let part of parts) {
            if (part.includes('Content-Disposition')) {
              const nameMatch = part.match(/name="([^"]+)"/);
              const filenameMatch = part.match(/filename="([^"]+)"/);

              if (filenameMatch) {
                // File upload
                const fieldName = nameMatch[1];
                const filename = filenameMatch[1];
                const fileStart = part.indexOf('\r\n\r\n') + 4;
                const fileEnd = part.lastIndexOf('\r\n');
                const fileBuffer = Buffer.from(part.substring(fileStart, fileEnd), 'binary');

                const tweetId = data.url ? extractTweetId(data.url) : generateUniqueId();
                const index = downloadedImages.length + 1;
                const newFilename = `tweet-${tweetId}-${index}.jpg`;
                const savePath = path.join(IMAGES_DIR, newFilename);

                fs.writeFileSync(savePath, fileBuffer);
                downloadedImages.push(newFilename);

                console.log(`   ✅ Saved: ${newFilename}`);
              } else {
                // Form field
                const fieldName = nameMatch[1];
                const fieldStart = part.indexOf('\r\n\r\n') + 4;
                const fieldEnd = part.lastIndexOf('\r\n');
                const fieldValue = part.substring(fieldStart, fieldEnd);

                data[fieldName] = fieldValue;
              }
            }
          }
        }

        console.log('📝 Content received:', data.title);

        // 处理已下载的图片文件名
        if (data.downloadedImageFiles) {
          downloadedImages = data.downloadedImageFiles.split(',').filter(f => f.trim());
          console.log(`🖼️ Images already downloaded: ${downloadedImages.length}`);
        } else {
          console.log(`🖼️ Images saved: ${downloadedImages.length}`);
        }

        // Handle videos (独立处理，不依赖图片)
        if (data.downloadedVideos) {
          downloadedVideos = data.downloadedVideos.split(',').filter(f => f.trim());
          console.log(`🎬 Videos already downloaded: ${downloadedVideos.length}`);
        }

        data.downloadedImages = downloadedImages;
        data.downloadedVideos = downloadedVideos;

        // 🔍 URL 去重检查（检查 JSON 数据文件）
        if (data.url && data.url.trim()) {
          const contentsJsonPath = path.join(__dirname, 'data/contents.json');

          if (fs.existsSync(contentsJsonPath)) {
            try {
              const contentsData = JSON.parse(fs.readFileSync(contentsJsonPath, 'utf-8'));
              const existingUrls = contentsData.items.map(item => item.url).filter(url => url);

              if (existingUrls.includes(data.url.trim())) {
                console.log('⚠️ 重复URL检测:', data.url);
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  error: '该内容已存在！此 URL 已被采集过。',
                  duplicate: true
                }));
                return;
              }
            } catch (error) {
              console.warn('⚠️ 读取 contents.json 失败，跳过去重检查:', error.message);
            }
          }
        }

        // 自动生成编号
        data.caseNumber = getNextCaseNumber();

        // 标签去重
        if (data.tags) {
          const tags = data.tags.split(',').map(t => t.trim()).filter(t => t);
          const uniqueTags = [...new Set(tags)]; // 去重
          data.tags = uniqueTags.join(',');
          console.log(`🏷️ 标签去重后: ${data.tags}`);
        }

        // 自动分离中英文内容
        // Auto split Chinese/English by explicit separator only: "\n------\n"
        await ensurePostContentFallback(data);
        {
          const raw = String(data.content || '');
          const preview = raw.slice(0, 220).replace(/\r?\n/g, '\\n');
          console.log(`[split-debug][add-content] rawLen=${raw.length} hasSep=${/-{6,}/.test(raw)} preview=${preview}`);
        }
        applyBilingualSplitIfNeeded(data);
        await ensureBilingualContent(data);
        console.log(`[split-debug][add-content] zhLen=${String(data.contentChinese || '').length} enLen=${String(data.contentEnglish || '').length} rawLeft=${String(data.content || '').length}`);

        try {
          await buildBilingualMeta(data);
        } catch (error) {
          console.warn('Bilingual meta build failed:', error.message);
        }

        // Generate Markdown
        const markdown = generateMarkdown(data);
        fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');

        console.log('✅ Content saved:', data.title);
        console.log('📊 统计: 图片', downloadedImages.length, '个, 视频', downloadedVideos.length, '个');

        // 自动生成 JSON 数据
        console.log('🔄 自动生成 JSON 数据...');
        const { execSync } = require('child_process');
        try {
          execSync('node scripts/generate-dataset.js --auto', {
            cwd: __dirname,
            stdio: 'inherit'  // 显示子进程的输出
          });
          console.log('✅ JSON 数据已自动更新');
        } catch (err) {
          console.error('⚠️ JSON 生成失败:', err.message);
          console.error(err.stdout ? err.stdout.toString() : '');
          console.error(err.stderr ? err.stderr.toString() : '');
        }

        // Static rebuild is heavy; run it in background to keep API responsive.
        scheduleStaticRebuild('add-content');

        let contentId = null;
        try {
          const contentsPath = path.join(__dirname, 'data/contents.json');
          if (fs.existsSync(contentsPath)) {
            const contentsData = JSON.parse(fs.readFileSync(contentsPath, 'utf-8'));
            if (data.url) {
              const foundByUrl = findContentItemByUrl(contentsData.items, data.url);
              if (foundByUrl) contentId = foundByUrl.id;
            }
            if (!contentId && data.caseNumber) {
              const found = contentsData.items.find(item => item.caseNumber === data.caseNumber);
              if (found) contentId = found.id;
            }
            if (!contentId && contentsData.items.length > 0) {
              contentId = contentsData.items.reduce((maxId, item) => item.id > maxId ? item.id : maxId, 0);
            }
          }
        } catch (error) {
          console.warn('Failed to resolve contentId:', error.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Content saved',
          downloadedImages: downloadedImages.length,
          downloadedVideos: downloadedVideos.length,
          contentId
        }));

      } catch (error) {
        console.error('❌ Save failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // GET /add.html - Auto download and upload
  if (req.method === 'GET' && (pathname === '/add.html' || pathname === '/add-auto.html')) {
    const filePath = path.join(__dirname, pathname === '/add.html' ? 'add-v3.html' : 'add-auto.html');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
    return;
  }

  // API: Upload video (from browser-processed HLS)
  if (req.method === 'POST' && pathname === '/api/upload-video') {
    const form = formidable({
      uploadDir: VIDEOS_DIR,
      keepExtensions: true,
      maxFileSize: 500 * 1024 * 1024, // 500MB
      filename: (name, ext, part, form) => {
        // 使用客户端提供的文件名
        return part.originalFilename || `video-${Date.now()}${ext}`;
      }
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('❌ 文件上传失败:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }

      try {
        const videoFile = files.video[0];
        const tweetId = fields.tweetId[0];
        const index = fields.index[0];
        const mimeType = fields.mimeType?.[0] || 'video/mp4';

        // 重命名文件
        const filename = `tweet-${tweetId}-${index}.mp4`;
        const finalPath = path.join(VIDEOS_DIR, filename);

        fs.renameSync(videoFile.filepath, finalPath);
        console.log(`✅ 视频上传成功: ${filename} (${(videoFile.size / 1024 / 1024).toFixed(2)} MB)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          filename,
          mimeType,
          size: videoFile.size
        }));

      } catch (error) {
        console.error('❌ 文件处理失败:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // API: Download video
  if (req.method === 'POST' && pathname === '/api/download-video') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { videoUrl, tweetId, index } = JSON.parse(body);

        console.log(`📥 下载视频 ${index}: ${videoUrl.substring(0, 80)}...`);

        const filename = `tweet-${tweetId}-${index}.mp4`;
        const savePath = path.join(VIDEOS_DIR, filename);

        // 🎬 检测是否是 M3U8 格式
        if (videoUrl.includes('.m3u8')) {
          console.log('🎥 检测到M3U8格式，使用ffmpeg下载...');
          downloadM3U8(videoUrl, savePath, (error) => {
            if (error) {
              console.error(`❌ M3U8下载失败:`, error.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: error.message }));
            } else {
              console.log(`✅ 视频保存成功: ${filename}`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, filename }));
            }
          });
        } else {
          // 直接下载 MP4 文件
          const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
          let requestOptions = {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          };

          if (proxyUrl && HttpsProxyAgent) {
            console.log(`🔌 使用代理: ${proxyUrl}`);
            requestOptions.agent = new HttpsProxyAgent(proxyUrl);
          }

          https.get(videoUrl, requestOptions, (response) => {
            if (response.statusCode === 200) {
              const fileStream = fs.createWriteStream(savePath);

              response.pipe(fileStream);

              fileStream.on('finish', () => {
                fileStream.close();
                console.log(`✅ 视频保存成功: ${filename}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, filename }));
              });
            } else {
              console.error(`❌ HTTP ${response.statusCode}`);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'HTTP error' }));
            }
          }).on('error', (err) => {
            console.error(`❌ 视频下载失败:`, err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          });
        }

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: Delete content (只允许本地访问)
  if (req.method === 'POST' && pathname === '/api/delete-content') {
    // 检查是否为本地访问
    const clientIP = req.socket.remoteAddress || req.connection.remoteAddress;
    const isLocal = clientIP === '127.0.0.1' ||
                    clientIP === '::1' ||
                    clientIP === '::ffff:127.0.0.1';

    if (!isLocal) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: '只允许本地访问' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        console.log(`🗑️ 删除请求: ID=${id}`);

        // 读取所有 JSON 文件
        const contentsPath = path.join(__dirname, 'data/contents.json');
        const latestPath = path.join(__dirname, 'data/latest.json');
        const archivePath = path.join(__dirname, 'data/archive.json');

        // 查找要删除的条目（获取标签信息）
        let deletedItem = null;
        const findDeletedItem = (filePath) => {
          if (!fs.existsSync(filePath)) return;
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (data.items) {
            const item = data.items.find(item => item.id === id);
            if (item) deletedItem = item;
          }
        };

        // 先找到要删除的条目
        findDeletedItem(contentsPath);
        if (!deletedItem) findDeletedItem(latestPath);
        if (!deletedItem) findDeletedItem(archivePath);

        if (!deletedItem) {
          console.log(`⚠️ ID=${id} 未找到`);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '未找到该内容' }));
          return;
        }

        console.log(`🗑️ 准备删除: ${deletedItem.title} (ID: ${id})`);
        console.log(`📋 标签: ${deletedItem.tags ? deletedItem.tags.join(', ') : '无'}`);

        // 删除函数
        const deleteFromJSON = (filePath) => {
          if (!fs.existsSync(filePath)) return false;

          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const originalCount = data.items ? data.items.length : 0;

          if (data.items) {
            data.items = data.items.filter(item => item.id !== id);
          }

          const deleted = originalCount !== (data.items ? data.items.length : 0);

          if (deleted) {
            // 更新统计信息
            if (data.globalStats) {
              // 更新总数
              const newTotal = data.items.length;
              data.globalStats.totalCount = newTotal;  // ← 关键：更新总数

              // 重新计算标签统计
              const tagCount = {};
              data.items.forEach(item => {
                if (item.tags && Array.isArray(item.tags)) {
                  item.tags.forEach(tag => {
                    tagCount[tag] = (tagCount[tag] || 0) + 1;
                  });
                }
              });

              data.globalStats.tagCount = tagCount;
              console.log(`   📊 更新统计: 总数 ${newTotal}, 标签 ${Object.keys(tagCount).length} 个`);
            }

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`   ✅ 从 ${path.basename(filePath)} 删除成功`);
          }
          return deleted;
        };

        // 依次从三个文件中删除
        let deleted = false;
        deleted = deleteFromJSON(contentsPath) || deleted;
        deleted = deleteFromJSON(latestPath) || deleted;
        deleted = deleteFromJSON(archivePath) || deleted;

        if (deleted) {
          console.log(`✅ ID=${id} 删除完成`);

          // Static rebuild is heavy; run in background so delete returns quickly.
          scheduleStaticRebuild('delete-content');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: '删除成功' }));
        } else {
          console.log(`⚠️ ID=${id} 未找到`);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: '未找到该内容' }));
        }

      } catch (error) {
        console.error('❌ 删除失败:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // GET / - Main page
  if (req.method === 'GET' && pathname === '/') {
    const indexPath = path.join(__dirname, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
    return;
  }

  // Static files
  if (req.method === 'GET') {
    serveStaticFile(pathname, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

/**
 * Extract tweet ID from URL
 */
function extractTweetId(tweetUrl) {
  if (!tweetUrl) return null;
  const match = tweetUrl.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Generate unique ID
 */
function generateUniqueId() {
  return Date.now().toString();
}

/**
 * Generate Markdown
 */
function generateMarkdown(data) {
  let md = `\n## ${data.title}\n`;
  if (data.caseNumber) md += `- **编号**: ${data.caseNumber}\n`;
  if (data.source) md += `- **来源**: ${data.source}\n`;
  if (data.url) md += `- **链接**: ${data.url}\n`;
  if (data.date) md += `- **日期**: ${data.date}\n`;
  if (data.tags) md += `- **分类**: ${data.tags}\n`;
  if (data.reason) md += `- **收藏理由**: ${data.reason}\n`;

  md += `\n`;

  if (data.summary) {
    md += `### 内容摘要\n${data.summary}\n\n`;
  }

  const headingZh = '\u4e2d\u6587\u5185\u5bb9';
  const headingEn = '\u82f1\u6587\u5185\u5bb9';
  const headingFull = '\u5b8c\u6574\u5185\u5bb9';

  // Prefer split Chinese/English content when present
  if (data.contentChinese || data.contentEnglish) {
    if (data.contentChinese) {
      md += `### ${headingZh}\n${data.contentChinese}\n\n`;
    }
    if (data.contentEnglish) {
      md += `### ${headingEn}\n${data.contentEnglish}\n\n`;
    }
  } else if (data.content) {
    // Fallback to raw content when no split content is provided
    md += `### ${headingFull}\n${data.content}\n\n`;
  }

  if (data.downloadedImages && data.downloadedImages.length > 0) {
    md += `### 相关图片\n`;
    data.downloadedImages.forEach((filename, index) => {
      md += `![图片 ${index + 1}](../images/${filename})\n`;
    });
    md += `\n`;
  }
  if (data.downloadedVideos && data.downloadedVideos.length > 0) {
    md += `### 相关视频
`;
    data.downloadedVideos.forEach((filename, index) => {
      md += `<video width="100%" controls><source src="../videos/${filename}" type="video/mp4"></video>
`;
    });
    md += `
`;
  }


  // 添加图片URL（如果有的话）
  if (data.imageUrls) {
    const urls = typeof data.imageUrls === 'string' ? data.imageUrls.split('|').filter(u => u.trim()) : data.imageUrls;
    if (urls.length > 0) {
      md += `### 图片URL\n`;
      urls.forEach((url, index) => {
        md += `![Remote image ${index + 1}](${url})\n`;
      });
      md += `\n`;
    }
  }

  md += `---\n\n`;

  return md;
}

/**
 * Serve static file
 */
function serveStaticFile(pathname, res) {
  // 安全的路径处理：防止路径遍历攻击
  // 移除开头的斜杠（在Windows上path.resolve会把/开头的路径当作绝对路径）
  const cleanPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  const resolvedPath = path.resolve(__dirname, cleanPath);
  const normalizedBase = path.resolve(__dirname);

  // 确保解析后的路径在基础目录内
  if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  let filePath = resolvedPath;

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  if (fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
  }
}

// Start server
server.listen(PORT, () => {
  console.log('\n🚀 Content Collector Server Started!\n');
  console.log(`   Server: http://localhost:${PORT}`);
  console.log(`   Images: ${IMAGES_DIR}`);
  console.log('\n💡 Upload images directly from browser - No VPN proxy needed!\n');
  console.log('   Press Ctrl+C to stop\n');
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Server stopped\n');
  process.exit(0);
});
