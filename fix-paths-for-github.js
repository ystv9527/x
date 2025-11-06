#!/usr/bin/env node

/**
 * 修复GitHub Pages路径
 * 将本地路径 ../images/ 和 ../videos/ 转换为 images/ 和 videos/
 */

const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, 'data/contents.json');

try {
  // 读取数据文件
  let content = fs.readFileSync(dataFile, 'utf8');

  // 替换路径
  content = content.replace(/"\.\.\/images\//g, '"images/');
  content = content.replace(/"\.\.\/videos\//g, '"videos/');

  // 写回文件
  fs.writeFileSync(dataFile, content, 'utf8');

  console.log('✅ GitHub Pages路径已修复');
} catch (error) {
  console.error('❌ 路径修复失败:', error.message);
  process.exit(1);
}
