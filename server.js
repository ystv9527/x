#!/usr/bin/env node

/**
 * Content Collector Server - Support for Form Upload
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const COLLECTION_FILE = path.join(__dirname, 'content/collection.md');
const IMAGES_DIR = path.join(__dirname, 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API: Add content with form data (file upload)
  if (req.method === 'POST' && pathname === '/api/add-content') {
    let body = Buffer.alloc(0);

    req.on('data', chunk => {
      body = Buffer.concat([body, chunk]);
    });

    req.on('end', async () => {
      try {
        const contentType = req.headers['content-type'] || '';

        let data = {};
        let downloadedImages = [];

        if (contentType.includes('application/json')) {
          // JSON format (old method)
          data = JSON.parse(body.toString());
        } else if (contentType.includes('multipart/form-data')) {
          // Form data with file upload
          const boundary = contentType.split('boundary=')[1];
          const parts = body.toString('binary').split('--' + boundary);

          for (let part of parts) {
            if (part.includes('Content-Disposition')) {
              const nameMatch = part.match(/name="([^"]+)"/);
              const filenameMatch = part.match(/filename="([^"]+)"/);

              if (filenameMatch) {
                // File upload
                const fieldName = nameMatch[1];
                const filename = filenameMatch[1];
                const fileStart = part.indexOf('\r\n\r\n') + 4;
                const fileEnd = part.lastIndexOf('\r\n');
                const fileBuffer = Buffer.from(part.substring(fileStart, fileEnd), 'binary');

                const tweetId = data.url ? extractTweetId(data.url) : generateUniqueId();
                const index = downloadedImages.length + 1;
                const newFilename = `tweet-${tweetId}-${index}.jpg`;
                const savePath = path.join(IMAGES_DIR, newFilename);

                fs.writeFileSync(savePath, fileBuffer);
                downloadedImages.push(newFilename);

                console.log(`   ✅ Saved: ${newFilename}`);
              } else {
                // Form field
                const fieldName = nameMatch[1];
                const fieldStart = part.indexOf('\r\n\r\n') + 4;
                const fieldEnd = part.lastIndexOf('\r\n');
                const fieldValue = part.substring(fieldStart, fieldEnd);

                data[fieldName] = fieldValue;
              }
            }
          }
        }

        console.log('📝 Content received:', data.title);
        console.log(`🖼️ Images saved: ${downloadedImages.length}`);

        data.downloadedImages = downloadedImages;

        // Generate Markdown
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

  // GET /add.html - Use V3 with file upload
  if (req.method === 'GET' && pathname === '/add.html') {
    const filePath = path.join(__dirname, 'add-v3.html');
    const content = fs.readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
    return;
  }

  // GET / - Main page
  if (req.method === 'GET' && pathname === '/') {
    const indexPath = path.join(__dirname, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
 * Extract tweet ID from URL
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
  let md = `\n## ${data.title}\n`;
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
    '.html': 'text/html; charset=utf-8',
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
  console.log('\n🚀 Content Collector Server Started!\n');
  console.log(`   Server: http://localhost:${PORT}`);
  console.log(`   Images: ${IMAGES_DIR}`);
  console.log('\n💡 Upload images directly from browser - No VPN proxy needed!\n');
  console.log('   Press Ctrl+C to stop\n');
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Server stopped\n');
  process.exit(0);
});
