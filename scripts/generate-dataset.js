#!/usr/bin/env node

/**
 * 生成JSON数据集 - 将Markdown内容转换为JSON
 * 使用方法: npm run generate
 */

const fs = require('fs');
const path = require('path');

// 路径配置
const CONTENT_FILE = path.join(__dirname, '../content/collection.md');
const OUTPUT_FILE = path.join(__dirname, '../data/contents.json');

/**
 * 解析Markdown文件
 */
function parseMarkdown(markdown) {
  const items = [];

  // 按 "## " 分割各个条目（忽略第一个标题）
  const sections = markdown.split(/\n## /).filter(s => s.trim());

  sections.forEach((section, index) => {
    if (!section.trim() || section.startsWith('#')) return;

    const item = {
      id: index + 1,
      title: '',
      source: '',
      url: '',
      date: '',
      tags: [],
      reason: '',
      summary: '',
      keyPoints: [],
      content: '',
      images: []
    };

    // 提取标题（第一行）
    const lines = section.split('\n');
    const titleMatch = lines[0].match(/^标题：(.+)$/) || lines[0].match(/^(.+)$/);
    if (titleMatch) {
      item.title = titleMatch[1].trim();
    }

    // 提取元数据
    const metaRegex = /^- \*\*(.+?)\*\*:\s*(.+)$/;
    lines.forEach(line => {
      const match = line.match(metaRegex);
      if (match) {
        const key = match[1].toLowerCase();
        const value = match[2].trim();

        if (key === '来源' || key === 'source') {
          item.source = value;
        } else if (key === '链接' || key === 'url' || key === 'link') {
          item.url = value;
        } else if (key === '日期' || key === 'date') {
          item.date = value;
        } else if (key === '分类' || key === 'tags' || key === '标签') {
          item.tags = value.split(/[,，]/).map(t => t.trim()).filter(t => t);
        } else if (key === '收藏理由' || key === 'reason') {
          item.reason = value;
        }
      }
    });

    // 提取摘要
    const summaryMatch = section.match(/###\s*内容摘要\s*\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
    if (summaryMatch) {
      item.summary = summaryMatch[1].trim();
    }

    // 提取关键要点
    const keyPointsMatch = section.match(/###\s*关键要点\s*\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
    if (keyPointsMatch) {
      const points = keyPointsMatch[1].match(/^[-*]\s+(.+)$/gm);
      if (points) {
        item.keyPoints = points.map(p => p.replace(/^[-*]\s+/, '').trim());
      }
    }

    // 提取完整内容
    const contentMatch = section.match(/###\s*完整内容\s*\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
    if (contentMatch) {
      item.content = contentMatch[1].trim();
    }

    // 提取图片
    const imageMatches = section.match(/!\[.*?\]\((.*?)\)/g);
    if (imageMatches) {
      item.images = imageMatches.map(img => {
        const match = img.match(/!\[.*?\]\((.*?)\)/);
        return match ? match[1] : '';
      }).filter(img => img);
    }

    // 只添加有标题的条目
    if (item.title) {
      items.push(item);
    }
  });

  return items;
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 开始生成JSON数据集...\n');

  try {
    // 检查输入文件
    if (!fs.existsSync(CONTENT_FILE)) {
      console.error('❌ 错误: 找不到 content/collection.md 文件');
      process.exit(1);
    }

    // 读取Markdown文件
    const markdown = fs.readFileSync(CONTENT_FILE, 'utf-8');
    console.log('📖 读取 Markdown 文件...');

    // 解析内容
    const items = parseMarkdown(markdown);
    console.log(`✨ 解析完成，共找到 ${items.length} 个条目`);

    // 生成数据集
    const dataset = {
      generatedAt: new Date().toISOString(),
      totalCount: items.length,
      items: items
    };

    // 确保输出目录存在
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 保存JSON文件
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dataset, null, 2), 'utf-8');
    console.log(`💾 JSON文件已保存到: ${OUTPUT_FILE}`);

    // 显示统计信息
    console.log('\n📊 统计信息:');
    console.log(`   - 总条目数: ${items.length}`);

    // 统计标签
    const tagCount = {};
    items.forEach(item => {
      item.tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });

    console.log(`   - 标签种类: ${Object.keys(tagCount).length}`);
    if (Object.keys(tagCount).length > 0) {
      console.log('   - 热门标签:');
      Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([tag, count]) => {
          console.log(`     * ${tag}: ${count}`);
        });
    }

    console.log('\n✅ 数据集生成完成！');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行
main();
