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
let errorCount = 0;

dataFiles.forEach(dataFile => {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(dataFile)) {
      console.log(`⚠️  跳过不存在的文件: ${path.basename(dataFile)}`);
      skipCount++;
      return;
    }

    // 读取数据文件
    const original = fs.readFileSync(dataFile, 'utf8');
    let content = original;

    // 替换路径
    content = content.replace(/"\.\.\/images\//g, '"images/');
    content = content.replace(/"\.\.\/videos\//g, '"videos/');

    // 写回文件
    if (content === original) {
      console.log(`✅ 路径已正确，无需改写: ${path.basename(dataFile)}`);
      successCount++;
      return;
    }
    JSON.parse(content);
    // Windows memory-mapped files may reject O_TRUNC even when writable.
    // This normalization only shortens JSON; trailing spaces keep it valid
    // without truncating the mapped file. Keep a recovery copy outside the repo.
    const backupDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gitpromts-path-backup-'));
    fs.copyFileSync(dataFile, path.join(backupDir, path.basename(dataFile)));
    const output = Buffer.alloc(Buffer.byteLength(original, 'utf8'), 32);
    const bytes = Buffer.from(content, 'utf8');
    if (bytes.length > output.length) throw new Error('Unexpected JSON size increase');
    bytes.copy(output);
    const fd = fs.openSync(dataFile, 'r+');
    try {
      let written = 0;
      while (written < output.length) {
        const count = fs.writeSync(fd, output, written, output.length - written, written);
        if (!count) throw new Error(`Write incomplete; recovery copy: ${backupDir}`);
        written += count;
      }
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    if (fs.readFileSync(dataFile, 'utf8').trimEnd() !== content.trimEnd()) {
      throw new Error(`Verification failed; recovery copy: ${backupDir}`);
    }

    console.log(`✅ 已修复: ${path.basename(dataFile)}`);
    successCount++;
  } catch (error) {
    errorCount++;
    console.error(`❌ 修复失败 ${path.basename(dataFile)}:`, error.message);
  }
});

if (successCount > 0 && errorCount === 0) {
  console.log(`\n✅ GitHub Pages路径修复完成！成功: ${successCount} 个，跳过: ${skipCount} 个`);
} else {
  console.error('\n❌ 没有文件被修复');
  process.exit(1);
}
