#!/usr/bin/env node

/**
 * Content Collector Server - Support for Form Upload
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 代理支持
let HttpsProxyAgent;
try {
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch(e) {
  console.log('⚠️ https-proxy-agent not installed, proxy will not work');
}

// 文件上传支持
const formidable = require('formidable');

const PORT = 3000;
const COLLECTION_FILE = path.join(__dirname, 'content/collection.md');
const IMAGES_DIR = path.join(__dirname, 'images');
const VIDEOS_DIR = path.join(__dirname, 'videos');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Ensure directories exist
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

/**
 * 🎬 下载 M3U8 视频（使用 ffmpeg）
 * @param {string} m3u8Url - M3U8 播放列表URL
 * @param {string} outputPath - 输出文件路径
 * @param {function} callback - 回调函数 (error)
 */
function downloadM3U8(m3u8Url, outputPath, callback) {
  const { exec } = require('child_process');

  // 检查 ffmpeg 是否可用
  exec('ffmpeg -version', (error) => {
    if (error) {
      console.error('❌ ffmpeg 未安装！请先安装 ffmpeg：');
      console.error('   Windows: choco install ffmpeg  或从 https://ffmpeg.org 下载');
      console.error('   Mac: brew install ffmpeg');
      console.error('   Linux: apt install ffmpeg 或 yum install ffmpeg');

      callback(new Error('ffmpeg 未安装，无法下载 M3U8 视频'));
      return;
    }

    // 使用 ffmpeg 下载并转换 M3U8
    const command = `ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${outputPath}" -y`;
    console.log('🎬 执行命令:', command);

    const ffmpegProcess = exec(command, {
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });

    ffmpegProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('✅ M3U8 视频下载完成');
        callback(null);
      } else {
        console.error(`❌ ffmpeg 退出码: ${code}`);
        callback(new Error(`ffmpeg 下载失败，退出码: ${code}`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      console.error('❌ ffmpeg 执行错误:', err);
      callback(err);
    });

    // 打印 ffmpeg 输出（用于调试）
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('time=') || output.includes('speed=')) {
        // 只打印进度信息的最后一行
        process.stdout.write('\r' + output.trim().split('\n').pop());
      }
    });
  });
}

// Helper function: Load config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('配置文件读取失败:', error);
  }
  return { ai: { enabled: false } };
}

