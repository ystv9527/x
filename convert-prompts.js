#!/usr/bin/env node

/**
 * 转换 prompts.json 到你的格式
 */

const fs = require('fs');
const path = require('path');

// 读取源数据
const sourceData = require('./prompts-source.json');
const currentData = require('./data/contents.json');

// 获取当前最大ID
const maxId = Math.max(...currentData.items.map(item => item.id), 0);

// 转换数据
const convertedItems = sourceData.items.map((item, index) => {
  const newId = maxId + index + 1;

  // 提取英文和中文提示词
  const prompts = item.prompts || [];
  const englishPrompt = prompts.find(p => /^[a-zA-Z]/.test(p)) || '';
  const chinesePrompt = prompts.find(p => /[\u4e00-\u9fa5]/.test(p)) || '';

  return {
    id: newId,
    caseNumber: `案例${String(newId).padStart(3, '0')}`,
    title: item.title || '',
    source: item.source?.name || '',
    url: item.source?.url || '',
    date: new Date().toISOString().split('T')[0],
    tags: item.tags || ['图片', 'AI提示词'],
    reason: '',
    summary: `${item.title} - AI图片生成提示词`,
    keyPoints: [],
    content: '',
    contentChinese: chinesePrompt,
    contentEnglish: englishPrompt,
    images: item.images || [],  // 保留原路径，你后续下载
    videos: []
  };
});

// 合并数据
const mergedData = {
  generatedAt: new Date().toISOString(),
  totalCount: currentData.items.length + convertedItems.length,
  items: [...currentData.items, ...convertedItems]
};

// 写入文件
fs.writeFileSync(
  path.join(__dirname, 'data/contents.json'),
  JSON.stringify(mergedData, null, 2),
  'utf8'
);

console.log(`✅ 转换完成！`);
console.log(`   原有: ${currentData.items.length} 条`);
console.log(`   新增: ${convertedItems.length} 条`);
console.log(`   总计: ${mergedData.totalCount} 条`);
console.log(`\n⚠️ 注意：图片路径为 ${convertedItems[0].images[0]}`);
console.log(`   请下载图片到对应目录`);
