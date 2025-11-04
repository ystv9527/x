#!/usr/bin/env node

/**
 * 简易API服务器 V2 - 支持自动下载图片
 * 运行方法: npm run server
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');

const PORT = 3000;
const COLLECTION_FILE = path.join(__dirname, 'content/collection.md');
const IMAGES_DIR = path.join(__dirname, 'images');

// 代理配置（可选）
const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  null;

let HTTPS_AGENT = null;
if (PROXY_URL) {
  try {
    HTTPS_AGENT = new HttpsProxyAgent(PROXY_URL);
    console.log('Proxy enabled for image download: ' + PROXY_URL);
  } catch (error) {
    HTTPS_AGENT = null;
    console.warn('⚠️ 代理配置无效:', error.message);
  }
}

// 确保 images 目录存在
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  // 设置CORS头，允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 路由：POST /api/add-content - 添加内容
  if (req.method === 'POST' && pathname === '/api/add-content') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        console.log('📝 收到内容:', data.title);

        // 如果有图片，自动下载
        let downloadedImages = [];
        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
          console.log(`🖼️  发现 ${data.images.length} 张图片，开始自动下载...`);

          // 生成唯一的推文ID（从URL提取或生成）
          const tweetId = extractTweetId(data.url) || generateUniqueId();

          // 下载所有图片
          downloadedImages = await downloadAllImages(data.images, tweetId);

          console.log(`✅ 成功下载 ${downloadedImages.length} 张图片`);
        }

        // 将下载的图片文件名添加到数据中
        data.downloadedImages = downloadedImages;

        // 生成Markdown格式内容
        const markdown = generateMarkdown(data);

        // 追加到collection.md文件
        fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');

        console.log('✅ 内容已保存:', data.title);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: '内容已保存',
          downloadedImages: downloadedImages.length
        }));

      } catch (error) {
        console.error('❌ 保存失败:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // 路由：GET /add.html - 添加页面（使用V2版本）
  if (req.method === 'GET' && pathname === '/add.html') {
    const filePath = path.join(__dirname, 'add-v2.html');
    const content = fs.readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
    return;
  }

  // 路由：GET / - 主页重定向
  if (req.method === 'GET' && pathname === '/') {
    const indexPath = path.join(__dirname, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
    return;
  }

  // 静态文件服务
  if (req.method === 'GET') {
    serveStaticFile(pathname, res);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

/**
 * 从推文URL提取ID
 */
function extractTweetId(tweetUrl) {
  if (!tweetUrl) return null;

  // 匹配 https://x.com/username/status/1234567890
  const match = tweetUrl.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * 生成唯一ID
 */
function generateUniqueId() {
  return Date.now().toString();
}

/**
 * 下载单张图片
 */
function downloadImage(imageUrl, savePath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('下载失败: 重定向次数过多'));
    }

    let urlObj;
    try {
      urlObj = new URL(imageUrl);
    } catch (err) {
      return reject(new Error(`下载失败: 无效的图片地址 - ${imageUrl}`));
    }

    const protocol = urlObj.protocol === 'https:' ? https : http;
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': `${urlObj.protocol}//${urlObj.hostname}/`
      }
    };

    if (urlObj.port) {
      requestOptions.port = urlObj.port;
    }

    if (HTTPS_AGENT && urlObj.protocol === 'https:') {
      requestOptions.agent = HTTPS_AGENT;
    }

    protocol.get(requestOptions, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location;
        if (!location) {
          response.resume();
          return reject(new Error('下载失败: 重定向未提供目标地址'));
        }

        const nextUrl = new URL(location, imageUrl).toString();
        response.destroy();
        return downloadImage(nextUrl, savePath, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`下载失败: HTTP ${response.statusCode}`));
      }

      const fileStream = fs.createWriteStream(savePath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(savePath);
      });

      fileStream.on('error', (err) => {
        fileStream.close();
        fs.unlink(savePath, () => {});
        reject(err);
      });

      response.on('error', (err) => {
        fileStream.close();
        fs.unlink(savePath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 下载所有图片
 */
async function downloadAllImages(imageUrls, tweetId) {
  const downloadedFiles = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    let urlObj;
    try {
      urlObj = new URL(imageUrl);
    } catch (_) {
      urlObj = null;
    }
    const ext = urlObj ? (path.extname(urlObj.pathname) || '.jpg') : '.jpg';
    const filename = `tweet-${tweetId}-${i + 1}${ext}`;
    const savePath = path.join(IMAGES_DIR, filename);

    try {
      console.log(`  ⬇️  下载图片 ${i + 1}/${imageUrls.length}: ${filename}`);
      await downloadImage(imageUrl, savePath);
      downloadedFiles.push(filename);
      console.log(`  ✅ 完成: ${filename}`);
    } catch (error) {
      console.error(`  ❌ 下载失败 ${filename}:`, error.message);
      // 继续下载其他图片
    }
  }

  return downloadedFiles;
}


/**
 * 生成Markdown格式内容
 */
function generateMarkdown(data) {
  let md = `\n## 标题：${data.title}\n`;
  if (data.source) md += `- **来源**: ${data.source}\n`;
  if (data.url) md += `- **链接**: ${data.url}\n`;
  if (data.date) md += `- **日期**: ${data.date}\n`;
  if (data.tags) md += `- **分类**: ${data.tags}\n`;
  if (data.reason) md += `- **收藏理由**: ${data.reason}\n`;

  md += `\n`;

  if (data.summary) {
    md += `### 内容摘要\n${data.summary}\n\n`;
  }

  if (data.content) {
    md += `### 完整内容\n${data.content}\n\n`;
  }

  // 处理图片
  if (data.downloadedImages && data.downloadedImages.length > 0) {
    md += `### 相关图片\n`;
    data.downloadedImages.forEach((filename, index) => {
      md += `![图片 ${index + 1}](../images/${filename})\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  return md;
}

/**
 * 静态文件服务
 */
function serveStaticFile(pathname, res) {
  const filePath = path.join(__dirname, pathname);

  // 安全检查
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  // 获取文件扩展名
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';

  // 读取并返回文件
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
  }
}

// 启动服务器
server.listen(PORT, () => {
  console.log('\n🚀 书签采集服务器已启动（V2 - 支持自动下载图片）！\n');
  console.log(`   访问地址: http://localhost:${PORT}`);
  console.log(`   API地址: http://localhost:${PORT}/api/add-content`);
  console.log(`   添加页面: http://localhost:${PORT}/add.html`);
  console.log(`   图片目录: ${IMAGES_DIR}`);
  console.log('\n✨ 新功能: 自动下载推文图片到本地！');
  console.log('💡 每个推文的图片会自动命名为: tweet-推文ID-序号.jpg');
  console.log('   按 Ctrl+C 停止服务器\n');
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 服务器已关闭');
  process.exit(0);
});
