/**
 * 测试X视频URL下载
 * 使用方法: node 测试X视频下载.js <视频URL>
 * 例如: node 测试X视频下载.js "https://video.twimg.com/ext_tw_video/..."
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

let HttpsProxyAgent;
try {
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch(e) {
  console.log('⚠️ https-proxy-agent not installed');
}

const videoUrl = process.argv[2];

if (!videoUrl) {
  console.log('');
  console.log('========================================');
  console.log('   测试X视频下载');
  console.log('========================================');
  console.log('');
  console.log('使用方法:');
  console.log('  node 测试X视频下载.js <视频URL>');
  console.log('');
  console.log('例如:');
  console.log('  node 测试X视频下载.js "https://video.twimg.com/..."');
  console.log('');
  console.log('如何获取视频URL:');
  console.log('  1. 在X上打开带视频的推文');
  console.log('  2. 按F12打开开发者工具');
  console.log('  3. 切换到Console标签');
  console.log('  4. 输入: document.querySelector("video source").src');
  console.log('  5. 复制输出的URL');
  console.log('');
  process.exit(1);
}

const VIDEOS_DIR = path.join(__dirname, 'videos');
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

console.log('');
console.log('========================================');
console.log('   测试X视频下载');
console.log('========================================');
console.log('');
console.log('📥 下载视频: ' + videoUrl.substring(0, 80) + '...');
console.log('');

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
let requestOptions = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://x.com/',
    'Origin': 'https://x.com'
  }
};

if (proxyUrl && HttpsProxyAgent) {
  console.log('🔌 使用代理: ' + proxyUrl);
  requestOptions.agent = new HttpsProxyAgent(proxyUrl);
} else {
  console.log('⚠️ 未配置代理');
}

console.log('');

https.get(videoUrl, requestOptions, (response) => {
  console.log('📊 HTTP状态码: ' + response.statusCode);
  console.log('📋 响应头:');
  console.log('   Content-Type: ' + response.headers['content-type']);
  console.log('   Content-Length: ' + response.headers['content-length']);
  console.log('');
  
  if (response.statusCode === 200) {
    const filename = 'x-video-test.mp4';
    const savePath = path.join(VIDEOS_DIR, filename);
    const fileStream = fs.createWriteStream(savePath);

    let downloadedSize = 0;
    const totalSize = parseInt(response.headers['content-length'] || 0);

    response.on('data', (chunk) => {
      downloadedSize += chunk.length;
      if (totalSize > 0) {
        const percent = ((downloadedSize / totalSize) * 100).toFixed(2);
        process.stdout.write('\r⏬ 下载进度: ' + percent + '% (' + downloadedSize + '/' + totalSize + ' bytes)');
      } else {
        process.stdout.write('\r⏬ 已下载: ' + downloadedSize + ' bytes');
      }
    });

    response.pipe(fileStream);

    fileStream.on('finish', () => {
      fileStream.close();
      console.log('\n');
      console.log('========================================');
      console.log('✅ 下载成功！');
      console.log('========================================');
      console.log('文件: ' + savePath);
      console.log('大小: ' + downloadedSize + ' bytes');
      console.log('');
    });

    fileStream.on('error', (err) => {
      console.log('\n❌ 文件写入失败: ' + err.message);
    });
  } else if (response.statusCode === 403) {
    console.log('❌ 403 Forbidden - 访问被拒绝');
    console.log('');
    console.log('可能的原因:');
    console.log('  1. 视频URL已过期');
    console.log('  2. 需要登录凭证（cookies）');
    console.log('  3. 防盗链保护');
  } else if (response.statusCode === 404) {
    console.log('❌ 404 Not Found - 视频不存在');
    console.log('');
    console.log('可能的原因:');
    console.log('  1. URL不正确');
    console.log('  2. 视频已被删除');
  } else {
    console.log('❌ HTTP错误: ' + response.statusCode);
  }
}).on('error', (err) => {
  console.log('❌ 下载失败: ' + err.message);
  console.log('');
  console.log('可能的原因:');
  console.log('  1. 网络连接问题');
  console.log('  2. 代理配置错误');
  console.log('  3. URL格式不正确');
});