// Helper function: Save config
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// Helper function: Get next case number
function getNextCaseNumber() {
  try {
    if (!fs.existsSync(COLLECTION_FILE)) {
      return '案例001';
    }

    const content = fs.readFileSync(COLLECTION_FILE, 'utf-8');
    const matches = content.match(/- \*\*编号\*\*:\s*案例(\d+)/g);

    if (!matches || matches.length === 0) {
      return '案例001';
    }

    // 提取所有编号
    const numbers = matches.map(match => {
      const num = match.match(/案例(\d+)/);
      return num ? parseInt(num[1]) : 0;
    });

    // 找到最大编号
    const maxNumber = Math.max(...numbers);
    const nextNumber = maxNumber + 1;

    // 格式化为3位数字
    return `案例${String(nextNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('获取编号失败:', error);
    return '案例001';
  }
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

  // API: Status check endpoint (for extension)
  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // API: Get config
  if (pathname === '/api/config' && req.method === 'GET') {
    const config = loadConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // API: Save config
  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const config = JSON.parse(body);
        saveConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: '配置保存成功' }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: error.message }));
      }
    });
    return;
  }

  // API: Test AI connection
  if (pathname === '/api/test-ai' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { apiUrl, apiKey, model } = JSON.parse(body);

        const testData = JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        });

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        };

        const apiRequest = https.request(
          `${apiUrl}/chat/completions`,
          options,
          (apiRes) => {
            let responseData = '';
            apiRes.on('data', chunk => responseData += chunk);
            apiRes.on('end', () => {
              if (apiRes.statusCode === 200) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: false,
                  error: `API返回错误: ${apiRes.statusCode}`
                }));
              }
            });
          }
        );

        apiRequest.on('error', (error) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        });

        apiRequest.write(testData);
        apiRequest.end();
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: AI Optimize content
  // 标签白名单 - 固定的标签库
  const TAG_WHITELIST = [
    // 主题类
    'AI', '设计', '摄影', '动画', '创意',
    // 内容类型
    '教程', '技巧', '工具', '案例', '灵感', '资源',
    // 媒体类型（自动添加）
    '图片', '视频',
    // 领域类
    '数字艺术', '产品设计', 'UI设计', '3D', '特效', '后期',
    // 其他
    '社交媒体', '营销', '商务', '旅行', '时尚', '科技'
  ];

  // API: 获取标签白名单
  if (pathname === '/api/tags' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tags: TAG_WHITELIST }));
    return;
  }

  if (pathname === '/api/ai-optimize' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { content } = JSON.parse(body);
        const config = loadConfig();

        if (!config.ai || !config.ai.enabled) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'AI功能未启用，请先在设置中配置'
          }));
          return;
        }

        const prompt = `请分析以下推文内容，生成优质的中文标题、简短摘要和标签。

推文内容：
${content}

请以JSON格式返回，格式如下：
{
  "title": "吸引人的中文标题（20-40字）",
  "summary": "简短摘要（50-100字）",
  "tags": "标签1,标签2,标签3"
}

⚠️ 标签必须从以下白名单中选择（最多选3-5个）：
${TAG_WHITELIST.join(', ')}

注意：
1. 标题要简洁有力，突出核心内容
2. 摘要要准确概括主要信息
3. 标签：**必须从上述白名单中选择3-5个**，按相关性排序
4. 只返回JSON，不要其他文字`;

        const apiData = JSON.stringify({
          model: config.ai.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: config.ai.temperature,
          max_tokens: config.ai.maxTokens
        });

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.ai.apiKey}`
          }
        };

        const apiRequest = https.request(
          `${config.ai.apiUrl}/chat/completions`,
          options,
          (apiRes) => {
            let responseData = '';
            apiRes.on('data', chunk => responseData += chunk);
            apiRes.on('end', () => {
              try {
                const result = JSON.parse(responseData);
                const aiResponse = result.choices[0].message.content;

                // 提取JSON
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const optimized = JSON.parse(jsonMatch[0]);

                  // 验证并过滤标签：只保留白名单中的标签
                  if (optimized.tags) {
                    const tags = optimized.tags.split(',').map(t => t.trim());
                    const validTags = tags.filter(tag => TAG_WHITELIST.includes(tag));

                    if (validTags.length < tags.length) {
                      const invalidTags = tags.filter(tag => !TAG_WHITELIST.includes(tag));
                      console.log(`⚠️ 过滤了非白名单标签: ${invalidTags.join(', ')}`);
                    }

                    optimized.tags = validTags.slice(0, 5).join(',');
                    console.log(`✅ 验证后的标签: ${optimized.tags}`);
                  }

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, data: optimized }));
                } else {
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    success: false,
                    error: 'AI返回格式错误'
                  }));
                }
              } catch (error) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
              }
            });
          }
        );

        apiRequest.on('error', (error) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: error.message }));
        });

        apiRequest.write(apiData);
        apiRequest.end();
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: Simple collect endpoint (from console)
  if (req.method === 'POST' && pathname === '/api/collect') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('📝 Content received:', data.title);

        // Generate Markdown
        const markdown = generateMarkdown(data);
        fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');

        console.log('✅ Content saved:', data.title);
        console.log('📊 统计: 图片', downloadedImages.length, '个, 视频', downloadedVideos.length, '个');

        // 自动生成 JSON 数据
        console.log('🔄 自动生成 JSON 数据...');
        const { execSync } = require('child_process');
        try {
          execSync('node scripts/generate-dataset.js', { cwd: __dirname });
          console.log('✅ JSON 数据已自动更新');
        } catch (err) {
          console.error('⚠️ JSON 生成失败:', err.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Content saved',
          url: 'http://localhost:3000/add-auto.html?title=' + encodeURIComponent(data.title)
        }));
      } catch(error) {
        console.error('❌ Save failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: Download image from URL (server-side)
  if (req.method === 'POST' && pathname === '/api/download-image') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { imageUrl, tweetId, index } = JSON.parse(body);

        console.log(`📥 下载图片 ${index}: ${imageUrl.substring(0, 80)}...`);

        // 检查是否需要使用代理
        const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
        let requestOptions = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };

        if (proxyUrl && HttpsProxyAgent) {
          console.log(`🔌 使用代理: ${proxyUrl}`);
          requestOptions.agent = new HttpsProxyAgent(proxyUrl);
        }

        https.get(imageUrl, requestOptions, (response) => {
          if (response.statusCode === 200) {
            const filename = `tweet-${tweetId}-${index}.jpg`;
            const savePath = path.join(IMAGES_DIR, filename);
            const fileStream = fs.createWriteStream(savePath);

            response.pipe(fileStream);

            fileStream.on('finish', () => {
              fileStream.close();
              console.log(`✅ 图片保存成功: ${filename}`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, filename }));
            });
          } else {
            console.error(`❌ HTTP ${response.statusCode}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'HTTP error' }));
          }
        }).on('error', (err) => {
          console.error(`❌ 下载失败:`, err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        });

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

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
        let downloadedVideos = [];

        if (contentType.includes('application/json')) {
          // JSON format (old method)
          data = JSON.parse(body.toString());
        } else if (contentType.includes('multipart/form-data')) {
          // Form data with file upload
          const boundary = contentType.split('boundary=')[1];
          const bodyText = body.toString('utf-8');
          const parts = bodyText.split('--' + boundary);

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

        // 处理已下载的图片文件名
        if (data.downloadedImageFiles) {
          downloadedImages = data.downloadedImageFiles.split(',').filter(f => f.trim());
          console.log(`🖼️ Images already downloaded: ${downloadedImages.length}`);
        } else {
          console.log(`🖼️ Images saved: ${downloadedImages.length}`);
        }

        // Handle videos (独立处理，不依赖图片)
        if (data.downloadedVideos) {
          downloadedVideos = data.downloadedVideos.split(',').filter(f => f.trim());
          console.log(`🎬 Videos already downloaded: ${downloadedVideos.length}`);
        }

        data.downloadedImages = downloadedImages;
        data.downloadedVideos = downloadedVideos;

        // 自动生成编号
        data.caseNumber = getNextCaseNumber();

        // 自动分离中英文内容
        if (data.content && !data.contentChinese && !data.contentEnglish) {
          const separators = ['---', '###', '==='];
          let separated = false;

          for (let sep of separators) {
            // 检查分隔符是否存在（前后可以有空白字符）
            const regex = new RegExp(`\\n\\s*${sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`);
            if (regex.test(data.content)) {
              const parts = data.content.split(regex);
              // parts[0] 通常是英文，parts[1] 是中文
              data.contentEnglish = parts[0].trim();
              data.contentChinese = parts[1] ? parts[1].trim() : '';
              console.log(`📝 检测到分隔符 "${sep}"，已自动分离中英文`);
              separated = true;
              break;
            }
          }

          // 如果成功分离，清空原 content 字段
          if (separated) {
            delete data.content;
          }
        }

        // Generate Markdown
        const markdown = generateMarkdown(data);
        fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');

        console.log('✅ Content saved:', data.title);
        console.log('📊 统计: 图片', downloadedImages.length, '个, 视频', downloadedVideos.length, '个');

        // 自动生成 JSON 数据
        console.log('🔄 自动生成 JSON 数据...');
        const { execSync } = require('child_process');
        try {
          execSync('node scripts/generate-dataset.js', { cwd: __dirname });
          console.log('✅ JSON 数据已自动更新');
        } catch (err) {
          console.error('⚠️ JSON 生成失败:', err.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Content saved',
          downloadedImages: downloadedImages.length,
          downloadedVideos: downloadedVideos.length
        }));

      } catch (error) {
        console.error('❌ Save failed:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // GET /add.html - Auto download and upload
  if (req.method === 'GET' && pathname === '/add.html' || pathname === '/add-auto.html') {
    const filePath = path.join(__dirname, pathname === '/add.html' ? 'add-v3.html' : 'add-auto.html');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
    return;
  }

  // API: Upload video (from browser-processed HLS)
  if (req.method === 'POST' && pathname === '/api/upload-video') {
    const form = formidable({
      uploadDir: VIDEOS_DIR,
      keepExtensions: true,
      maxFileSize: 500 * 1024 * 1024, // 500MB
      filename: (name, ext, part, form) => {
        // 使用客户端提供的文件名
        return part.originalFilename || `video-${Date.now()}${ext}`;
      }
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('❌ 文件上传失败:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
        return;
      }

      try {
        const videoFile = files.video[0];
        const tweetId = fields.tweetId[0];
        const index = fields.index[0];
        const mimeType = fields.mimeType?.[0] || 'video/mp4';

        // 重命名文件
        const filename = `tweet-${tweetId}-${index}.mp4`;
        const finalPath = path.join(VIDEOS_DIR, filename);

        fs.renameSync(videoFile.filepath, finalPath);
        console.log(`✅ 视频上传成功: ${filename} (${(videoFile.size / 1024 / 1024).toFixed(2)} MB)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          filename,
          mimeType,
          size: videoFile.size
        }));

      } catch (error) {
        console.error('❌ 文件处理失败:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });

    return;
  }

  // API: Download video
  if (req.method === 'POST' && pathname === '/api/download-video') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { videoUrl, tweetId, index } = JSON.parse(body);

        console.log(`📥 下载视频 ${index}: ${videoUrl.substring(0, 80)}...`);

        const filename = `tweet-${tweetId}-${index}.mp4`;
        const savePath = path.join(VIDEOS_DIR, filename);

        // 🎬 检测是否是 M3U8 格式
        if (videoUrl.includes('.m3u8')) {
          console.log('🎥 检测到M3U8格式，使用ffmpeg下载...');
          downloadM3U8(videoUrl, savePath, (error) => {
            if (error) {
              console.error(`❌ M3U8下载失败:`, error.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: error.message }));
            } else {
              console.log(`✅ 视频保存成功: ${filename}`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, filename }));
            }
          });
        } else {
          // 直接下载 MP4 文件
          const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
          let requestOptions = {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          };

          if (proxyUrl && HttpsProxyAgent) {
            console.log(`🔌 使用代理: ${proxyUrl}`);
            requestOptions.agent = new HttpsProxyAgent(proxyUrl);
          }

          https.get(videoUrl, requestOptions, (response) => {
            if (response.statusCode === 200) {
              const fileStream = fs.createWriteStream(savePath);

              response.pipe(fileStream);

              fileStream.on('finish', () => {
                fileStream.close();
                console.log(`✅ 视频保存成功: ${filename}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, filename }));
              });
            } else {
              console.error(`❌ HTTP ${response.statusCode}`);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'HTTP error' }));
            }
          }).on('error', (err) => {
            console.error(`❌ 视频下载失败:`, err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          });
        }

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
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
  if (data.caseNumber) md += `- **编号**: ${data.caseNumber}\n`;
  if (data.source) md += `- **来源**: ${data.source}\n`;
  if (data.url) md += `- **链接**: ${data.url}\n`;
  if (data.date) md += `- **日期**: ${data.date}\n`;
  if (data.tags) md += `- **分类**: ${data.tags}\n`;
  if (data.reason) md += `- **收藏理由**: ${data.reason}\n`;

  md += `\n`;

  if (data.summary) {
    md += `### 内容摘要\n${data.summary}\n\n`;
  }

  // 优先使用分离的中英文内容
  if (data.contentChinese || data.contentEnglish) {
    if (data.contentChinese) {
      md += `### 🇨🇳 中文内容\n${data.contentChinese}\n\n`;
    }
    if (data.contentEnglish) {
      md += `### 🇺🇸 英文内容\n${data.contentEnglish}\n\n`;
    }
  } else if (data.content) {
    // 兼容旧版本：如果没有分离的内容，使用原始 content 字段
    md += `### 完整内容\n${data.content}\n\n`;
  }

  if (data.downloadedImages && data.downloadedImages.length > 0) {
    md += `### 相关图片\n`;
    data.downloadedImages.forEach((filename, index) => {
      md += `![图片 ${index + 1}](../images/${filename})\n`;
    });
    md += `\n`;
  }
  if (data.downloadedVideos && data.downloadedVideos.length > 0) {
    md += `### 相关视频
`;
    data.downloadedVideos.forEach((filename, index) => {
      md += `<video width="100%" controls><source src="../videos/${filename}" type="video/mp4"></video>
`;
    });
    md += `
`;
  }


  // 添加图片URL（如果有的话）
  if (data.imageUrls) {
    const urls = typeof data.imageUrls === 'string' ? data.imageUrls.split('|').filter(u => u.trim()) : data.imageUrls;
    if (urls.length > 0) {
      md += `### 图片URL\n`;
      urls.forEach((url, index) => {
        md += `- [图片 ${index + 1}](${url})\n`;
      });
      md += `\n`;
    }
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
