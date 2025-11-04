#!/usr/bin/env node

/**
 * 内容添加工具 - 半自动整理内容到Markdown
 * 使用方法: npm run add
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 工具函数：提问并获取输入
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// 获取当前日期 YYYY-MM-DD
function getCurrentDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// 主函数
async function main() {
  console.log('\n=== 内容收藏工具 ===\n');
  console.log('请输入以下信息（按回车继续）:\n');

  try {
    // 收集信息
    const title = await question('📝 标题: ');
    const source = await question('🔗 来源 (例如: X / @username 或 Medium / 作者名): ');
    const url = await question('🌐 链接: ');
    const tags = await question('🏷️  分类标签 (用逗号分隔，例如: AI, 教程, ChatGPT): ');
    const reason = await question('⭐ 收藏理由 (一句话): ');
    const summary = await question('📋 内容摘要: ');

    console.log('\n📄 请粘贴关键要点（每行一个要点，输入空行结束）:');
    const keyPoints = [];
    while (true) {
      const point = await question('  - ');
      if (!point.trim()) break;
      keyPoints.push(point.trim());
    }

    console.log('\n📖 请粘贴完整内容（可以多行，输入 END 单独一行结束）:');
    const contentLines = [];
    while (true) {
      const line = await question('');
      if (line.trim() === 'END') break;
      contentLines.push(line);
    }
    const fullContent = contentLines.join('\n');

    const hasImage = await question('\n🖼️  是否有图片? (y/n): ');
    let imagePath = '';
    if (hasImage.toLowerCase() === 'y') {
      imagePath = await question('图片文件名 (放在 images/ 目录下): ');
    }

    // 生成Markdown内容
    const date = getCurrentDate();
    const markdown = generateMarkdown({
      title,
      source,
      url,
      date,
      tags,
      reason,
      summary,
      keyPoints,
      fullContent,
      imagePath
    });

    // 保存到文件
    const collectionPath = path.join(__dirname, '../content/collection.md');
    fs.appendFileSync(collectionPath, markdown, 'utf-8');

    console.log('\n✅ 内容已成功添加到 content/collection.md！');
    console.log('\n💡 下一步: 运行 npm run generate 生成JSON数据');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    rl.close();
  }
}

// 生成Markdown格式内容
function generateMarkdown(data) {
  let md = `\n## 标题：${data.title}\n`;
  md += `- **来源**: ${data.source}\n`;
  md += `- **链接**: ${data.url}\n`;
  md += `- **日期**: ${data.date}\n`;
  md += `- **分类**: ${data.tags}\n`;
  md += `- **收藏理由**: ${data.reason}\n\n`;

  md += `### 内容摘要\n${data.summary}\n\n`;

  if (data.keyPoints.length > 0) {
    md += `### 关键要点\n`;
    data.keyPoints.forEach(point => {
      md += `- ${point}\n`;
    });
    md += `\n`;
  }

  if (data.fullContent.trim()) {
    md += `### 完整内容\n${data.fullContent}\n\n`;
  }

  if (data.imagePath) {
    md += `### 相关图片\n`;
    md += `![${data.title}](../images/${data.imagePath})\n\n`;
  }

  md += `---\n\n`;

  return md;
}

// 运行
main();
