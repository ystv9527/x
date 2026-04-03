#!/usr/bin/env node
/**
 * Generate bilingual static pages:
 * - /zh/* and /en/*
 * - per-case detail pages: /{lang}/case/{id}.html
 * - root / index redirect by browser language
 */

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://gemnana.com';
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONTENTS_FILE = path.join(DATA_DIR, 'contents.json');
const LATEST_FILE = path.join(DATA_DIR, 'latest.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'archive.json');

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
    localDelete: '删除该案例',
    publishLoading: '发布中...',
    deleteConfirm: '确认删除该案例？此操作不可恢复。',
    deleteSuccess: '删除成功',
    settingsLabel: '⚙️ 设置'
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
    localDelete: 'Delete this case',
    publishLoading: 'Publishing...',
    deleteConfirm: 'Delete this case? This action cannot be undone.',
    deleteSuccess: 'Deleted successfully',
    settingsLabel: '⚙️ Settings'
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

function getAbsoluteAssetPath(assetPath) {
  const clean = String(assetPath || '').replace(/^\/+/, '');
  return `/${clean}`;
}

function buildSearchText(item, lang) {
  const prompt = getPromptByLang(item, lang).text.slice(0, 300);
  const tags = normalizeTags(item.tags).join(' ');
  const base = [
    item.caseNumber || '',
    item.title || '',
    item.summary || '',
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

  const tagsHtml = tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const summary = cleanText(item.summary);

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
          <h3 class="case-title">${escapeHtml(item.caseNumber || '')}: ${escapeHtml(item.title || '')}</h3>
          ${summary ? `<p class="case-summary">${escapeHtml(summary)}</p>` : ''}
          <div class="case-meta">
            <span class="case-date">${escapeHtml(item.date || '')}</span>
            <span class="case-source">${escapeHtml(item.source || '')}</span>
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
      })();
    </script>
  `;
}

function renderFilterScript(lang) {
  const t = LANGS[lang];
  const textConfig = JSON.stringify({ countText: t.countText, noResults: t.noResults });
  return `
    <script>
      (function () {
        const config = ${textConfig};
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearFilters');
        const tagButtons = Array.from(document.querySelectorAll('.tag-filter'));
        const cards = Array.from(document.querySelectorAll('.case-card'));
        const statsText = document.getElementById('statsText');
        const noResults = document.getElementById('noResults');
        if (!cards.length) return;

        let activeTag = '';

        function applyFilters() {
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

        applyFilters();
      })();
    </script>
  `;
}

function renderHead({ lang, title, description, canonicalPath }) {
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
      .fallback-badge { color: rgba(255, 183, 77, 0.95); font-size: 11px; font-weight: 500; }
      .detail-body { max-width: 980px; }
      .detail-block { margin-bottom: 20px; padding: 16px; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background: rgba(10,15,35,0.45); }
      .detail-block h3 { margin: 0 0 12px 0; color: #fff; font-size: 18px; }
      .detail-block p { margin: 0 0 10px 0; color: rgba(255,255,255,0.86); line-height: 1.7; }
      .detail-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
      .detail-media-grid img, .detail-media-grid video { width: 100%; border-radius: 8px; background: rgba(0,0,0,0.3); }
      .source-link { color: #77c5ff; text-decoration: none; word-break: break-all; }
      .source-link:hover { text-decoration: underline; }
      .local-action-row { display: none; gap: 10px; margin-bottom: 16px; }
      .local-action-row .view-full-btn { width: auto; min-width: 180px; }
    </style>
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
  `;
}

function renderPageTemplate({ lang, title, description, canonicalPath, currentNav, stats, content, withFilterScript = false }) {
  return `<!DOCTYPE html>
<html lang="${LANGS[lang].htmlLang}">
<head>
${renderHead({ lang, title, description, canonicalPath })}
</head>
<body class="layout-sidebar">
${renderSidebar(lang, currentNav, stats, canonicalPath)}
<main class="main-content">
${content}
</main>
${renderBaseScripts()}
${withFilterScript ? renderFilterScript(lang) : ''}
</body>
</html>`;
}

function renderControls(lang, items) {
  const t = LANGS[lang];
  const tagStats = getTagStats(items);
  const tags = Object.entries(tagStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  const tagsHtml = tags
    .map(([tag, count]) => `<button type="button" class="tag-filter" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)} (${count})</button>`)
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
      <div class="stats"><span id="statsText">${t.countText.replace('{count}', String(items.length))}</span></div>
    </div>
    <div id="noResults" class="no-results" style="display:none;">${t.noResults}</div>
  `;
}

function renderListPage({ lang, canonicalPath, currentNav, title, subtitle, description, items, stats }) {
  const cardsHtml = items.map((item) => renderCaseCard(item, lang)).join('\n');
  const content = `
    <div class="page-header">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </div>
    ${renderControls(lang, items)}
    <div class="case-grid">${cardsHtml}</div>
  `;
  return renderPageTemplate({
    lang,
    title,
    description,
    canonicalPath,
    currentNav,
    stats,
    content,
    withFilterScript: true
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
  const summary = cleanText(item.summary);
  const detailPath = getDetailPath(item);
  const navKey = currentNavByItem(item);

  const images = Array.isArray(item.images) ? item.images : [];
  const videos = Array.isArray(item.videos) ? item.videos : [];

  const imagesHtml = images.length
    ? `<div class="detail-block"><h3>📷 ${t.imagesHeading}</h3><div class="detail-media-grid">${images.map((img) => `<img src="${getAbsoluteAssetPath(img)}" alt="${escapeAttr(item.title || '')}" loading="lazy">`).join('')}</div></div>`
    : '';
  const videosHtml = videos.length
    ? `<div class="detail-block"><h3>🎬 ${t.videosHeading}</h3><div class="detail-media-grid">${videos.map((video) => `<video controls><source src="${getAbsoluteAssetPath(video)}" type="video/mp4"></video>`).join('')}</div></div>`
    : '';
  const sourceHtml = cleanText(item.url)
    ? `<div class="detail-block"><h3>🔗 ${t.sourceHeading}</h3><a class="source-link" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></div>`
    : '';

  const content = `
    <div class="page-header detail-body">
      <nav class="breadcrumb">
        <a href="${toLangHref(lang, '/')}">${LANGS[lang].nav.home}</a><span>›</span>
        <a href="${toLangHref(lang, `/${navKey}/`)}">${LANGS[lang].nav[navKey]}</a><span>›</span>
        <span>${escapeHtml(item.caseNumber || '')}</span>
      </nav>
      <h1>${escapeHtml(item.caseNumber || '')}: ${escapeHtml(item.title || '')}</h1>
      <p>${escapeHtml(item.date || '')}　${escapeHtml(item.source || '')}</p>
      <p><a class="source-link" href="${toLangHref(lang, `/${navKey}/`)}">${t.backToList}</a></p>
    </div>

    <div class="detail-body">
      <div id="localActionRow" class="local-action-row">
        <button class="view-full-btn" id="publishBtn" onclick="publishCurrentCase(this)">${t.localPublish}</button>
        <button class="view-full-btn" onclick="deleteCurrentCase()">${t.localDelete}</button>
      </div>

      ${summary ? `<div class="detail-block"><h3>📝 ${t.summaryHeading}</h3><p>${escapeHtml(summary)}</p></div>` : ''}
      <div class="detail-block">
        <h3>🎨 ${t.promptCnHeading}${zhFallback ? ` <span class="fallback-badge">${t.promptCnFallback}</span>` : ''}</h3>
        ${zhPrompt ? formatMultilineText(zhPrompt) : `<p>${escapeHtml(t.detailNoPrompt)}</p>`}
      </div>
      <div class="detail-block">
        <h3>🎨 ${t.promptEnHeading}${enFallback ? ` <span class="fallback-badge">${t.promptEnFallback}</span>` : ''}</h3>
        ${enPrompt ? formatMultilineText(enPrompt) : `<p>${escapeHtml(t.detailNoPrompt)}</p>`}
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

      async function publishCurrentCase(button) {
        if (!button) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = ${JSON.stringify(t.localPublish === 'Publish to WeChat Draft' ? t.publishLoading : t.publishLoading)};
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
    title: `${item.caseNumber || ''}: ${item.title || ''}`,
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

function generateLanguagePages(lang, items, groups, stats) {
  const t = LANGS[lang];
  const langRoot = path.join(ROOT_DIR, lang);
  ensureDir(langRoot);

  const sortedAll = sortByIdDesc(items);
  const sortedImage = sortByIdDesc(groups.image);
  const sortedVideo = sortByIdDesc(groups.video);
  const sortedText = sortByIdDesc(groups.text);

  // Home
  writeFile(
    path.join(langRoot, 'index.html'),
    renderListPage({
      lang,
      canonicalPath: '/',
      currentNav: 'home',
      title: t.latestTitle,
      subtitle: t.latestDesc(stats.total),
      description: t.latestDesc(stats.total),
      items: sortedAll,
      stats
    })
  );

  // Image
  writeFile(
    path.join(langRoot, 'image', 'index.html'),
    renderListPage({
      lang,
      canonicalPath: '/image/',
      currentNav: 'image',
      title: t.imageTitle,
      subtitle: t.imageDesc(sortedImage.length),
      description: t.imageDesc(sortedImage.length),
      items: sortedImage,
      stats
    })
  );

  // Video
  writeFile(
    path.join(langRoot, 'video', 'index.html'),
    renderListPage({
      lang,
      canonicalPath: '/video/',
      currentNav: 'video',
      title: t.videoTitle,
      subtitle: t.videoDesc(sortedVideo.length),
      description: t.videoDesc(sortedVideo.length),
      items: sortedVideo,
      stats
    })
  );

  // Text
  writeFile(
    path.join(langRoot, 'text', 'index.html'),
    renderListPage({
      lang,
      canonicalPath: '/text/',
      currentNav: 'text',
      title: t.textTitle,
      subtitle: t.textDesc(sortedText.length),
      description: t.textDesc(sortedText.length),
      items: sortedText,
      stats
    })
  );

  // Image tag pages (>= 10)
  const tagStats = getTagStats(sortedImage);
  const tagPairs = Object.entries(tagStats).filter(([, count]) => count >= 10).sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of tagPairs) {
    const filename = tagToFilename(tag);
    const tagItems = sortedImage.filter((item) => normalizeTags(item.tags).includes(tag));
    const pageTitle = `${tag} · ${t.imageTitle}`;
    const pageDesc = `${count} ${lang === 'zh' ? '条' : ''} ${tag} ${lang === 'zh' ? '相关案例' : 'related cases'}`;

    writeFile(
      path.join(langRoot, 'image', filename),
      renderListPage({
        lang,
        canonicalPath: `/image/${filename}`,
        currentNav: 'image',
        title: pageTitle,
        subtitle: pageDesc,
        description: pageDesc,
        items: tagItems,
        stats
      })
    );
  }

  // Detail pages
  for (const item of sortedAll) {
    writeFile(
      path.join(langRoot, 'case', `${Number(item.id)}.html`),
      renderDetailPage({ lang, item, stats })
    );
  }

  console.log(`✅ ${lang.toUpperCase()} generated: home/image/video/text + ${tagPairs.length} tag pages + ${sortedAll.length} details`);
}

function main() {
  console.log('🚀 Start generating bilingual static pages...\n');

  const items = loadItems();
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

main();
