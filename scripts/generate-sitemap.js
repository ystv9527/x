#!/usr/bin/env node
/**
 * Generate bilingual sitemap.xml:
 * - /
 * - /zh/*, /en/*
 * - /{lang}/case/{id}.html
 */

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://gemnana.com';
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'sitemap.xml');
const CONTENTS_FILE = path.join(ROOT_DIR, 'data', 'contents.json');

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function scanHtmlFiles(dirPath, baseUrlPrefix) {
  const out = [];
  if (!fs.existsSync(dirPath)) return out;

  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    if (file === 'index-old.html') continue;
    if (file === 'index.html') continue;
    out.push(`${baseUrlPrefix}/${file}`);
  }
  return out;
}

function scanPaginatedIndexes(dirPath, baseUrlPrefix) {
  const out = [];
  const pageDir = path.join(dirPath, 'page');
  if (!fs.existsSync(pageDir)) return out;

  const entries = fs.readdirSync(pageDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(pageDir, entry.name, 'index.html');
    if (!fs.existsSync(indexPath)) continue;
    out.push(`${baseUrlPrefix}/page/${entry.name}/`);
  }

  return out.sort((a, b) => {
    const ai = Number((a.match(/\/page\/(\d+)\//) || [])[1] || 0);
    const bi = Number((b.match(/\/page\/(\d+)\//) || [])[1] || 0);
    return ai - bi;
  });
}

function scanTagPaginatedIndexes(imageDirPath, baseUrlPrefix) {
  const out = [];
  if (!fs.existsSync(imageDirPath)) return out;

  const pageRoot = path.join(imageDirPath, 'page');
  if (!fs.existsSync(pageRoot)) return out;

  const pageEntries = fs.readdirSync(pageRoot, { withFileTypes: true });
  for (const pageEntry of pageEntries) {
    if (!pageEntry.isDirectory()) continue;
    const pageNo = pageEntry.name;
    const pageDir = path.join(pageRoot, pageNo);
    const files = fs.readdirSync(pageDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      if (!file.name.endsWith('.html')) continue;
      out.push(`${baseUrlPrefix}/page/${pageNo}/${file.name}`);
    }
  }

  return out.sort((a, b) => {
    const ap = a.match(/\/page\/(\d+)\//);
    const bp = b.match(/\/page\/(\d+)\//);
    const ai = Number(ap ? ap[1] : 0);
    const bi = Number(bp ? bp[1] : 0);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

function loadCaseIds() {
  if (!fs.existsSync(CONTENTS_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(CONTENTS_FILE, 'utf8'));
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((it) => Number(it.id)).filter((id) => Number.isFinite(id));
  } catch {
    return [];
  }
}

function generateSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const entries = [];

  // Root language router
  entries.push(urlEntry(`${SITE_URL}/`, today, 'daily', '1.0'));

  const langs = ['zh', 'en'];
  const caseIds = loadCaseIds();

  for (const lang of langs) {
    entries.push(urlEntry(`${SITE_URL}/${lang}/`, today, 'daily', '0.95'));
    entries.push(urlEntry(`${SITE_URL}/${lang}/image/`, today, 'daily', '0.9'));
    entries.push(urlEntry(`${SITE_URL}/${lang}/video/`, today, 'weekly', '0.85'));
    entries.push(urlEntry(`${SITE_URL}/${lang}/text/`, today, 'weekly', '0.85'));

    // Keep paginated archive URLs out of sitemap to avoid low-intent index bloat.
    const pagedUrls = [];

    // Tag pages under /{lang}/image/*.html
    const tagPages = scanHtmlFiles(path.join(ROOT_DIR, lang, 'image'), `/${lang}/image`);
    for (const tagUrl of tagPages) {
      entries.push(urlEntry(`${SITE_URL}${tagUrl}`, today, 'weekly', '0.8'));
    }

    // Detail pages
    for (const id of caseIds) {
      entries.push(urlEntry(`${SITE_URL}/${lang}/case/${id}.html`, today, 'weekly', '0.75'));
    }

    console.log(`[sitemap] ${lang.toUpperCase()} paged: ${pagedUrls.length} (excluded), tag pages: ${tagPages.length}, details: ${caseIds.length}`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${entries.join('\n')}
</urlset>`;

  fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');

  console.log('[ok] sitemap.xml generated:', OUTPUT_FILE);
  console.log(`[info] URL count: ${entries.length}`);
}

try {
  generateSitemap();
} catch (error) {
  console.error('[error] Failed to generate sitemap:', error.message || error);
  process.exit(1);
}

