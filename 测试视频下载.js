/**
 * 测试视频下载功能
 * 使用方法: node 测试视频下载.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 代理支持
let HttpsProxyAgent;
try {
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch(e) {
  console.log('⚠️ https-proxy-agent not installed');
}

// 测试用的视频URL
const TEST_VIDEO_URLS = [
  // 测试URL 1: 一个小视频文件
  'https://sample-videos.com/video321/mp4/240/big_buck_bunny_240p_1mb.mp4',
];

const VIDEOS_DIR = path.join(__dirname, 'videos');

// 确保目录存在
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

console.log('===========================================');
console.log('   🎬 视频下载测试工具');
console.log('===========================================');
console.log('');

// 测试下载函数
function downloadVideo(videoUrl, index) {
  return new Promise((resolve, reject) => {
    console.log(`
📥 测试 ${index}: 下载视频...`);
    console.log(`   URL: ${videoUrl.substring(0, 80)}...`);
    
    // 检查代理
    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    let requestOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    if (proxyUrl && HttpsProxyAgent) {
      console.log(`   🔌 使用代理: ${proxyUrl}`);
      requestOptions.agent = new HttpsProxyAgent(proxyUrl);
    } else {
      console.log('   ⚠️ 未配置代理');
    }

    const protocol = videoUrl.startsWith('https') ? https : http;
    
    protocol.get(videoUrl, requestOptions, (response) => {
      console.log(`   📊 HTTP状态: ${response.statusCode}`);
      
      if (response.statusCode === 200) {
        const filename = `test-video-${index}.mp4`;
        const savePath = path.join(VIDEOS_DIR, filename);
        const fileStream = fs.createWriteStream(savePath);

        let downloadedSize = 0;
        const totalSize = parseInt(response.headers['content-length'] || 0);

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            const percent = ((downloadedSize / totalSize) * 100).toFixed(2);
            process.stdout.write(`   ⏬ 下载进度: ${percent}% (${downloadedSize}/${totalSize} bytes)`);
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`
   ✅ 视频保存成功: ${filename}`);
          console.log(`   📁 文件大小: ${downloadedSize} bytes`);
          resolve({ success: true, filename, size: downloadedSize });
        });

        fileStream.on('error', (err) => {
          console.log(`
   ❌ 文件写入失败: ${err.message}`);
          reject(err);
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        console.log(`   🔄 重定向到: ${response.headers.location}`);
        downloadVideo(response.headers.location, index).then(resolve).catch(reject);
      } else {
        console.log(`   ❌ HTTP错误: ${response.statusCode}`);
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    }).on('error', (err) => {
      console.log(`   ❌ 下载失败: ${err.message}`);
      reject(err);
    });
  });
}

// 主测试流程
async function runTests() {
  console.log('📌 测试配置:');
  console.log(`   代理: ${process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '未配置'}`);
  console.log(`   保存目录: ${VIDEOS_DIR}`);
  console.log('');
  console.log('开始测试...');
  
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < TEST_VIDEO_URLS.length; i++) {
    try {
      await downloadVideo(TEST_VIDEO_URLS[i], i + 1);
      successCount++;
    } catch (err) {
      console.log(`   ❌ 测试失败: ${err.message}`);
      failCount++;
    }
  }

  console.log('');
  console.log('===========================================');
  console.log('   📊 测试结果');
  console.log('===========================================');
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failCount}`);
  console.log(`   📁 文件保存在: ${VIDEOS_DIR}`);
  console.log('');
  
  if (successCount > 0) {
    console.log('✅ 视频下载功能正常！');
    console.log('');
    console.log('💡 如果测试成功但采集时失败，问题可能在于：');
    console.log('   1. 视频URL提取不正确');
    console.log('   2. X的视频需要特殊的headers或cookies');
    console.log('   3. 视频URL已过期');
  } else {
    console.log('❌ 视频下载功能异常！');
    console.log('');
    console.log('🔍 可能的原因：');
    console.log('   1. 代理未正确配置');
    console.log('   2. 网络连接问题');
    console.log('   3. 防火墙阻止');
  }
  console.log('');
  console.log('===========================================');
}

// 运行测试
runTests().catch(err => {
  console.error('测试出错:', err);
});
