#!/usr/bin/env node

/**
 * 修复GitHub Pages路径
 * 将本地路径 ../images/ 和 ../videos/ 转换为 images/ 和 videos/
 */

const fs = require('fs');
const path = require('path');

const dataFiles = [
  path.join(__dirname, 'data/contents.json'),
  path.join(__dirname, 'data/latest.json'),
  path.join(__dirname, 'data/archive.json')
];

let successCount = 0;
let skipCount = 0;

dataFiles.forEach(dataFile => {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(dataFile)) {
      console.log(`⚠️  跳过不存在的文件: ${path.basename(dataFile)}`);
      skipCount++;
      return;
    }

    // 读取数据文件
    let content = fs.readFileSync(dataFile, 'utf8');

    // 替换路径
    content = content.replace(/"\.\.\/images\//g, '"images/');
    content = content.replace(/"\.\.\/videos\//g, '"videos/');

    // 写回文件
    fs.writeFileSync(dataFile, content, 'utf8');

    console.log(`✅ 已修复: ${path.basename(dataFile)}`);
    successCount++;
  } catch (error) {
    console.error(`❌ 修复失败 ${path.basename(dataFile)}:`, error.message);
  }
});

if (successCount > 0) {
  console.log(`\n✅ GitHub Pages路径修复完成！成功: ${successCount} 个，跳过: ${skipCount} 个`);
} else {
  console.error('\n❌ 没有文件被修复');
  process.exit(1);
}
