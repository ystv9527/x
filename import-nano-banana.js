#!/usr/bin/env node

/**
 * Nano Banana 案例导入脚本
 * 从 GitHub 仓库导入 108 个新案例
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/PicoTrex/Awesome-Nano-Banana-images/main';
const README_URL = `${GITHUB_RAW_BASE}/README.md`;
const COLLECTION_FILE = path.join(__dirname, 'content/collection.md');
const IMAGES_DIR = path.join(__dirname, 'images');

// 确保图片目录存在
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// 分类映射
const CATEGORY_MAP = {
  1: '3D转换', 2: '图像转换', 3: '创意设计', 4: '3D转换',
  5: '人像编辑', 6: '图像合成', 7: '图像编辑', 8: '人像编辑',
  9: '图像转换', 10: '创意设计', 11: '风格转换', 12: '创意设计',
  13: '图像编辑', 14: '创意设计', 15: '人像编辑', 16: '图像编辑',
  17: '3D转换', 18: '创意设计', 19: '创意设计', 20: '图像修复',
  21: '人像编辑', 22: '人像编辑', 23: '图像转换', 24: '漫画',
  25: '人像编辑', 26: '图像编辑', 27: '图像编辑', 28: '创意设计',
  29: '图像编辑', 30: '创意设计', 31: '漫画', 32: '3D转换',
  33: '3D转换', 34: '人像编辑', 35: '漫画', 36: '人像编辑',
  37: '人像编辑', 38: '创意设计', 39: '风格转换', 40: '人像编辑',
  41: '创意设计', 42: '图像编辑', 43: '人像编辑', 44: '图像编辑',
  45: '3D转换', 46: '3D转换', 47: '创意设计', 48: '图像编辑',
  49: '图像编辑', 50: '图像修复', 51: '创意设计', 52: '图像合成',
  53: '图像编辑', 54: '图像合成', 55: '创意设计', 56: '漫画',
  57: '漫画', 58: '3D转换', 59: '风格转换', 60: '图像编辑',
  61: '3D转换', 62: '图像转换', 64: '创意设计', 65: '创意设计',
  66: '图像编辑', 67: '创意设计', 68: '创意设计', 69: '3D转换',
  70: '创意设计', 71: '图像编辑', 72: '图像编辑', 73: '图像编辑',
  74: '图像修复', 75: '3D转换', 76: '漫画', 77: '创意设计',
  78: '图像修复', 79: '创意设计', 80: '图像编辑', 81: '创意设计',
  82: '创意设计', 83: '创意设计', 84: '风格转换', 85: '创意设计',
  86: '创意设计', 87: '图像编辑', 88: '创意设计', 89: '3D转换',
  90: '人像编辑', 91: '创意设计', 92: '创意设计', 94: '创意设计',
  95: '创意设计', 96: '创意设计', 97: '图像编辑', 98: '创意设计',
  99: '创意设计', 100: '图像编辑', 101: '图像转换', 102: '创意设计',
  103: '创意设计', 104: '创意设计', 105: '创意设计', 106: '创意设计',
  107: '创意设计', 108: '创意设计', 109: '人像编辑', 110: '风格转换'
};

// 跳过重复的案例
const SKIP_CASES = [63, 93];

/**
 * 下载文件
 */
function downloadFile(url, savePath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 处理重定向
        downloadFile(response.headers.location, savePath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(savePath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * 下载 README
 */
async function downloadREADME() {
  console.log('📥 下载 Nano Banana README...');

  return new Promise((resolve, reject) => {
    https.get(README_URL, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        console.log('✅ README 下载完成');
        resolve(data);
      });
    }).on('error', reject);
  });
}

/**
 * 解析 README 提取案例信息
 */
