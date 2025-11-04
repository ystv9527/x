#!/usr/bin/env node

/**
 * 简易API服务器 - 接收书签工具采集的内容
 * 运行方法: npm run server
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const COLLECTION_FILE = path.join(__dirname, 'content/collection.md');

// 创建HTTP服务器
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

    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // 生成Markdown格式内容
        const markdown = generateMarkdown(data);

        // 追加到collection.md文件
        fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');

        console.log('✅ 内容已添加:', data.title);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: '内容已保存' }));

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

// 生成Markdown格式内容
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
  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    md += `### 相关图片\n`;
    if (data.downloadedImages && data.downloadedImages.length > 0) {
      // 如果有下载的图片，使用本地路径
      data.downloadedImages.forEach((filename, index) => {
        md += `![图片 ${index + 1}](../images/${filename})\n`;
      });
    } else {
      // 否则保存图片URL（外链）
      md += `<!-- 图片URL（请手动下载并保存到images目录）:\n`;
      data.images.forEach((url, index) => {
        md += `${index + 1}. ${url}\n`;
      });
      md += `-->\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;

  return md;
}

// 静态文件服务
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
  console.log('\n🚀 书签采集服务器已启动！\n');
  console.log(`   访问地址: http://localhost:${PORT}`);
  console.log(`   API地址: http://localhost:${PORT}/api/add-content`);
  console.log(`   添加页面: http://localhost:${PORT}/add.html`);
  console.log('\n💡 现在可以使用书签工具采集X内容了！');
  console.log('   按 Ctrl+C 停止服务器\n');
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 服务器已关闭');
  process.exit(0);
});
