#!/usr/bin/env node

/**
 * 视频采集诊断工具
 * 使用方法: node diagnose.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始诊断视频采集系统...\n');

// 1. 检查视频文件
const videosDir = path.join(__dirname, 'videos');
const videoFiles = fs.existsSync(videosDir)
  ? fs.readdirSync(videosDir).filter(f => f.endsWith('.mp4'))
  : [];

console.log('📁 视频文件:');
console.log(`   数量: ${videoFiles.length} 个`);
if (videoFiles.length > 0) {
  console.log('   最新文件:', videoFiles[videoFiles.length - 1]);

  // 检查文件大小
  const latestFile = path.join(videosDir, videoFiles[videoFiles.length - 1]);
  const stats = fs.statSync(latestFile);
  console.log(`   文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}
console.log('');

// 2. 检查 markdown
const mdPath = path.join(__dirname, 'content', 'collection.md');
let mdContent = '';
let mdVideoCount = 0;

if (fs.existsSync(mdPath)) {
  mdContent = fs.readFileSync(mdPath, 'utf-8');
  mdVideoCount = (mdContent.match(/<video/g) || []).length;
}

console.log('📝 Markdown 文件:');
console.log(`   行数: ${mdContent.split('\n').length}`);
console.log(`   视频标签数: ${mdVideoCount}`);
console.log(`   是否为空: ${mdContent.trim().length === 0 ? '是' : '否'}`);
console.log('');

// 3. 检查 JSON
const jsonPath = path.join(__dirname, 'data', 'contents.json');
let jsonData = null;
let jsonVideoCount = 0;

if (fs.existsSync(jsonPath)) {
  try {
    jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    jsonVideoCount = jsonData.items.filter(item => item.videos && item.videos.length > 0).length;
  } catch (e) {
    console.log('⚠️  JSON 文件解析失败:', e.message);
  }
}

console.log('📊 JSON 数据:');
if (jsonData) {
  console.log(`   总条目数: ${jsonData.items.length}`);
  console.log(`   有视频的条目: ${jsonVideoCount}`);
} else {
  console.log('   状态: 文件不存在或无效');
}
console.log('');

// 4. 数据一致性检查
console.log('✅ 数据一致性检查:');

if (videoFiles.length === 0) {
  console.log('   ⚠️  没有视频文件 - 请先采集一条有视频的推文');
} else {
  console.log(`   ✅ 有 ${videoFiles.length} 个视频文件`);

  if (mdVideoCount === 0) {
    console.log('   ❌ Markdown 中没有视频标签！');
    console.log('      可能原因:');
    console.log('      1. 表单提交时 downloadedVideos 参数缺失');
    console.log('      2. 服务器 generateMarkdown() 函数有问题');
    console.log('      3. 视频下载失败，没有添加到 downloadedVideos');
  } else {
    console.log(`   ✅ Markdown 有 ${mdVideoCount} 个视频标签`);
  }

  if (!jsonData) {
    console.log('   ⚠️  JSON 文件不存在 - 运行 npm run generate 生成');
  } else if (jsonVideoCount === 0 && mdVideoCount > 0) {
    console.log('   ❌ JSON 没有识别到视频！');
    console.log('      可能原因:');
    console.log('      1. 正则表达式无法匹配视频标签');
    console.log('      2. 需要重新运行 npm run generate');
  } else if (jsonVideoCount > 0) {
    console.log(`   ✅ JSON 识别到 ${jsonVideoCount} 个视频`);
  }
}

console.log('');

// 5. 给出建议
console.log('💡 下一步操作建议:');
if (videoFiles.length === 0) {
  console.log('   1. 启动服务器: node server.js');
  console.log('   2. 重新加载浏览器扩展');
  console.log('   3. 访问 X.com 并采集一条有视频的推文');
  console.log('   4. 观察控制台日志是否正常');
} else if (mdVideoCount === 0) {
  console.log('   ❌ 问题: 视频文件已下载，但 Markdown 中没有视频标签');
  console.log('   1. 检查编辑页面控制台，看是否有错误');
  console.log('   2. 检查服务器日志，确认收到 downloadedVideos 参数');
  console.log('   3. 手动运行: node fix-videos.js 修复视频标签');
} else if (!jsonData) {
  console.log('   1. 运行: npm run generate');
  console.log('   2. 刷新浏览器访问 http://localhost:3000');
} else if (jsonVideoCount === 0) {
  console.log('   ❌ 问题: Markdown 有视频但 JSON 没有');
  console.log('   1. 重新运行: npm run generate');
  console.log('   2. 检查 generate-dataset.js 的正则表达式');
} else {
  console.log('   ✅ 一切正常！访问 http://localhost:3000 查看视频');
}

console.log('');
console.log('📋 完整测试流程参考: 测试视频采集.md');
