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

    // Tag pages under /{lang}/image/*.html
    const tagPages = scanHtmlFiles(path.join(ROOT_DIR, lang, 'image'), `/${lang}/image`);
    for (const tagUrl of tagPages) {
      entries.push(urlEntry(`${SITE_URL}${tagUrl}`, today, 'weekly', '0.8'));
    }

    // Detail pages
    for (const id of caseIds) {
      entries.push(urlEntry(`${SITE_URL}/${lang}/case/${id}.html`, today, 'weekly', '0.75'));
    }

    console.log(`📄 ${lang.toUpperCase()} tag pages: ${tagPages.length}, details: ${caseIds.length}`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${entries.join('\n')}
</urlset>`;

  fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');

  console.log('✅ sitemap.xml generated:', OUTPUT_FILE);
  console.log(`📍 URL count: ${entries.length}`);
}

try {
  generateSitemap();
} catch (error) {
  console.error('❌ Failed to generate sitemap:', error.message || error);
  process.exit(1);
}

