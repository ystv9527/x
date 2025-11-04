#!/usr/bin/env node

/**
 * 快速添加内容工具 - 从剪贴板或输入快速添加
 * 使用方法: node scripts/quick-add.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function getCurrentDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

async function quickAdd() {
  console.log('\n=== 快速添加内容 ===\n');

  const title = await question('标题: ');
  const url = await question('链接: ');
  const tags = await question('标签 (用逗号分隔): ');

  console.log('\n粘贴内容 (输入 END 结束):');
  const contentLines = [];
  while (true) {
    const line = await question('');
    if (line.trim() === 'END') break;
    contentLines.push(line);
  }

  const date = getCurrentDate();
  const content = contentLines.join('\n');

  // 简化的Markdown格式
  let md = `\n## ${title}\n`;
  md += `- **链接**: ${url}\n`;
  md += `- **日期**: ${date}\n`;
  md += `- **标签**: ${tags}\n\n`;
  md += `${content}\n\n`;
  md += `---\n\n`;

  // 保存
  const collectionPath = path.join(__dirname, '../content/collection.md');
  fs.appendFileSync(collectionPath, md, 'utf-8');

  console.log('\n✅ 已添加！');
  rl.close();
}

quickAdd();
