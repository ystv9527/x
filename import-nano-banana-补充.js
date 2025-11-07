#!/usr/bin/env node

/**
 * Nano Banana 补充导入脚本
 * 导入剩余的案例 81-110（排除重复的63和93）
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/PicoTrex/Awesome-Nano-Banana-images/main';
const README_URL = `${GITHUB_RAW_BASE}/README.md`;
const COLLECTION_FILE = path.join(__dirname, 'content/collection.md');
const IMAGES_DIR = path.join(__dirname, 'images');

// 分类映射（只包含81-110）
const CATEGORY_MAP = {
  81: '创意设计', 82: '创意设计', 83: '创意设计', 84: '风格转换',
  85: '创意设计', 86: '创意设计', 87: '图像编辑', 88: '创意设计',
  89: '3D转换', 90: '人像编辑', 91: '创意设计', 92: '创意设计',
  94: '创意设计', 95: '创意设计', 96: '创意设计', 97: '图像编辑',
  98: '创意设计', 99: '创意设计', 100: '图像编辑', 101: '图像转换',
  102: '创意设计', 103: '创意设计', 104: '创意设计', 105: '创意设计',
  106: '创意设计', 107: '创意设计', 108: '创意设计', 109: '人像编辑',
  110: '风格转换'
};

// 跳过重复的案例
const SKIP_CASES = [63, 93];

function downloadFile(url, savePath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
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

function parseREADME(readme) {
  console.log('\n📋 解析案例信息（案例81-110）...');

  const cases = [];
  const lines = readme.split('\n');

  let currentCase = null;
  let inPrompt = false;
  let promptLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 匹配两种格式：
    // 1. ### 例 1: [标题](URL)... （英文冒号，有空格）
    // 2. ### 例81：[标题](URL)... （中文冒号，无空格）
    const titleMatch = line.match(/^###\s+例\s*(\d+)[:：]\s*\[([^\]]+)\]\(([^)]+)\).*?by\s+\[@([^\]]+)\]/);

    if (titleMatch) {
      // 保存上一个案例
      if (currentCase && !SKIP_CASES.includes(currentCase.id) && currentCase.id >= 81) {
        currentCase.prompt = promptLines.join('\n').trim();
        cases.push(currentCase);
      }

      const caseId = parseInt(titleMatch[1]);

      // 只处理81-110的案例
      if (caseId >= 81 && caseId <= 110) {
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
      } else {
        currentCase = null;
      }
      continue;
    }

    // 匹配图片
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
      if (line.startsWith('###') || line.startsWith('---') || line.startsWith('##')) {
        inPrompt = false;
      } else if (line.trim()) {
        const cleaned = line.replace(/^```.*$/, '').trim();
        if (cleaned) {
          promptLines.push(cleaned);
        }
      }
    }
  }

  // 保存最后一个案例
  if (currentCase && !SKIP_CASES.includes(currentCase.id) && currentCase.id >= 81) {
    currentCase.prompt = promptLines.join('\n').trim();
    cases.push(currentCase);
  }

  console.log(`✅ 解析完成，共 ${cases.length} 个补充案例`);
  return cases;
}

async function downloadCaseImages(cases) {
  console.log('\n📥 开始下载补充案例图片...');

  let downloaded = 0;
  let skipped = 0;

  for (const caseItem of cases) {
    for (const imgPath of caseItem.images) {
      const imgUrl = `${GITHUB_RAW_BASE}/${imgPath}`;
      const filename = path.basename(imgPath);
      const newFilename = `nano-case${caseItem.id}-${filename}`;
      const savePath = path.join(IMAGES_DIR, newFilename);

      if (fs.existsSync(savePath)) {
        skipped++;
        const index = caseItem.images.indexOf(imgPath);
        caseItem.images[index] = `images/${newFilename}`;
        continue;
      }

      try {
        await downloadFile(imgUrl, savePath);
        downloaded++;

        const index = caseItem.images.indexOf(imgPath);
        caseItem.images[index] = `images/${newFilename}`;

        console.log(`  ✅ [${downloaded + skipped}] ${newFilename}`);
      } catch (error) {
        console.error(`  ❌ 下载失败: ${filename} - ${error.message}`);
      }
    }
  }

  console.log(`\n✅ 图片下载完成: ${downloaded}个新下载, ${skipped}个已存在`);
}

function generateMarkdown(cases) {
  console.log('\n📝 生成补充案例 Markdown...');

  let markdown = '';
  const today = new Date().toISOString().split('T')[0];

  const existingData = JSON.parse(fs.readFileSync('data/contents.json', 'utf-8'));
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

async function main() {
  try {
    console.log('🚀 Nano Banana 补充导入脚本\n');
    console.log('=' .repeat(60));

    const readme = await downloadREADME();
    const cases = parseREADME(readme);

    await downloadCaseImages(cases);

    const markdown = generateMarkdown(cases);

    console.log('\n💾 追加到 collection.md...');
    fs.appendFileSync(COLLECTION_FILE, markdown, 'utf-8');
    console.log('✅ 已追加到 collection.md');

    console.log('\n🔄 生成 JSON 数据...');
    const { execSync } = require('child_process');
    execSync('echo "y" | npm run generate', { cwd: __dirname, stdio: 'inherit', shell: true });

    console.log('\n' + '='.repeat(60));
    console.log('✅ 补充导入完成！');
    console.log(`📊 补充了 ${cases.length} 个案例`);

    const finalData = JSON.parse(fs.readFileSync('data/contents.json', 'utf-8'));
    console.log(`📈 最终总案例数: ${finalData.items.length}`);

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
