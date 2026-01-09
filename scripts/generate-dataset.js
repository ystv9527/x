#!/usr/bin/env node

/**
 * 生成JSON数据集 - 将Markdown内容转换为JSON
 * 使用方法: npm run generate
 * 自动模式: node scripts/generate-dataset.js --auto
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 检查是否为自动模式（跳过安全检查确认）
const isAutoMode = process.argv.includes('--auto');

// 路径配置
const CONTENT_FILE = path.join(__dirname, '../content/collection.md');
const OUTPUT_FILE = path.join(__dirname, '../data/contents.json');

/**
 * 解析Markdown文件
 */
function parseMarkdown(markdown) {
  const items = [];
  const entryMarker = '<!-- ENTRY -->';

  // 优先按 ENTRY 标记分割，避免内容内出现 "## " 造成误拆分
  const sections = markdown.includes(entryMarker)
    ? markdown.split(entryMarker).map(s => s.trim()).filter(s => s)
    : markdown.split(/\n## /).map(s => s.trim()).filter(s => s);

  sections.forEach((section, index) => {
    if (!section.trim()) {
      return;
    }

    const item = {
      id: index + 1,
      caseNumber: '',
      title: '',
      source: '',
      url: '',
      date: '',
      tags: [],
      reason: '',
      summary: '',
      keyPoints: [],
      content: '',
      contentChinese: '',
      contentEnglish: '',
      images: [],
      videos: []
    };

    // 提取标题（第一行）- 处理Windows换行符
    const lines = section.split(/\r?\n/);
    const firstLine = lines[0].trim().startsWith('## ') ? lines[0].trim().slice(3) : lines[0].trim();

    if (!firstLine || firstLine.startsWith('#')) {
      return;
    }

    const titleMatch = firstLine.match(/^标题：(.+)$/) || firstLine.match(/^(.+)$/);
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

        if (key === '编号' || key === 'casenumber') {
          item.caseNumber = value;
        } else if (key === '来源' || key === 'source') {
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

    // 提取中文内容
    const chineseMatch = section.match(/###\s*🇨🇳\s*中文内容\s*\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
    if (chineseMatch) {
      item.contentChinese = chineseMatch[1].trim();
    }

    // 提取英文内容
    const englishMatch = section.match(/###\s*🇺🇸\s*英文内容\s*\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
    if (englishMatch) {
      item.contentEnglish = englishMatch[1].trim();
    }

    // 兼容旧版本：提取完整内容（如果没有分离的中英文内容）
    if (!item.contentChinese && !item.contentEnglish) {
      const contentMatch = section.match(/###\s*完整内容\s*\n([\s\S]*?)(?=\n###|\n---|\n##|$)/);
      if (contentMatch) {
        item.content = contentMatch[1].trim();
      }
    }

    // 提取图片
    const imageMatches = section.match(/!\[.*?\]\((.*?)\)/g);
    if (imageMatches) {
      item.images = imageMatches.map(img => {
        const match = img.match(/!\[.*?\]\((.*?)\)/);
        return match ? match[1] : '';
      }).filter(img => img);
    }

    
    // 提取视频
    const videoMatches = section.match(/<video[^>]*>.*?<source src="(.*?)".*?<\/video>/g);
    if (videoMatches) {
      item.videos = videoMatches.map(video => {
        const match = video.match(/<source src="(.*?)"/);
        return match ? match[1] : '';
      }).filter(video => video);
    }

    // 只添加有标题的条目
    if (item.title) {
      items.push(item);
    }
  });

  return items;
}

/**
 * 询问用户确认
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

/**
 * 主函数（追加+分批模式）
 */
async function main() {
  console.log('🚀 开始生成JSON数据集（追加+分批模式）...\n');

  try {
    const LATEST_FILE = path.join(__dirname, '../data/latest.json');
    const ARCHIVE_FILE = path.join(__dirname, '../data/archive.json');
    const LATEST_COUNT = 100;

    // 检查输入文件
    if (!fs.existsSync(CONTENT_FILE)) {
      console.error('❌ 错误: 找不到 content/collection.md 文件');
      process.exit(1);
    }

    // 读取现有数据
    let existingItems = [];
    if (fs.existsSync(OUTPUT_FILE)) {
      try {
        const fullData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        existingItems = fullData.items || [];
        console.log(`📂 读取现有数据: ${existingItems.length} 条`);
      } catch (error) {
        console.warn('⚠️ 无法读取现有数据');
      }
    }

    // 读取Markdown文件
    const markdown = fs.readFileSync(CONTENT_FILE, 'utf-8');
    console.log('📖 读取 Markdown 文件...');

    // 解析新内容
    const newItems = parseMarkdown(markdown);
    console.log(`✨ 解析完成，共找到 ${newItems.length} 个新条目`);

    // 🛡️ 安全检查：防止 collection.md 被意外修改导致数据丢失
    // 自动模式（用户刚采集）：跳过检查，collection.md 就应该只有新内容
    // 手动模式（其他时候）：需要确认，防止 collection.md 被意外修改
    if (!isAutoMode && existingItems.length > 0 && newItems.length > 0 && newItems.length < existingItems.length * 0.5) {
      console.log('\n⚠️  警告：检测到异常情况！');
      console.log(`   - collection.md 只有 ${newItems.length} 条新内容`);
      console.log(`   - 现有数据库有 ${existingItems.length} 条内容`);
      console.log(`   - 如果继续，会将 ${newItems.length} 条新内容追加到现有 ${existingItems.length} 条数据中`);
      console.log('\n💡 可能的情况：');
      console.log('   1. 你删除了本地数据，然后采集了少量新内容（正常）');
      console.log('   2. collection.md 文件被意外修改或清空了部分内容（异常）');
      console.log('   3. 这是正常的少量采集（正常）\n');

      const answer = await askQuestion('❓ 是否继续生成数据集？(y/n): ');

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('❌ 已取消操作，数据未被修改');
        process.exit(0);
      }

      console.log('✅ 继续处理...\n');
    }

    // 合并数据（即使没有新内容，也要重新生成以同步路径修复等变更）
    const allItems = newItems.length > 0 ? [...existingItems, ...newItems] : existingItems;

    if (newItems.length === 0) {
      console.log('⚠️ 没有新内容，但仍然重新生成数据集以同步变更');
    } else {
    console.log(`🔗 合并数据: ${existingItems.length} (现有) + ${newItems.length} (新增) = ${allItems.length} (总计)`);
    }

    // 重新编号
    allItems.forEach((item, index) => {
      item.id = index + 1;
      item.caseNumber = '案例' + String(index + 1).padStart(3, '0');
    });

    // 拆分：最后100条（最新） + 前面的（历史）
    const latestItems = allItems.slice(-LATEST_COUNT);
    const archiveItems = allItems.slice(0, -LATEST_COUNT);

    console.log(`\n📦 数据拆分:`);
    console.log(`   - latest.json: ${latestItems.length} 条`);
    console.log(`   - archive.json: ${archiveItems.length} 条`);

    // 确保输出目录存在
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 计算全局标签统计
    const globalTagCount = {};
    allItems.forEach(item => {
      item.tags.forEach(tag => {
        globalTagCount[tag] = (globalTagCount[tag] || 0) + 1;
      });
    });

    // 保存 latest.json（包含全局统计）
    const latestDataset = {
      generatedAt: new Date().toISOString(),
      totalCount: latestItems.length,
      hasMore: archiveItems.length > 0,
      globalStats: {
        totalCount: allItems.length,
        tagCount: globalTagCount
      },
      items: latestItems
    };
    fs.writeFileSync(LATEST_FILE, JSON.stringify(latestDataset, null, 2), 'utf-8');
    console.log(`💾 latest.json 已保存`);

    // 保存 archive.json
    if (archiveItems.length > 0) {
      const archiveDataset = {
        generatedAt: new Date().toISOString(),
        totalCount: archiveItems.length,
        items: archiveItems
      };
      fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archiveDataset, null, 2), 'utf-8');
      console.log(`💾 archive.json 已保存`);
    }

    // 保存完整的 contents.json
    const fullDataset = {
      generatedAt: new Date().toISOString(),
      totalCount: allItems.length,
      items: allItems
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fullDataset, null, 2), 'utf-8');
    console.log(`💾 contents.json 已保存`);

    console.log('\n✅ 数据集生成完成！');
    console.log(`💡 案例${allItems.length}（最新）将显示在最前\n`);

    // 清空 collection.md，避免下次重复添加
    if (newItems.length > 0) {
      fs.writeFileSync(CONTENT_FILE, '# 收藏内容\n', 'utf-8');
      console.log('🧹 已清空 collection.md，准备下次采集\n');
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行
main().catch(error => {
  console.error('❌ 致命错误:', error);
  process.exit(1);
});