function parseREADME(readme) {
  console.log('\n📋 解析案例信息...');

  const cases = [];
  const lines = readme.split('\n');

  let currentCase = null;
  let inPrompt = false;
  let promptLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 匹配案例标题: ### 例 1: [插画变手办](url)（by [@author](url)）
    const titleMatch = line.match(/^###\s+例\s+(\d+):\s+\[([^\]]+)\]\(([^)]+)\).*?by\s+\[@([^\]]+)\]/);
    if (titleMatch) {
      // 保存上一个案例
      if (currentCase && !SKIP_CASES.includes(currentCase.id)) {
        currentCase.prompt = promptLines.join('\n').trim();
        cases.push(currentCase);
      }

      const caseId = parseInt(titleMatch[1]);
      currentCase = {
        id: caseId,
        title: titleMatch[2],
        url: titleMatch[3],
        author: titleMatch[4],
        category: CATEGORY_MAP[caseId] || '图像编辑',
        images: [],
        prompt: ''
      };
      promptLines = [];
      inPrompt = false;
      continue;
    }

    // 匹配图片: <img src="images/case1/input0.jpg"
    const imageMatch = line.match(/src="(images\/case\d+\/[^"]+)"/g);
    if (imageMatch && currentCase) {
      imageMatch.forEach(match => {
        const imgPath = match.match(/src="([^"]+)"/)[1];
        if (!currentCase.images.includes(imgPath)) {
          currentCase.images.push(imgPath);
        }
      });
    }

    // 匹配提示词开始
    if (line.includes('**提示词:**') || line.includes('**输入:**')) {
      inPrompt = true;
      continue;
    }

    // 收集提示词内容
    if (inPrompt && currentCase) {
      // 遇到下一个标题或空行较多时结束
      if (line.startsWith('###') || line.startsWith('---') || line.startsWith('##')) {
        inPrompt = false;
      } else if (line.trim()) {
        // 移除代码块标记
        const cleaned = line.replace(/^```.*$/, '').trim();
        if (cleaned) {
          promptLines.push(cleaned);
        }
      }
    }
  }

  // 保存最后一个案例
  if (currentCase && !SKIP_CASES.includes(currentCase.id)) {
    currentCase.prompt = promptLines.join('\n').trim();
    cases.push(currentCase);
  }

  console.log(`✅ 解析完成，共 ${cases.length} 个案例`);
  return cases;
}

/**
 * 下载案例图片
 */
async function downloadCaseImages(cases) {
  console.log('\n📥 开始下载图片...');

  let downloaded = 0;
  let skipped = 0;

  for (const caseItem of cases) {
    for (const imgPath of caseItem.images) {
      const imgUrl = `${GITHUB_RAW_BASE}/${imgPath}`;
      const filename = path.basename(imgPath);
      const newFilename = `nano-case${caseItem.id}-${filename}`;
      const savePath = path.join(IMAGES_DIR, newFilename);

      // 检查文件是否已存在
      if (fs.existsSync(savePath)) {
        skipped++;
        continue;
      }

      try {
        await downloadFile(imgUrl, savePath);
        downloaded++;

        // 更新图片路径为本地路径
        const index = caseItem.images.indexOf(imgPath);
        caseItem.images[index] = `images/${newFilename}`;

        console.log(`  ✅ [${downloaded + skipped}/${getTotalImages(cases)}] ${newFilename}`);
      } catch (error) {
        console.error(`  ❌ 下载失败: ${filename} - ${error.message}`);
      }
    }
  }

  console.log(`\n✅ 图片下载完成: ${downloaded}个新下载, ${skipped}个已存在`);
}

function getTotalImages(cases) {
  return cases.reduce((sum, c) => sum + c.images.length, 0);
}

/**
 * 生成 Markdown
 */
function generateMarkdown(cases) {
  console.log('\n📝 生成 Markdown...');

  let markdown = '';
  const today = new Date().toISOString().split('T')[0];

  // 获取当前最大案例号
  const existingData = fs.existsSync('data/contents.json')
    ? JSON.parse(fs.readFileSync('data/contents.json', 'utf-8'))
    : { items: [] };

  const maxCaseNumber = existingData.items.length;

  cases.forEach((caseItem, index) => {
    const caseNumber = String(maxCaseNumber + index + 1).padStart(3, '0');
    const tags = `图片,Nano Banana,${caseItem.category}`;

    markdown += `## 标题：${caseItem.title}\n`;
    markdown += `- **编号**: 案例${caseNumber}\n`;
    markdown += `- **来源**: @${caseItem.author}\n`;
    markdown += `- **链接**: ${caseItem.url}\n`;
    markdown += `- **日期**: ${today}\n`;
    markdown += `- **标签**: ${tags}\n`;
    markdown += `- **收藏理由**: \n\n`;
    markdown += `### 内容摘要\n`;
    markdown += `${caseItem.title} - Nano Banana AI图片生成案例\n\n`;
    markdown += `### 🇨🇳 中文内容\n`;
    markdown += `${caseItem.prompt}\n\n`;

    // 添加图片
    if (caseItem.images.length > 0) {
      markdown += `### 📷 图片\n`;
      caseItem.images.forEach(img => {
        markdown += `![](${img})\n`;
      });
      markdown += `\n`;
    }

    markdown += `---\n\n`;
  });

  return markdown;
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 Nano Banana 导入脚本开始\n');
    console.log('=' .repeat(60));

    // 1. 下载 README
    const readme = await downloadREADME();

    // 2. 解析案例
    const cases = parseREADME(readme);

    // 3. 下载图片
    await downloadCaseImages(cases);

    // 4. 生成 Markdown
    const markdown = generateMarkdown(cases);

    // 5. 追加到 collection.md
    console.log('\n💾 保存到 collection.md...');
    fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');
    console.log('✅ 已追加到 collection.md');

    // 6. 生成 JSON
    console.log('\n🔄 生成 JSON 数据...');
    const { execSync } = require('child_process');
    execSync('npm run generate', { cwd: __dirname, stdio: 'inherit' });

    console.log('\n' + '='.repeat(60));
    console.log('✅ 导入完成！');
    console.log(`📊 导入了 ${cases.length} 个新案例`);
    console.log(`📈 预计总案例数: ${JSON.parse(fs.readFileSync('data/contents.json', 'utf-8')).items.length}`);

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
