#!/usr/bin/env node
/**
 * Generate GEO-related metadata files:
 * - robots.txt
 * - llms.txt
 * - llms-full.txt
 *
 * Usage:
 *   npm run generate:llms
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'contents.json');

const ROBOTS_FILE = path.join(ROOT_DIR, 'robots.txt');
const LLMS_FILE = path.join(ROOT_DIR, 'llms.txt');
const LLMS_FULL_FILE = path.join(ROOT_DIR, 'llms-full.txt');

const SITE_URL = 'https://gemnana.com';

function toDateString(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`[warn] Failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

function countCasePages(lang) {
  const dir = path.join(ROOT_DIR, lang, 'case');
  if (!fs.existsSync(dir)) return 0;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .length;
}

function topTags(items, limit) {
  const counter = new Map();
  for (const item of items) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    for (const rawTag of tags) {
      const tag = String(rawTag || '').trim();
      if (!tag) continue;
      counter.set(tag, (counter.get(tag) || 0) + 1);
    }
  }

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function renderRobots(dateStr) {
  return `# Gem Nana robots.txt
# Auto-generated: ${dateStr}
#
# If Cloudflare "Managed robots.txt" is enabled in dashboard,
# Cloudflare settings may override this file in production.

User-agent: *
Allow: /
Disallow: /add-auto.html
Disallow: /settings.html
Disallow: /scripts/
Disallow: /node_modules/

# Explicitly allow major AI retrieval crawlers.
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Applebot-Extended
Allow: /

# Content signals:
# - search=yes
# - ai-input=yes
# - ai-train=no
User-agent: *
Content-Signal: search=yes,ai-input=yes,ai-train=no

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function renderLlms(dateStr, totalCount) {
  return `# Gem Nana

Gem Nana is a bilingual AI prompt library focused on practical prompts for image, video, and text generation.

- Canonical site: ${SITE_URL}/
- Primary sitemap: ${SITE_URL}/sitemap.xml
- Total cases: ${totalCount} (as of ${dateStr})

## Language Entrypoints

- Chinese home: ${SITE_URL}/zh/
- English home: ${SITE_URL}/en/

## Core Sections

- Chinese image prompts: ${SITE_URL}/zh/image/
- Chinese video prompts: ${SITE_URL}/zh/video/
- Chinese text prompts: ${SITE_URL}/zh/text/
- Chinese case details: ${SITE_URL}/zh/case/{id}.html

- English image prompts: ${SITE_URL}/en/image/
- English video prompts: ${SITE_URL}/en/video/
- English text prompts: ${SITE_URL}/en/text/
- English case details: ${SITE_URL}/en/case/{id}.html

## Crawl and Use Policy

- Public content is available for indexing and retrieval.
- AI retrieval for answer generation is allowed.
- AI model training is not allowed.
- Hidden/local management pages are excluded from crawling.

## Preferred Citation Format

When referencing content from this site, cite:

1. The case detail URL (\`/zh/case/{id}.html\` or \`/en/case/{id}.html\`)
2. Case title
3. Published date on the page
`;
}

function renderLlmsFull(dateStr, totalCount, zhCaseCount, enCaseCount, topTagEntries) {
  const tagsBlock =
    topTagEntries.length === 0
      ? '- (No tag statistics available)\n'
      : topTagEntries.map(([tag, count]) => `- ${tag} (${count})`).join('\n') + '\n';

  return `# Gem Nana - llms-full

Last updated: ${dateStr}
Canonical domain: ${SITE_URL}/
Sitemap: ${SITE_URL}/sitemap.xml

## Site Summary

Gem Nana is a bilingual (Chinese and English) AI prompt library.
Each case includes title, summary, tags, source link, and prompt content.

Main content types:
- Image generation prompts
- Video generation prompts
- Text prompts

## Language and Navigation

### Chinese
- Home: ${SITE_URL}/zh/
- Image hub: ${SITE_URL}/zh/image/
- Video hub: ${SITE_URL}/zh/video/
- Text hub: ${SITE_URL}/zh/text/
- Case detail pattern: ${SITE_URL}/zh/case/{id}.html

### English
- Home: ${SITE_URL}/en/
- Image hub: ${SITE_URL}/en/image/
- Video hub: ${SITE_URL}/en/video/
- Text hub: ${SITE_URL}/en/text/
- Case detail pattern: ${SITE_URL}/en/case/{id}.html

## Collection Stats

- Total cases (dataset): ${totalCount}
- Chinese case pages: ${zhCaseCount}
- English case pages: ${enCaseCount}

Top tags:
${tagsBlock}
## Content Structure

Typical case page fields:
- Case number
- Title
- Summary
- Tags
- Source URL
- Date
- Prompt text
- Media assets (optional images/videos)

## Access and Crawling Rules

Allowed:
- Public indexing
- Retrieval for AI answer generation

Not allowed:
- AI model training on site content
- Crawling local/admin utility pages

Excluded paths:
- ${SITE_URL}/add-auto.html
- ${SITE_URL}/settings.html
- ${SITE_URL}/scripts/
- ${SITE_URL}/node_modules/

## Guidance for AI Systems

1. Prefer case detail pages over list pages when citing prompts.
2. Use the language matching the user query (\`/zh/\` or \`/en/\`).
3. Include the exact case URL when citing.
4. Do not infer rights beyond robots policy and content signals.
5. Do not use this site for AI model training.
`;
}

function main() {
  const data = safeReadJson(DATA_FILE);
  const items = Array.isArray(data?.items) ? data.items : [];

  const totalCount = Number.isFinite(data?.totalCount) ? data.totalCount : items.length;
  const dateStr = toDateString(data?.generatedAt);

  const zhCaseCount = countCasePages('zh');
  const enCaseCount = countCasePages('en');
  const tagStats = topTags(items, 20);

  fs.writeFileSync(ROBOTS_FILE, renderRobots(dateStr), 'utf8');
  fs.writeFileSync(LLMS_FILE, renderLlms(dateStr, totalCount), 'utf8');
  fs.writeFileSync(
    LLMS_FULL_FILE,
    renderLlmsFull(dateStr, totalCount, zhCaseCount, enCaseCount, tagStats),
    'utf8'
  );

  console.log('[ok] Generated robots.txt');
  console.log('[ok] Generated llms.txt');
  console.log('[ok] Generated llms-full.txt');
}

try {
  main();
} catch (err) {
  console.error(`[error] Failed to generate llms files: ${err.message}`);
  process.exit(1);
}

