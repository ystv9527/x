#!/usr/bin/env node
/**
 * 生成 sitemap.xml
 * 用于 SEO 优化，帮助搜索引擎索引网站内容
 */

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://gemnana.com';
const OUTPUT_FILE = path.join(__dirname, '..', 'sitemap.xml');

/**
 * 转义 XML 特殊字符
 */
function escapeXml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * 生成 URL 条目
 */
function generateUrlEntry(loc, lastmod, changefreq, priority) {
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

/**
 * 读取 JSON 数据
 */
function loadJsonData(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.warn(`⚠️  无法读取 ${filePath}:`, error.message);
        return null;
    }
}

/**
 * 生成 sitemap.xml
 */
function generateSitemap() {
    console.log('🗺️  开始生成 sitemap.xml...');

    const urls = [];
    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. 添加主页
    urls.push(generateUrlEntry(
        SITE_URL + '/',
        now,
        'daily',
        '1.0'
    ));

    // 2. 读取最新数据
    const latestPath = path.join(__dirname, '..', 'data', 'latest.json');
    const latestData = loadJsonData(latestPath);

    // 3. 读取历史数据
    const archivePath = path.join(__dirname, '..', 'data', 'archive.json');
    const archiveData = loadJsonData(archivePath);

    // 收集所有案例
    const allItems = [];

    if (latestData && latestData.items) {
        allItems.push(...latestData.items);
    }

    if (archiveData && archiveData.items) {
        allItems.push(...archiveData.items);
    }

    console.log(`📊 找到 ${allItems.length} 个案例`);

    // 4. 为每个案例添加 URL（如果有详情页的话）
    // 目前是 SPA，所以先只添加主页
    // 如果未来每个案例有独立页面，可以这样添加：
    /*
    allItems.forEach(item => {
        if (item.id) {
            urls.push(generateUrlEntry(
                `${SITE_URL}/prompt/${item.id}`,
                item.updatedAt || now,
                'weekly',
                '0.8'
            ));
        }
    });
    */

    // 5. 添加静态页面（如果有的话）
    // urls.push(generateUrlEntry(
    //     SITE_URL + '/about',
    //     now,
    //     'monthly',
    //     '0.5'
    // ));

    // 6. 生成完整的 XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls.join('\n')}
</urlset>`;

    // 7. 写入文件
    fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');

    console.log(`✅ sitemap.xml 已生成: ${OUTPUT_FILE}`);
    console.log(`📍 包含 ${urls.length} 个 URL`);
    console.log(`🌐 网站地址: ${SITE_URL}`);
    console.log(`📅 生成时间: ${now}`);
    console.log('');
    console.log('📝 提示：');
    console.log('   1. 将 sitemap.xml 部署到网站根目录');
    console.log('   2. 访问 https://search.google.com/search-console');
    console.log('   3. 提交 sitemap: https://gemnana.com/sitemap.xml');
    console.log('   4. 等待 Google 索引你的网站');
}

// 执行生成
try {
    generateSitemap();
} catch (error) {
    console.error('❌ 生成失败:', error);
    process.exit(1);
}
