#!/usr/bin/env node
/**
 * Generate bilingual static pages:
 * - /zh/* and /en/*
 * - per-case detail pages: /{lang}/case/{id}.html
 * - root / index redirect by browser language
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const SITE_URL = 'https://gemnana.com';
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONTENTS_FILE = path.join(DATA_DIR, 'contents.json');
const LATEST_FILE = path.join(DATA_DIR, 'latest.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const EN_TRANSLATION_CACHE_FILE = path.join(DATA_DIR, 'en-title-summary-cache.json');
const EN_TRANSLATE_RECENT_LIMIT = 80;
const EN_TRANSLATE_MAX_NEW_PER_RUN = 20;
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 120);
const ROBOTS_INDEXABLE = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const ROBOTS_NOINDEX = 'noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';

const LANGS = {
  zh: {
    htmlLang: 'zh-CN',
    titleSuffix: 'Gem Nana AI 提示词库',
    siteName: 'Gem Nana',
    tagline: 'AI 提示词收藏库',
    nav: { home: '首页', image: '图片生成', video: '视频生成', text: '文字提示词' },
    switchLabel: 'English',
    latestTitle: '最新案例',
    latestDesc: (n) => `精选 ${n} 个 AI 提示词案例`,
    imageTitle: '图片生成提示词',
    imageDesc: (n) => `精选 ${n} 个图片案例`,
    videoTitle: '视频生成提示词',
    videoDesc: (n) => `精选 ${n} 个视频案例`,
    textTitle: '文字提示词',
    textDesc: (n) => `精选 ${n} 个文字案例`,
    detailsCta: '查看详情页',
    previewTitle: '查看提示词',
    searchPlaceholder: '🔍 搜索标题、摘要、标签…',
    filterTitle: '🏷️ 标签筛选',
    clearFilter: '清除筛选',
    countText: '共 {count} 条内容',
    noResults: '😕 没有找到匹配内容',
    promptHeading: '提示词',
    fallbackMark: '（当前为英文原文）',
    promptCnHeading: '中文提示词',
    promptEnHeading: '英文提示词',
    promptCnFallback: '（中文缺失，回退英文）',
    promptEnFallback: '（英文缺失，回退中文）',
    summaryHeading: '内容摘要',
    sourceHeading: '来源链接',
    imagesHeading: '图片',
    videosHeading: '视频',
    backToList: '← 返回列表',
    detailNoPrompt: '该案例暂无可展示的提示词内容。',
    localPublish: '发布到公众号草稿箱',
    localPublishXhsImage: '发布图文到小红书',
    localPublishXhsVideo: '发布视频到小红书',
    localDelete: '删除该案例',
    publishLoading: '发布中...',
    publishXhsLoading: '发布到小红书中...',
    deleteConfirm: '确认删除该案例？此操作不可恢复。',
    deleteSuccess: '删除成功',
    settingsLabel: '⚙️ 设置',
    copyLabel: '📋 复制',
    copiedLabel: '✅ 已复制',
    copyFailed: '复制失败，请手动复制',
    prevPage: '上一页',
    nextPage: '下一页',
    loadMore: '加载更多',
    loadingMore: '加载中...'
  },
  en: {
    htmlLang: 'en',
    titleSuffix: 'Gem Nana AI Prompt Library',
    siteName: 'Gem Nana',
    tagline: 'AI Prompt Collection',
    nav: { home: 'Home', image: 'Image', video: 'Video', text: 'Text' },
    switchLabel: '中文',
    latestTitle: 'Latest Cases',
    latestDesc: (n) => `${n} curated AI prompt cases`,
    imageTitle: 'Image Prompt Cases',
    imageDesc: (n) => `${n} curated image cases`,
    videoTitle: 'Video Prompt Cases',
    videoDesc: (n) => `${n} curated video cases`,
    textTitle: 'Text Prompt Cases',
    textDesc: (n) => `${n} curated text cases`,
    detailsCta: 'Open detail page',
    previewTitle: 'View Prompt',
    searchPlaceholder: '🔍 Search title, summary, tags…',
    filterTitle: '🏷️ Tag Filters',
    clearFilter: 'Clear Filters',
    countText: '{count} items',
    noResults: '😕 No matched content',
    promptHeading: 'Prompt',
    fallbackMark: '(Showing Chinese original)',
    promptCnHeading: 'Chinese Prompt',
    promptEnHeading: 'English Prompt',
    promptCnFallback: '(Chinese missing, fallback from English)',
    promptEnFallback: '(English missing, fallback from Chinese)',
    summaryHeading: 'Summary',
    sourceHeading: 'Source URL',
    imagesHeading: 'Images',
    videosHeading: 'Videos',
    backToList: '← Back to list',
    detailNoPrompt: 'No prompt content is available for this case.',
    localPublish: 'Publish to WeChat Draft',
    localPublishXhsImage: 'Publish Image Post to XHS',
    localPublishXhsVideo: 'Publish Video Post to XHS',
    localDelete: 'Delete this case',
    publishLoading: 'Publishing...',
    publishXhsLoading: 'Publishing to XHS...',
    deleteConfirm: 'Delete this case? This action cannot be undone.',
    deleteSuccess: 'Deleted successfully',
    settingsLabel: '⚙️ Settings',
    copyLabel: '📋 Copy',
    copiedLabel: '✅ Copied',
    copyFailed: 'Copy failed. Please copy manually.',
    prevPage: 'Previous',
    nextPage: 'Next',
    loadMore: 'Load more',
    loadingMore: 'Loading...'
  }
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

const EN_TAG_LABELS = Object.freeze({
  '图片': 'Image',
  '摄影': 'Photography',
  '创意': 'Creative',
  '创意设计': 'Creative Design',
  '设计': 'Design',
  '数字艺术': 'Digital Art',
  '工具': 'Tools',
  '图像编辑': 'Image Editing',
  '人像编辑': 'Portrait Editing',
  '3D转换': '3D Conversion',
  '灵感': 'Inspiration',
  '视频': 'Video',
  '资源': 'Resources',
  '时尚': 'Fashion',
  '技巧': 'Tips',
  '图像转换': 'Image Transformation',
  '风格转换': 'Style Transfer',
  '漫画': 'Comics',
  '图像合成': 'Image Compositing',
  '动画': 'Animation',
  '社交媒体': 'Social Media',
  '广告': 'Advertising',
  '教程': 'Tutorials',
  '后期': 'Post-processing',
  '系统提示词': 'System Prompt',
  '图像修复': 'Image Restoration',
  '特效': 'VFX',
  '动物': 'Animals',
  '作品修复': 'Work Restoration',
  '证件照': 'ID Photo',
  '效果': 'Effects',
  '场景合成': 'Scene Compositing',
  '艺术': 'Art',
  '电影': 'Film',
  '自然': 'Nature',
  '剧烈光线': 'Harsh Lighting',
  '工业': 'Industrial',
  '提示': 'Prompt',
  '教学': 'Education',
  '科普': 'Popular Science',
  '胶片风格': 'Film Look',
  '营销': 'Marketing',
  '产品设计': 'Product Design',
  '旅行': 'Travel',
  '案例': 'Case Study',
  '产品摄影': 'Product Photography',
  '海报设计': 'Poster Design',
  '生活': 'Lifestyle',
  '写实': 'Realistic'
});

function toDisplayTag(tag, lang) {
  const text = cleanText(tag);
  if (!text) return '';
  if (lang !== 'en') return text;
  if (!/[\u3400-\u9FFF]/.test(text)) return text;
  return EN_TAG_LABELS[text] || text;
}

function getCaseIdText(item) {
  const fromCaseNumber = cleanText(item.caseNumber).match(/\d+/);
  if (fromCaseNumber && fromCaseNumber[0]) return String(Number(fromCaseNumber[0]));
  const id = Number(item.id);
  return Number.isFinite(id) && id > 0 ? String(id) : '';
}

function getCaseTitle(item, lang = 'zh') {
  if (lang === 'en') {
    return cleanText(item.titleEnglish) || cleanText(item.title) || cleanText(item.caseNumber);
  }
  return cleanText(item.titleChinese) || cleanText(item.title) || cleanText(item.caseNumber);
}

function getCaseSummary(item, lang = 'zh') {
  if (lang === 'en') {
    return cleanText(item.summaryEnglish) || cleanText(item.summary);
  }
  return cleanText(item.summaryChinese) || cleanText(item.summary);
}

function renderCaseIdPill(item) {
  const caseId = getCaseIdText(item) || '?';
  return `<span class="case-id-pill"><span class="case-id-icon" aria-hidden="true">🏷️</span><span class="case-id-text">#${escapeHtml(caseId)}</span></span>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, ' ');
}

function formatMultilineText(text) {
  const normalized = cleanText(text);
  if (!normalized) return '';
  const blocks = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (blocks.length === 0) return '';
  return blocks
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function loadItems() {
  if (fs.existsSync(CONTENTS_FILE)) {
    const data = JSON.parse(fs.readFileSync(CONTENTS_FILE, 'utf8'));
    if (Array.isArray(data.items)) return data.items;
  }

  const all = [];
  if (fs.existsSync(LATEST_FILE)) {
    const latest = JSON.parse(fs.readFileSync(LATEST_FILE, 'utf8'));
    all.push(...(latest.items || []));
  }
  if (fs.existsSync(ARCHIVE_FILE)) {
    const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
    all.push(...(archive.items || []));
  }
  return all;
}

function hasCjkText(value) {
  return /[\u3400-\u9FFF]/.test(cleanText(value));
}

function loadEnTranslationCache() {
  try {
    if (!fs.existsSync(EN_TRANSLATION_CACHE_FILE)) {
      return { title: {}, summary: {} };
    }
    const raw = JSON.parse(fs.readFileSync(EN_TRANSLATION_CACHE_FILE, 'utf8'));
    return {
      title: raw && typeof raw.title === 'object' ? raw.title : {},
      summary: raw && typeof raw.summary === 'object' ? raw.summary : {}
    };
  } catch (error) {
    return { title: {}, summary: {} };
  }
}

function saveEnTranslationCache(cache) {
  try {
    ensureDir(path.dirname(EN_TRANSLATION_CACHE_FILE));
    fs.writeFileSync(EN_TRANSLATION_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.warn('⚠️ Failed to save translation cache:', error.message);
  }
}

function loadAiTranslateConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
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

async function translateToEnglish(text) {
  const input = cleanText(text);
  if (!input) return '';

  const ai = loadAiTranslateConfig();
  if (ai) {
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

    const aiResult = await new Promise((resolve) => {
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

    if (aiResult) return aiResult;
  }

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
      res.on('data', (chunk) => {
        body += chunk;
      });
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

    req.setTimeout(8000, () => {
      req.destroy();
      resolve('');
    });
    req.on('error', () => resolve(''));
  });
}

async function enrichEnglishTitleSummary(items) {
  const cache = loadEnTranslationCache();
  const recentItems = sortByIdDesc(items).slice(0, EN_TRANSLATE_RECENT_LIMIT);
  let newTranslations = 0;
  let cacheDirty = false;

  for (const item of recentItems) {
    if (newTranslations >= EN_TRANSLATE_MAX_NEW_PER_RUN) break;

    const title = cleanText(item.title);
    if (!cleanText(item.titleEnglish) && hasCjkText(title)) {
      const cached = cleanText(cache.title[title]);
      if (cached) {
        item.titleEnglish = cached;
      } else {
        const translated = await translateToEnglish(title);
        if (translated) {
          item.titleEnglish = translated;
          cache.title[title] = translated;
          cacheDirty = true;
          newTranslations += 1;
        }
      }
    }

    if (newTranslations >= EN_TRANSLATE_MAX_NEW_PER_RUN) break;

    const summary = cleanText(item.summary);
    if (!cleanText(item.summaryEnglish) && hasCjkText(summary)) {
      const cached = cleanText(cache.summary[summary]);
      if (cached) {
        item.summaryEnglish = cached;
      } else {
        const translated = await translateToEnglish(summary);
        if (translated) {
          item.summaryEnglish = translated;
          cache.summary[summary] = translated;
          cacheDirty = true;
          newTranslations += 1;
        }
      }
    }
  }

  if (cacheDirty) {
    saveEnTranslationCache(cache);
  }
  if (newTranslations > 0) {
    console.log(`🌐 EN auto-translation added: ${newTranslations}`);
  }
}

function sortByIdDesc(items) {
  return [...items].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
}

function groupByMediaType(items) {
  const groups = { image: [], video: [], text: [] };

  for (const item of items) {
    const tags = normalizeTags(item.tags);
    const hasVideo = Array.isArray(item.videos) && item.videos.length > 0;
    const hasImage = Array.isArray(item.images) && item.images.length > 0;
    const isText = tags.includes('系统提示词');

    if (isText) groups.text.push(item);
    else if (hasVideo) groups.video.push(item);
    else if (hasImage) groups.image.push(item);
    else groups.text.push(item);
  }

  return groups;
}

function getTagStats(items) {
  const stats = {};
  for (const item of items) {
    for (const tag of normalizeTags(item.tags)) {
      stats[tag] = (stats[tag] || 0) + 1;
    }
  }
  return stats;
}

function tagToFilename(tag) {
  return `${String(tag).replace(/\s+/g, '-').toLowerCase()}.html`;
}

function listKeyFromTagFilename(filename) {
  return `tag-${String(filename || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;
}

function getPromptByLang(item, lang) {
  const zh = cleanText(item.contentChinese);
  const en = cleanText(item.contentEnglish);
  const full = cleanText(item.content);

  if (lang === 'zh') {
    if (zh) return { text: zh, isFallback: false };
    if (en) return { text: en, isFallback: true };
    if (full) return { text: full, isFallback: true };
    return { text: '', isFallback: false };
  }

  if (en) return { text: en, isFallback: false };
  if (zh) return { text: zh, isFallback: true };
  if (full) return { text: full, isFallback: true };
  return { text: '', isFallback: false };
}

function getDetailPath(item) {
  return `/case/${Number(item.id)}.html`;
}

function toLangHref(lang, canonicalPath) {
  if (canonicalPath === '/') return `/${lang}/index.html`;
  if (canonicalPath.endsWith('/')) return `/${lang}${canonicalPath}index.html`;
  return `/${lang}${canonicalPath}`;
}

function paginateItems(items, pageSize = PAGE_SIZE) {
  const size = Math.max(1, Number(pageSize) || PAGE_SIZE);
  const total = Array.isArray(items) ? items.length : 0;
  if (total === 0) return [[]];
  const pages = [];
  for (let i = 0; i < total; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

function getPagedCanonicalPath(baseCanonicalPath, pageNo) {
  const raw = String(baseCanonicalPath || '');
  const trimmed = raw.replace(/^\/+|\/+$/g, '');
  const isFilePath = /\.html$/i.test(trimmed);
  if (isFilePath) {
    const parts = trimmed.split('/').filter(Boolean);
    const filename = parts.pop() || '';
    const dirPrefix = parts.length ? `/${parts.join('/')}` : '';
    if (pageNo <= 1) return `${dirPrefix}/${filename}`;
    return `${dirPrefix}/page/${pageNo}/${filename}`;
  }

  const base = raw === '/' ? '/' : `/${trimmed}/`;
  if (pageNo <= 1) return base;
  if (base === '/') return `/page/${pageNo}/`;
  return `${base}page/${pageNo}/`;
}

function getPageOutputPath(langRoot, baseCanonicalPath, pageNo) {
  const raw = String(baseCanonicalPath || '');
  const trimmed = raw.replace(/^\/+|\/+$/g, '');
  const isFilePath = /\.html$/i.test(trimmed);
  if (isFilePath) {
    const parts = trimmed.split('/').filter(Boolean);
    const filename = parts.pop() || '';
    if (pageNo <= 1) {
      return path.join(langRoot, ...parts, filename);
    }
    return path.join(langRoot, ...parts, 'page', String(pageNo), filename);
  }

  const canonical = getPagedCanonicalPath(baseCanonicalPath, pageNo);
  if (canonical === '/') return path.join(langRoot, 'index.html');
  const parts = canonical.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  return path.join(langRoot, ...parts, 'index.html');
}

function getChunkBaseUrl(lang, listKey) {
  return `/${lang}/chunks/${encodeURIComponent(listKey)}`;
}

function getAbsoluteAssetPath(assetPath) {
  if (/^https?:\/\//i.test(String(assetPath || ''))) return String(assetPath);
  const clean = String(assetPath || '').replace(/^\/+/, '');
  return `/${clean}`;
}

function buildSearchText(item, lang) {
  const prompt = getPromptByLang(item, lang).text.slice(0, 300);
  const tags = normalizeTags(item.tags).join(' ');
  const displayTitle = getCaseTitle(item, lang);
  const displaySummary = getCaseSummary(item, lang);
  const base = [
    item.caseNumber || '',
    displayTitle || item.title || '',
    displaySummary || item.summary || '',
    item.source || '',
    item.url || '',
    tags,
    prompt
  ].join(' ');
  return base.replace(/\s+/g, ' ').trim().toLowerCase();
}

function renderCaseCard(item, lang) {
  const t = LANGS[lang];
  const detailPath = `/${lang}${getDetailPath(item)}`;
  const tags = normalizeTags(item.tags);
  const prompt = getPromptByLang(item, lang);
  const promptPreviewText = prompt.text ? `${prompt.text.slice(0, 200)}${prompt.text.length > 200 ? '...' : ''}` : '';
  const fallbackBadge = prompt.isFallback ? ` <span class="fallback-badge">${t.fallbackMark}</span>` : '';

  let thumbnail = '<div class="no-image">📷</div>';
  if (Array.isArray(item.images) && item.images[0]) {
    thumbnail = `<img src="${getAbsoluteAssetPath(item.images[0])}" alt="${escapeAttr(item.title || '')}" loading="lazy">`;
  } else if (Array.isArray(item.videos) && item.videos[0]) {
    thumbnail = `<video muted playsinline webkit-playsinline autoplay loop preload="metadata"><source src="${getAbsoluteAssetPath(item.videos[0])}" type="video/mp4"></video>`;
  }

  const tagsHtml = tags.map((tag) => `<span class="tag">${escapeHtml(toDisplayTag(tag, lang))}</span>`).join('');
  const summary = getCaseSummary(item, lang);
  const caseTitle = getCaseTitle(item, lang);
  const sourceText = cleanText(item.source);
  const sourceMetaHtml = cleanText(item.url)
    ? `<span class="case-source source-inline-link clickable-source" data-url="${escapeAttr(item.url)}">${escapeHtml(sourceText || item.url)}</span>`
    : `<span class="case-source">${escapeHtml(sourceText)}</span>`;

  let promptHtml = '';
  if (promptPreviewText) {
    promptHtml = `
      <details class="prompt-preview">
        <summary>🎨 ${t.previewTitle}</summary>
        <div class="prompt-content">
          <div class="prompt-section">
            <h4>${t.promptHeading}${fallbackBadge}</h4>
            <p>${escapeHtml(promptPreviewText)}</p>
          </div>
          <a class="view-full-btn" href="${detailPath}">${t.detailsCta}</a>
        </div>
      </details>
    `;
  }

  return `
    <article class="case-card" data-id="${Number(item.id)}" data-search="${escapeAttr(buildSearchText(item, lang))}" data-tags="${escapeAttr(tags.join('|'))}">
      <a class="case-card-link" href="${detailPath}">
        <div class="case-thumbnail">${thumbnail}</div>
        <div class="case-info">
          <h3 class="case-title">${renderCaseIdPill(item)}${caseTitle ? `<span class="case-title-text">${escapeHtml(caseTitle)}</span>` : ''}</h3>
          ${summary ? `<p class="case-summary">${escapeHtml(summary)}</p>` : ''}
          <div class="case-meta">
            <span class="case-date">${escapeHtml(item.date || '')}</span>
            ${sourceMetaHtml}
          </div>
          <div class="case-tags">${tagsHtml}</div>
          ${promptHtml}
        </div>
      </a>
    </article>
  `;
}

function renderSidebar(lang, currentNav, stats, currentPath) {
  const t = LANGS[lang];
  const otherLang = lang === 'zh' ? 'en' : 'zh';
  const switchHref = toLangHref(otherLang, currentPath);

  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1 class="logo">📚 ${t.siteName}</h1>
        <p class="tagline">${t.tagline}</p>
      </div>

      <nav class="sidebar-nav">
        <a href="${toLangHref(lang, '/')}" class="nav-item ${currentNav === 'home' ? 'active' : ''}">
          <span class="nav-icon">🏠</span>
          <span class="nav-text">${t.nav.home}</span>
          <span class="nav-count">${stats.total}</span>
        </a>
        <a href="${toLangHref(lang, '/image/')}" class="nav-item ${currentNav === 'image' ? 'active' : ''}">
          <span class="nav-icon">📷</span>
          <span class="nav-text">${t.nav.image}</span>
          <span class="nav-count">${stats.image}</span>
        </a>
        <a href="${toLangHref(lang, '/video/')}" class="nav-item ${currentNav === 'video' ? 'active' : ''}">
          <span class="nav-icon">🎬</span>
          <span class="nav-text">${t.nav.video}</span>
          <span class="nav-count">${stats.video}</span>
        </a>
        <a href="${toLangHref(lang, '/text/')}" class="nav-item ${currentNav === 'text' ? 'active' : ''}">
          <span class="nav-icon">💬</span>
          <span class="nav-text">${t.nav.text}</span>
          <span class="nav-count">${stats.text}</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <a href="${switchHref}" class="lang-switch-link">${t.switchLabel}</a>
        <a href="/settings.html" class="local-settings-link">${t.settingsLabel}</a>
        <p>© 2025 Gem Nana</p>
      </div>
    </aside>
  `;
}

function renderBaseScripts() {
  return `
    <script>
      (function () {
        const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
        if (isLocal) {
          document.querySelectorAll('.local-settings-link').forEach(el => { el.style.display = 'inline-block'; });
        }

        document.addEventListener('click', function (event) {
          const el = event.target && event.target.closest ? event.target.closest('.clickable-source[data-url]') : null;
          if (!el) return;
          event.preventDefault();
          event.stopPropagation();
          const rawUrl = (el.getAttribute('data-url') || '').trim();
          if (!rawUrl) return;
          window.open(rawUrl, '_blank', 'noopener,noreferrer');
        });
      })();
    </script>
  `;
}

function renderFilterScript(lang, options = {}) {
  const t = LANGS[lang];
  const textConfig = JSON.stringify({
    countText: t.countText,
    noResults: t.noResults,
    loadMore: t.loadMore,
    loadingMore: t.loadingMore
  });
  const optionsConfig = JSON.stringify({
    enableLoadMore: !!options.enableLoadMore,
    chunkBaseUrl: options.chunkBaseUrl || ''
  });
  return `
    <script>
      (function () {
        const config = ${textConfig};
        const options = ${optionsConfig};
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearFilters');
        const tagButtons = Array.from(document.querySelectorAll('.tag-filter'));
        const statsText = document.getElementById('statsText');
        const noResults = document.getElementById('noResults');
        const caseGrid = document.getElementById('caseGrid');
        const loadMoreWrap = document.getElementById('loadMoreWrap');
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (!caseGrid) return;

        let activeTag = '';
        let loadedPages = Number(loadMoreBtn ? loadMoreBtn.getAttribute('data-loaded-pages') : 1) || 1;
        const totalPages = Number(loadMoreBtn ? loadMoreBtn.getAttribute('data-total-pages') : 1) || 1;
        let isLoading = false;
        const chunkBase = String(options.chunkBaseUrl || '').replace(/\\/+$/, '');

        function getCards() {
          return Array.from(document.querySelectorAll('.case-card'));
        }

        function applyFilters() {
          const cards = getCards();
          const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
          let visibleCount = 0;

          cards.forEach((card) => {
            const searchable = card.getAttribute('data-search') || '';
            const tags = (card.getAttribute('data-tags') || '').split('|').filter(Boolean);
            const qMatched = !query || searchable.includes(query);
            const tagMatched = !activeTag || tags.includes(activeTag);
            const visible = qMatched && tagMatched;
            card.style.display = visible ? '' : 'none';
            if (visible) visibleCount += 1;
          });

          if (statsText) statsText.textContent = config.countText.replace('{count}', String(visibleCount));
          if (noResults) noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        }

        function updateLoadMoreState() {
          if (!options.enableLoadMore || !loadMoreBtn || !loadMoreWrap) return;
          const hasMore = loadedPages < totalPages;
          loadMoreWrap.style.display = hasMore ? '' : 'none';
          loadMoreBtn.disabled = isLoading || !hasMore;
          loadMoreBtn.textContent = isLoading ? config.loadingMore : config.loadMore;
        }

        async function handleLoadMore() {
          if (!options.enableLoadMore || !loadMoreBtn || !caseGrid || isLoading) return;
          if (loadedPages >= totalPages) {
            updateLoadMoreState();
            return;
          }
          const nextPage = loadedPages + 1;
          if (!chunkBase) return;

          isLoading = true;
          updateLoadMoreState();
          try {
            const chunkUrl = chunkBase + '/' + String(nextPage) + '.html';
            const res = await fetch(chunkUrl, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Failed to fetch chunk: ' + chunkUrl);
            const html = await res.text();
            if (html && html.trim()) {
              caseGrid.insertAdjacentHTML('beforeend', html);
            }
            loadedPages = nextPage;
            loadMoreBtn.setAttribute('data-loaded-pages', String(loadedPages));
            applyFilters();
          } catch (err) {
            console.error('[load-more] error:', err);
          } finally {
            isLoading = false;
            updateLoadMoreState();
          }
        }

        function setActiveTag(tag) {
          activeTag = tag || '';
          tagButtons.forEach((btn) => {
            const btnTag = btn.getAttribute('data-tag') || '';
            btn.classList.toggle('active', !!activeTag && btnTag === activeTag);
          });
          applyFilters();
        }

        if (searchInput) searchInput.addEventListener('input', applyFilters);
        if (clearBtn) {
          clearBtn.addEventListener('click', function () {
            if (searchInput) searchInput.value = '';
            setActiveTag('');
          });
        }

        tagButtons.forEach((btn) => {
          btn.addEventListener('click', function () {
            const tag = btn.getAttribute('data-tag') || '';
            setActiveTag(activeTag === tag ? '' : tag);
          });
        });

        if (loadMoreBtn) {
          loadMoreBtn.addEventListener('click', handleLoadMore);
        }

        updateLoadMoreState();
        applyFilters();
      })();
    </script>
  `;
}

function renderHead({ lang, title, description, canonicalPath, robots = ROBOTS_INDEXABLE }) {
  const t = LANGS[lang];
  const canonical = `${SITE_URL}/${lang}${canonicalPath}`;
  const zhAlt = `${SITE_URL}/zh${canonicalPath}`;
  const enAlt = `${SITE_URL}/en${canonicalPath}`;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    inLanguage: t.htmlLang,
    name: title,
    description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: t.siteName, url: SITE_URL }
  };

  return `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} | ${escapeHtml(t.titleSuffix)}</title>
    <meta name="description" content="${escapeAttr(description)}">
    <meta name="keywords" content="AI Prompt, Midjourney, Stable Diffusion, Gemini, DALL-E, AI image generation">
    <meta name="robots" content="${escapeAttr(robots)}">
    <meta name="googlebot" content="${escapeAttr(robots)}">
    <link rel="canonical" href="${canonical}">
    <link rel="alternate" hreflang="zh-CN" href="${zhAlt}">
    <link rel="alternate" hreflang="en" href="${enAlt}">
    <link rel="alternate" hreflang="x-default" href="${SITE_URL}/">
    <link rel="stylesheet" href="/assets/style.css?v=${Date.now()}">
    <style>
      .lang-switch-link {
        display: inline-block;
        margin-bottom: 8px;
        color: rgba(255,255,255,0.9);
        text-decoration: none;
        font-size: 12px;
        padding: 4px 10px;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 999px;
      }
      .lang-switch-link:hover { border-color: rgba(255,255,255,0.45); color: #fff; }
      .case-card-link { display: block; color: inherit; text-decoration: none; }
      .case-title,
      .detail-title {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        flex-wrap: wrap;
      }
      .case-title-text { flex: 1 1 auto; min-width: 0; }
      .case-id-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border: 1px solid rgba(143, 177, 255, 0.4);
        border-radius: 999px;
        background: rgba(8, 14, 36, 0.52);
        color: rgba(221, 232, 255, 0.96);
        white-space: nowrap;
        line-height: 1.2;
      }
      .case-id-icon { font-size: 0.95em; }
      .case-title .case-id-pill,
      .detail-title .case-id-pill {
        font-size: calc(1em - 3px);
      }
      .fallback-badge { color: rgba(255, 183, 77, 0.95); font-size: 11px; font-weight: 500; }
      .detail-body { max-width: 980px; }
      .detail-block { margin-bottom: 20px; padding: 16px; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background: rgba(10,15,35,0.45); }
      .detail-block h3 { margin: 0 0 12px 0; color: #fff; font-size: 18px; }
      .detail-block p { margin: 0 0 10px 0; color: rgba(255,255,255,0.86); line-height: 1.7; }
      .detail-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
      .detail-media-grid img, .detail-media-grid video { width: 100%; border-radius: 8px; background: rgba(0,0,0,0.3); }
      .source-link { color: #77c5ff; text-decoration: none; word-break: break-all; }
      .source-link:hover { text-decoration: underline; }
      .source-inline-link { color: inherit; text-decoration: none; border-bottom: 1px dashed rgba(125, 198, 255, 0.45); }
      .source-inline-link:hover { color: #8cd4ff; border-bottom-color: rgba(140, 212, 255, 0.85); }
      .prompt-head-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .prompt-copy-btn {
        background: rgba(25, 225, 155, 0.18);
        color: #dfffea;
        border: 1px solid rgba(25, 225, 155, 0.45);
        border-radius: 10px;
        padding: 5px 12px;
        font-size: 13px;
        cursor: pointer;
      }
      .prompt-copy-btn:hover { background: rgba(25, 225, 155, 0.28); border-color: rgba(25, 225, 155, 0.7); }
      .local-action-row { display: none; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
      .local-action-row .view-full-btn { width: auto; min-width: 180px; }
      .pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin: 22px 0 10px;
        flex-wrap: wrap;
      }
      .pagination-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 38px;
        height: 34px;
        padding: 0 10px;
        border-radius: 8px;
        border: 1px solid rgba(139, 175, 255, 0.28);
        color: rgba(224, 234, 255, 0.96);
        text-decoration: none;
        background: rgba(8, 14, 35, 0.45);
        font-size: 13px;
      }
      .pagination-link:hover {
        border-color: rgba(139, 175, 255, 0.5);
        background: rgba(18, 28, 64, 0.78);
      }
      .pagination-link.active {
        background: rgba(73, 117, 255, 0.85);
        border-color: rgba(103, 147, 255, 0.95);
        color: #fff;
        pointer-events: none;
      }
      .pagination-ellipsis {
        display: inline-flex;
        align-items: center;
        height: 34px;
        padding: 0 4px;
        color: rgba(200, 214, 246, 0.72);
      }
      .load-more-wrap {
        margin: 12px 0 6px;
        display: flex;
        justify-content: center;
      }
      .btn-load-more {
        border: 1px solid rgba(133, 170, 255, 0.5);
        border-radius: 10px;
        background: rgba(24, 37, 76, 0.88);
        color: #eaf1ff;
        padding: 8px 18px;
        font-size: 14px;
        cursor: pointer;
      }
      .btn-load-more:hover {
        border-color: rgba(133, 170, 255, 0.85);
        background: rgba(35, 53, 105, 0.95);
      }
      .btn-load-more:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
    </style>
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
  `;
}

function renderPageTemplate({
  lang,
  title,
  description,
  canonicalPath,
  robots = ROBOTS_INDEXABLE,
  currentNav,
  stats,
  content,
  withFilterScript = false,
  filterScriptOptions = {}
}) {
  return `<!DOCTYPE html>
<html lang="${LANGS[lang].htmlLang}">
<head>
${renderHead({ lang, title, description, canonicalPath, robots })}
</head>
<body class="layout-sidebar">
${renderSidebar(lang, currentNav, stats, canonicalPath)}
<main class="main-content">
${content}
</main>
${renderBaseScripts()}
${withFilterScript ? renderFilterScript(lang, filterScriptOptions) : ''}
</body>
</html>`;
}

function renderControls(lang, items, options = {}) {
  const t = LANGS[lang];
  const filterItems = Array.isArray(options.filterItems) && options.filterItems.length ? options.filterItems : items;
  const initialCount = Number(options.initialCount);
  const countValue = Number.isFinite(initialCount) ? initialCount : items.length;
  const tagStats = getTagStats(filterItems);
  const tags = Object.entries(tagStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  const tagsHtml = tags
    .map(([tag, count]) => `<button type="button" class="tag-filter" data-tag="${escapeAttr(tag)}">${escapeHtml(toDisplayTag(tag, lang))} (${count})</button>`)
    .join('');

  return `
    <div class="controls">
      <div class="search-box">
        <input type="text" id="searchInput" class="search-input" placeholder="${escapeAttr(t.searchPlaceholder)}">
      </div>
      <div class="filter-section">
        <div class="filter-header">
          <span>${t.filterTitle}</span>
          <button id="clearFilters" class="btn-clear" type="button">${t.clearFilter}</button>
        </div>
        <div id="tagFilters" class="tag-filters">${tagsHtml}</div>
      </div>
      <div class="stats"><span id="statsText">${t.countText.replace('{count}', String(countValue))}</span></div>
    </div>
    <div id="noResults" class="no-results" style="display:none;">${t.noResults}</div>
  `;
}

function renderPagination(lang, baseCanonicalPath, currentPage, totalPages) {
  if (!Number.isFinite(totalPages) || totalPages <= 1) return '';
  const t = LANGS[lang];
  const pages = [];
  const push = (n) => { if (!pages.includes(n) && n >= 1 && n <= totalPages) pages.push(n); };
  push(1);
  push(totalPages);
  for (let n = currentPage - 2; n <= currentPage + 2; n += 1) push(n);
  pages.sort((a, b) => a - b);

  const pageLinks = [];
  let prev = 0;
  for (const pageNo of pages) {
    if (prev && pageNo - prev > 1) {
      pageLinks.push('<span class="pagination-ellipsis">...</span>');
    }
    const href = toLangHref(lang, getPagedCanonicalPath(baseCanonicalPath, pageNo));
    if (pageNo === currentPage) {
      pageLinks.push(`<span class="pagination-link active">${pageNo}</span>`);
    } else {
      pageLinks.push(`<a class="pagination-link" href="${href}">${pageNo}</a>`);
    }
    prev = pageNo;
  }

  const prevLink = currentPage > 1
    ? `<a class="pagination-link" href="${toLangHref(lang, getPagedCanonicalPath(baseCanonicalPath, currentPage - 1))}">${t.prevPage}</a>`
    : '';
  const nextLink = currentPage < totalPages
    ? `<a class="pagination-link" href="${toLangHref(lang, getPagedCanonicalPath(baseCanonicalPath, currentPage + 1))}">${t.nextPage}</a>`
    : '';

  return `<nav class="pagination">${prevLink}${pageLinks.join('')}${nextLink}</nav>`;
}

function renderListPage({
  lang,
  canonicalPath,
  currentNav,
  title,
  subtitle,
  description,
  items,
  stats,
  allItemsForFilters = [],
  currentPage = 1,
  totalPages = 1,
  chunkBaseUrl = '',
  enableLoadMore = false
}) {
  const t = LANGS[lang];
  const isPagedPage = Number(currentPage) > 1;
  const cardsHtml = items.map((item) => renderCaseCard(item, lang)).join('\n');
  const paginationHtml = renderPagination(lang, canonicalPath, currentPage, totalPages);
  const hasMore = enableLoadMore && currentPage < totalPages;
  const loadMoreHtml = enableLoadMore
    ? `
    <div id="loadMoreWrap" class="load-more-wrap" style="${hasMore ? '' : 'display:none;'}">
      <button
        type="button"
        id="loadMoreBtn"
        class="btn-load-more"
        data-loaded-pages="${currentPage}"
        data-total-pages="${totalPages}"
      >${t.loadMore}</button>
    </div>
  `
    : '';
  const content = `
    <div class="page-header">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </div>
    ${renderControls(lang, items, { filterItems: allItemsForFilters, initialCount: items.length })}
    <div id="caseGrid" class="case-grid">${cardsHtml}</div>
    ${loadMoreHtml}
    ${paginationHtml}
  `;
  return renderPageTemplate({
    lang,
    title,
    description,
    canonicalPath,
    robots: isPagedPage ? ROBOTS_NOINDEX : ROBOTS_INDEXABLE,
    currentNav,
    stats,
    content,
    withFilterScript: true,
    filterScriptOptions: {
      enableLoadMore,
      chunkBaseUrl
    }
  });
}

function renderDetailPage({ lang, item, stats }) {
  const t = LANGS[lang];
  const zhRaw = cleanText(item.contentChinese);
  const enRaw = cleanText(item.contentEnglish);
  const fullRaw = cleanText(item.content);
  const zhPrompt = zhRaw || enRaw || fullRaw;
  const enPrompt = enRaw || zhRaw || fullRaw;
  const zhFallback = !zhRaw && !!zhPrompt;
  const enFallback = !enRaw && !!enPrompt;
  const summary = getCaseSummary(item, lang);
  const detailPath = getDetailPath(item);
  const navKey = currentNavByItem(item);
  const caseTitle = getCaseTitle(item, lang);
  const caseId = getCaseIdText(item) || String(Number(item.id) || '');

  const images = Array.isArray(item.images) ? item.images : [];
  const videos = Array.isArray(item.videos) ? item.videos : [];
  const hasImageMedia = images.length > 0;
  const hasVideoMedia = videos.length > 0;

  const imagesHtml = images.length
    ? `<div class="detail-block"><h3>📷 ${t.imagesHeading}</h3><div class="detail-media-grid">${images.map((img) => `<img src="${getAbsoluteAssetPath(img)}" alt="${escapeAttr(item.title || '')}" loading="lazy">`).join('')}</div></div>`
    : '';
  const videosHtml = videos.length
    ? `<div class="detail-block"><h3>🎬 ${t.videosHeading}</h3><div class="detail-media-grid">${videos.map((video) => `<video controls><source src="${getAbsoluteAssetPath(video)}" type="video/mp4"></video>`).join('')}</div></div>`
    : '';
  const sourceUrl = cleanText(item.url);
  const sourceHtml = '';
  const headerSourceHtml = sourceUrl
    ? `<a class="source-inline-link" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source || sourceUrl)}</a>`
    : escapeHtml(item.source || '');

  const content = `
    <div class="page-header detail-body">
      <nav class="breadcrumb">
        <a href="${toLangHref(lang, '/')}">${LANGS[lang].nav.home}</a><span>›</span>
        <a href="${toLangHref(lang, `/${navKey}/`)}">${LANGS[lang].nav[navKey]}</a><span>›</span>
        <span>#${escapeHtml(caseId)}</span>
      </nav>
      <h1 class="detail-title">${renderCaseIdPill(item)}${caseTitle ? `<span class="case-title-text">${escapeHtml(caseTitle)}</span>` : ''}</h1>
      <p>${escapeHtml(item.date || '')}　${headerSourceHtml}</p>
      <p><a class="source-link" href="${toLangHref(lang, `/${navKey}/`)}">${t.backToList}</a></p>
    </div>

    <div class="detail-body">
      <div id="localActionRow" class="local-action-row">
        <button class="view-full-btn" id="publishBtn" onclick="publishCurrentCase(this)">${t.localPublish}</button>
        ${hasImageMedia ? `<button class="view-full-btn" id="publishXhsImageBtn" onclick="publishCurrentCaseToXhs(this, 'image')">${t.localPublishXhsImage}</button>` : ''}
        ${hasVideoMedia ? `<button class="view-full-btn" id="publishXhsVideoBtn" onclick="publishCurrentCaseToXhs(this, 'video')">${t.localPublishXhsVideo}</button>` : ''}
        <button class="view-full-btn" onclick="deleteCurrentCase()">${t.localDelete}</button>
      </div>

      ${summary ? `<div class="detail-block"><h3>📝 ${t.summaryHeading}</h3><p>${escapeHtml(summary)}</p></div>` : ''}
      <div class="detail-block">
        <div class="prompt-head-row">
          <h3>🎨 ${t.promptCnHeading}${zhFallback ? ` <span class="fallback-badge">${t.promptCnFallback}</span>` : ''}</h3>
          <button type="button" class="prompt-copy-btn" onclick='copyPromptText(${JSON.stringify(zhPrompt)}, this)'>${t.copyLabel}</button>
        </div>
        <div data-nosnippet>${zhPrompt ? formatMultilineText(zhPrompt) : `<p>${escapeHtml(t.detailNoPrompt)}</p>`}</div>
      </div>
      <div class="detail-block">
        <div class="prompt-head-row">
          <h3>🎨 ${t.promptEnHeading}${enFallback ? ` <span class="fallback-badge">${t.promptEnFallback}</span>` : ''}</h3>
          <button type="button" class="prompt-copy-btn" onclick='copyPromptText(${JSON.stringify(enPrompt)}, this)'>${t.copyLabel}</button>
        </div>
        <div data-nosnippet>${enPrompt ? formatMultilineText(enPrompt) : `<p>${escapeHtml(t.detailNoPrompt)}</p>`}</div>
      </div>
      ${imagesHtml}
      ${videosHtml}
      ${sourceHtml}
    </div>

    <script>
      (function () {
        const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
        if (isLocal) {
          const row = document.getElementById('localActionRow');
          if (row) row.style.display = 'flex';
        }
      })();

      async function copyPromptText(text, button) {
        const value = (typeof text === 'string' ? text : '').trim();
        if (!value) {
          alert(${JSON.stringify(t.detailNoPrompt)});
          return;
        }
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
          } else {
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          if (button) {
            const original = button.textContent;
            button.textContent = ${JSON.stringify(t.copiedLabel)};
            setTimeout(() => {
              button.textContent = original;
            }, 1200);
          }
        } catch (err) {
          alert(${JSON.stringify(t.copyFailed)});
        }
      }

      async function publishCurrentCase(button) {
        if (!button) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = ${JSON.stringify(t.publishLoading)};
        try {
          const res = await fetch('/api/wechat-publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId: ${Number(item.id)} })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error((data && (data.error || data.message)) || 'Publish failed');
          }
          alert((data && data.data && data.data.message) || 'OK');
        } catch (err) {
          alert('❌ ' + (err.message || 'Publish failed'));
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      }

      async function publishCurrentCaseToXhs(button, preferredMedia) {
        if (!button) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = ${JSON.stringify(t.publishXhsLoading)};
        try {
          const res = await fetch('/api/xhs-publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemId: ${Number(item.id)},
              preferredMedia: preferredMedia || 'image'
            })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error((data && (data.error || data.message)) || 'XHS publish failed');
          }
          alert((data && data.data && data.data.message) || 'OK');
        } catch (err) {
          alert('❌ ' + (err.message || 'XHS publish failed'));
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      }

      async function deleteCurrentCase() {
        if (!confirm(${JSON.stringify(t.deleteConfirm)})) return;
        try {
          const res = await fetch('/api/delete-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: ${Number(item.id)} })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error((data && data.error) || 'Delete failed');
          }
          alert(${JSON.stringify(t.deleteSuccess)});
          window.location.href = ${JSON.stringify(toLangHref(lang, `/${navKey}/`))};
        } catch (err) {
          alert('❌ ' + (err.message || 'Delete failed'));
        }
      }
    </script>
  `;

  return renderPageTemplate({
    lang,
    title: `${caseTitle || 'Case'} #${caseId}`,
    description: summary || cleanText(item.title) || 'AI prompt case',
    canonicalPath: detailPath,
    currentNav: currentNavByItem(item),
    stats,
    content
  });
}

function currentNavByItem(item) {
  const tags = normalizeTags(item.tags);
  if (tags.includes('系统提示词')) return 'text';
  if (Array.isArray(item.videos) && item.videos.length > 0) return 'video';
  return 'image';
}

function renderRootRedirectPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gem Nana</title>
  <meta name="description" content="Gem Nana AI Prompt Library">
  <script>
    (function () {
      try {
        const prefers = (navigator.languages || [navigator.language || '']).join(',').toLowerCase();
        const lang = prefers.includes('zh') ? 'zh' : 'en';
        const target = '/' + lang + '/index.html' + window.location.search + window.location.hash;
        window.location.replace(target);
      } catch (e) {
        window.location.replace('/zh/index.html');
      }
    })();
  </script>
</head>
<body>
  <p>Redirecting… If not redirected, open <a href="/zh/index.html">中文</a> / <a href="/en/index.html">English</a>.</p>
</body>
</html>`;
}

function writePaginatedListPages({
  lang,
  langRoot,
  baseCanonicalPath,
  currentNav,
  title,
  subtitle,
  description,
  allItems,
  stats,
  listKey,
  enableLoadMore = true
}) {
  const pages = paginateItems(allItems);
  const totalPages = pages.length;
  const chunkBaseUrl = getChunkBaseUrl(lang, listKey);
  const chunkDir = path.join(langRoot, 'chunks', listKey);
  ensureDir(chunkDir);

  for (let idx = 0; idx < pages.length; idx += 1) {
    const pageNo = idx + 1;
    const pageItems = pages[idx];
    if (pageNo > 1) {
      writeFile(
        path.join(chunkDir, `${pageNo}.html`),
        pageItems.map((item) => renderCaseCard(item, lang)).join('\n')
      );
    }

    const canonicalPath = getPagedCanonicalPath(baseCanonicalPath, pageNo);
    const pageOutputPath = getPageOutputPath(langRoot, baseCanonicalPath, pageNo);
    const pageTitle = pageNo > 1
      ? `${title} - ${lang === 'zh' ? `第${pageNo}页` : `Page ${pageNo}`}`
      : title;
    const pageDescription = pageNo > 1
      ? `${description} (${lang === 'zh' ? `第${pageNo}页` : `Page ${pageNo}`})`
      : description;

    writeFile(
      pageOutputPath,
      renderListPage({
        lang,
        canonicalPath,
        currentNav,
        title: pageTitle,
        subtitle,
        description: pageDescription,
        items: pageItems,
        stats,
        allItemsForFilters: allItems,
        currentPage: pageNo,
        totalPages,
        chunkBaseUrl,
        enableLoadMore
      })
    );
  }

  return totalPages;
}

function generateLanguagePages(lang, items, groups, stats) {
  const t = LANGS[lang];
  const langRoot = path.join(ROOT_DIR, lang);
  ensureDir(langRoot);

  const sortedAll = sortByIdDesc(items);
  const sortedImage = sortByIdDesc(groups.image);
  const sortedVideo = sortByIdDesc(groups.video);
  const sortedText = sortByIdDesc(groups.text);

  // Home
  const homePages = writePaginatedListPages({
    lang,
    langRoot,
    baseCanonicalPath: '/',
    currentNav: 'home',
    title: t.latestTitle,
    subtitle: t.latestDesc(stats.total),
    description: t.latestDesc(stats.total),
    allItems: sortedAll,
    stats,
    listKey: 'home'
  });

  // Image
  const imagePages = writePaginatedListPages({
    lang,
    langRoot,
    baseCanonicalPath: '/image/',
    currentNav: 'image',
    title: t.imageTitle,
    subtitle: t.imageDesc(sortedImage.length),
    description: t.imageDesc(sortedImage.length),
    allItems: sortedImage,
    stats,
    listKey: 'image'
  });

  // Video
  const videoPages = writePaginatedListPages({
    lang,
    langRoot,
    baseCanonicalPath: '/video/',
    currentNav: 'video',
    title: t.videoTitle,
    subtitle: t.videoDesc(sortedVideo.length),
    description: t.videoDesc(sortedVideo.length),
    allItems: sortedVideo,
    stats,
    listKey: 'video'
  });

  // Text
  const textPages = writePaginatedListPages({
    lang,
    langRoot,
    baseCanonicalPath: '/text/',
    currentNav: 'text',
    title: t.textTitle,
    subtitle: t.textDesc(sortedText.length),
    description: t.textDesc(sortedText.length),
    allItems: sortedText,
    stats,
    listKey: 'text'
  });

  // Image tag pages (>= 10)
  const tagStats = getTagStats(sortedImage);
  const tagPairs = Object.entries(tagStats).filter(([, count]) => count >= 10).sort((a, b) => b[1] - a[1]);
  let tagPageCount = 0;
  for (const [tag, count] of tagPairs) {
    const filename = tagToFilename(tag);
    const tagItems = sortedImage.filter((item) => normalizeTags(item.tags).includes(tag));
    const displayTag = toDisplayTag(tag, lang);
    const pageTitle = `${displayTag} · ${t.imageTitle}`;
    const pageDesc = `${count} ${lang === 'zh' ? '条' : ''} ${displayTag} ${lang === 'zh' ? '相关案例' : 'related cases'}`;

    const listKey = listKeyFromTagFilename(filename);
    tagPageCount += writePaginatedListPages({
      lang,
      langRoot,
      baseCanonicalPath: `/image/${filename}`,
      currentNav: 'image',
      title: pageTitle,
      subtitle: pageDesc,
      description: pageDesc,
      allItems: tagItems,
      stats,
      listKey
    });
  }

  // Detail pages
  for (const item of sortedAll) {
    writeFile(
      path.join(langRoot, 'case', `${Number(item.id)}.html`),
      renderDetailPage({ lang, item, stats })
    );
  }

  console.log(`✅ ${lang.toUpperCase()} generated: home(${homePages})/image(${imagePages})/video(${videoPages})/text(${textPages}) + ${tagPairs.length} tag groups (${tagPageCount} pages) + ${sortedAll.length} details`);
}

async function main() {
  console.log('🚀 Start generating bilingual static pages...\n');

  const items = loadItems();
  await enrichEnglishTitleSummary(items);
  const groups = groupByMediaType(items);
  const stats = {
    total: items.length,
    image: groups.image.length,
    video: groups.video.length,
    text: groups.text.length
  };

  console.log(`📊 Items: ${stats.total} (image=${stats.image}, video=${stats.video}, text=${stats.text})`);

  // Root redirect page
  writeFile(path.join(ROOT_DIR, 'index.html'), renderRootRedirectPage());

  // Bilingual pages
  generateLanguagePages('zh', items, groups, stats);
  generateLanguagePages('en', items, groups, stats);

  console.log('\n🎉 Bilingual pages generated successfully.');
}

main().catch((error) => {
  console.error('❌ Page generation failed:', error.message || error);
  process.exit(1);
});
