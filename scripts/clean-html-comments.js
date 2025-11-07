#!/usr/bin/env node

/**
 * 清理 JSON 数据中的 HTML 注释
 */

const fs = require('fs');
const path = require('path');

const FILES = [
  'data/contents.json',
  'data/latest.json',
  'data/archive.json'
];

function cleanHtmlComments(text) {
  if (!text) return text;

  // 移除 HTML 注释 <!-- ... -->
  return text.replace(/<!--[\s\S]*?-->/g, '').trim();
}

function cleanFile(filePath) {
  console.log(`\n📝 处理文件: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.log('  ⚠️  文件不存在，跳过');
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let cleanedCount = 0;

  data.items.forEach(item => {
    let needsClean = false;

    // 清理中文内容
    if (item.contentChinese && item.contentChinese.includes('<!--')) {
      const before = item.contentChinese;
      item.contentChinese = cleanHtmlComments(item.contentChinese);
      if (before !== item.contentChinese) {
        needsClean = true;
      }
    }

    // 清理英文内容
    if (item.contentEnglish && item.contentEnglish.includes('<!--')) {
      const before = item.contentEnglish;
      item.contentEnglish = cleanHtmlComments(item.contentEnglish);
      if (before !== item.contentEnglish) {
        needsClean = true;
      }
    }

    // 清理通用content字段
    if (item.content && item.content.includes('<!--')) {
      const before = item.content;
      item.content = cleanHtmlComments(item.content);
      if (before !== item.content) {
        needsClean = true;
      }
    }

    if (needsClean) {
      cleanedCount++;
    }
  });

  // 保存清理后的数据
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  ✅ 清理完成: ${cleanedCount} 个案例被修复`);
}

console.log('🧹 开始清理 HTML 注释...\n');
console.log('='.repeat(60));

FILES.forEach(cleanFile);

console.log('\n' + '='.repeat(60));
console.log('✅ 所有文件清理完成！');
