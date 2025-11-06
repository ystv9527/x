#!/usr/bin/env node

/**
 * 批量下载 prompts 图片
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://opennana.com/awesome-prompt-gallery/';
const IMAGES_DIR = path.join(__dirname, 'images');

// 确保目录存在
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// 读取数据
const data = require('./data/contents.json');

// 只下载新增的项目（ID > 10）
const newItems = data.items.filter(item => item.id > 10);

// 提取所有需要下载的图片
const imagesToDownload = [];
newItems.forEach(item => {
  if (item.images && item.images.length > 0) {
    item.images.forEach(imgPath => {
      const fileName = imgPath.replace('images/', '');
      const url = BASE_URL + imgPath;
      const localPath = path.join(IMAGES_DIR, fileName);

      // 如果文件不存在，添加到下载列表
      if (!fs.existsSync(localPath)) {
        imagesToDownload.push({ url, localPath, fileName });
      }
    });
  }
});

console.log(`📊 统计：`);
console.log(`   总案例: ${data.totalCount} 条`);
console.log(`   新案例: ${newItems.length} 条`);
console.log(`   需下载图片: ${imagesToDownload.length} 张`);
console.log(``);

if (imagesToDownload.length === 0) {
  console.log('✅ 所有图片已存在，无需下载！');
  process.exit(0);
}

// 下载函数
function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    client.get(url, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // 处理重定向
        downloadImage(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

// 批量下载（每次5个并发）
async function downloadAll() {
  const CONCURRENT = 5;
  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < imagesToDownload.length; i += CONCURRENT) {
    const batch = imagesToDownload.slice(i, i + CONCURRENT);

    await Promise.all(batch.map(async ({ url, localPath, fileName }) => {
      try {
        await downloadImage(url, localPath);
        downloaded++;
        console.log(`✅ [${downloaded}/${imagesToDownload.length}] ${fileName}`);
      } catch (error) {
        failed++;
        console.error(`❌ [${downloaded + failed}/${imagesToDownload.length}] ${fileName} - ${error.message}`);
      }
    }));
  }

  console.log(``);
  console.log(`========================================`);
  console.log(`📥 下载完成！`);
  console.log(`   成功: ${downloaded} 张`);
  console.log(`   失败: ${failed} 张`);
  console.log(`========================================`);
}

// 开始下载
downloadAll().catch(console.error);
