#!/usr/bin/env node

/**
 * API服务器 V3 - 支持代理和更好的图片下载
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { SocksProxyAgent } = require('socks-proxy-agent');

// 加载.env文件
if (fs.existsSync(path.join(__dirname, '.env'))) {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
  envContent.split('\n').forEach(line => {
    if (line.includes('=') && !line.startsWith('#')) {
      const [key, value] = line.split('=');
      process.env[key.trim()] = value.trim();
    }
  });
}

const PORT = 3000;
const COLLECTION_FILE = path.join(__dirname, 'content/collection.md');
const IMAGES_DIR = path.join(__dirname, 'images');

// 获取代理配置
const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.SOCKS_PROXY ||
  null;

let AGENT = null;
if (PROXY_URL) {
  try {
    if (PROXY_URL.startsWith('socks5://')) {
      AGENT = new SocksProxyAgent(PROXY_URL);
      console.log('✅ SOCKS5 Proxy enabled:', PROXY_URL);
    } else {
      // 对于HTTP/HTTPS代理，使用HttpProxyAgent
      const { HttpProxyAgent } = require('http-proxy-agent');
      const { HttpsProxyAgent } = require('https-proxy-agent');

      if (PROXY_URL.startsWith('https://')) {
        AGENT = new HttpsProxyAgent(PROXY_URL);
      } else {
        AGENT = new HttpProxyAgent(PROXY_URL);
      }
      console.log('✅ HTTP(S) Proxy enabled:', PROXY_URL);
    }
  } catch (error) {
    console.warn('⚠️ Proxy configuration failed:', error.message);
  }
}

// 确保images目录存在
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API: 添加内容
  if (req.method === 'POST' && pathname === '/api/add-content') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('📝 Content received:', data.title);

        let downloadedImages = [];
        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
          console.log(`🖼️ Found ${data.images.length} images, downloading...`);

          const tweetId = extractTweetId(data.url) || generateUniqueId();
          downloadedImages = await downloadAllImages(data.images, tweetId);

          console.log(`✅ Downloaded ${downloadedImages.length} images`);
        }

        data.downloadedImages = downloadedImages;

        const markdown = generateMarkdown(data);
        fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');

        console.log('✅ Content saved:', data.title);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Content saved',
          downloadedImages: downloadedImages.length
        }));

      } catch (error) {
        console.error('❌ Save failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // GET /add.html
  if (req.method === 'GET' && pathname === '/add.html') {
    const filePath = path.join(__dirname, 'add-v2.html');
    const content = fs.readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
    return;
  }

  // GET /
  if (req.method === 'GET' && pathname === '/') {
    const indexPath = path.join(__dirname, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
    return;
  }

  // Static files
  if (req.method === 'GET') {
    serveStaticFile(pathname, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('404 Not Found');
});

/**
 * Download image with proxy support
 */
function downloadImage(imageUrl, savePath) {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;
    const options = { agent: AGENT };

    console.log(`   📥 Downloading: ${imageUrl.substring(0, 80)}...`);

    protocol.get(imageUrl, options, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(savePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`   ✅ Saved: ${path.basename(savePath)}`);
          resolve(savePath);
        });

        fileStream.on('error', (err) => {
          fs.unlink(savePath, () => {});
          reject(err);
        });
      } else {
        reject(new Error(`HTTP ${response.statusCode}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Download all images
 */
async function downloadAllImages(imageUrls, tweetId) {
  const downloadedFiles = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    const filename = `tweet-${tweetId}-${i + 1}.jpg`;
    const savePath = path.join(IMAGES_DIR, filename);

    try {
      await downloadImage(imageUrl, savePath);
      downloadedFiles.push(filename);
    } catch (error) {
      console.error(`   ❌ Failed to download:`, error.message);
      console.log(`      URL: ${imageUrl}`);
      console.log(`      Tip: If you have a VPN, configure it in .env file`);
    }
  }

  return downloadedFiles;
}

/**
 * Extract tweet ID
 */
function extractTweetId(tweetUrl) {
  if (!tweetUrl) return null;
  const match = tweetUrl.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Generate unique ID
 */
function generateUniqueId() {
  return Date.now().toString();
}

/**
 * Generate Markdown
 */
function generateMarkdown(data) {
  let md = `\n## Title: ${data.title}\n`;
  if (data.source) md += `- **Source**: ${data.source}\n`;
  if (data.url) md += `- **Link**: ${data.url}\n`;
  if (data.date) md += `- **Date**: ${data.date}\n`;
  if (data.tags) md += `- **Tags**: ${data.tags}\n`;
  if (data.reason) md += `- **Reason**: ${data.reason}\n`;

  md += `\n`;

  if (data.summary) {
    md += `### Summary\n${data.summary}\n\n`;
  }

  if (data.content) {
    md += `### Content\n${data.content}\n\n`;
  }

  if (data.downloadedImages && data.downloadedImages.length > 0) {
    md += `### Images\n`;
    data.downloadedImages.forEach((filename, index) => {
      md += `![Image ${index + 1}](../images/${filename})\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  return md;
}

/**
 * Serve static file
 */
function serveStaticFile(pathname, res) {
  const filePath = path.join(__dirname, pathname);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

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

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
  }
}

// Start server
server.listen(PORT, () => {
  console.log('\n🚀 Content Collector Server V3 Started!\n');
  console.log(`   Server: http://localhost:${PORT}`);
  console.log(`   Images: ${IMAGES_DIR}`);

  if (PROXY_URL) {
    console.log(`   Proxy: ${PROXY_URL}`);
  } else {
    console.log(`   Proxy: None (Direct connection)`);
    console.log(`   💡 If image download fails, configure proxy in .env file`);
  }

  console.log('\n   Press Ctrl+C to stop\n');
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Server stopped\n');
  process.exit(0);
});
