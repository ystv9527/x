#!/usr/bin/env node

/**
 * 更新 Nano Banana 案例的 summary 字段
 * 添加原 README 中的"输入"信息
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/PicoTrex/Awesome-Nano-Banana-images/main';
const README_URL = `${GITHUB_RAW_BASE}/README.md`;
const CONTENTS_JSON = path.join(__dirname, '../data/contents.json');

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

function parseInputs(readme) {
  console.log('\n📋 解析案例输入信息...');

  const inputs = {}; // { "标题": "输入信息" }
  const lines = readme.split('\n');

  let currentTitle = null;
  let inInput = false;
  let inputLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 匹配案例标题，提取标题文本
    const titleMatch = line.match(/^###\s+例\s*(\d+)[:：]\s*\[([^\]]+)\]/);
    if (titleMatch) {
      // 保存上一个案例的输入
      if (currentTitle && inputLines.length > 0) {
        inputs[currentTitle] = inputLines.join('\n').trim();
      }

      currentTitle = titleMatch[2]; // 提取标题
      inputLines = [];
      inInput = false;
      continue;
    }

    // 匹配输入开始
    if (line.includes('**输入:**') || line.includes('**输入：**')) {
      inInput = true;
      // 检查是否和标题在同一行
      const sameLineContent = line.replace(/\*\*输入[:：]\*\*/, '').trim();
      if (sameLineContent) {
        inputLines.push(sameLineContent);
      }
      continue;
    }

    // 收集输入内容
    if (inInput && currentTitle) {
      // 遇到下一个标题或提示词时结束
      if (line.startsWith('###') ||
          line.startsWith('**提示词:**') ||
          line.startsWith('**提示词：**') ||
          line.startsWith('---')) {
        inInput = false;
      } else if (line.trim()) {
        const cleaned = line.replace(/^```.*$/, '').trim();
        if (cleaned) {
          inputLines.push(cleaned);
        }
      }
    }
  }

  // 保存最后一个案例
  if (currentTitle && inputLines.length > 0) {
    inputs[currentTitle] = inputLines.join('\n').trim();
  }

  console.log(`✅ 解析完成，找到 ${Object.keys(inputs).length} 个案例有输入信息`);
  return inputs;
}

function updateContentsJson(inputs) {
  console.log('\n📝 更新 contents.json...');

  if (!fs.existsSync(CONTENTS_JSON)) {
    console.error('❌ contents.json 不存在');
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(CONTENTS_JSON, 'utf-8'));
  let updatedCount = 0;

  data.items.forEach(item => {
    // 检查是否是 Nano Banana 案例
    if (!item.tags.includes('Nano Banana')) {
      return;
    }

    // 从 summary 中提取标题（去掉后缀）
    const titleBase = item.summary.replace(/ - Nano Banana AI图片生成案例.*$/s, '').trim();

    // 查找对应的输入信息
    const inputText = inputs[titleBase];

    if (!inputText) {
      return;
    }

    // 更新 summary 格式
    item.summary = `${titleBase} - Nano Banana AI图片生成案例\n\n📥 输入：${inputText}`;
    updatedCount++;

    console.log(`  ✅ ${titleBase}`);
  });

  // 保存更新后的数据
  fs.writeFileSync(CONTENTS_JSON, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n✅ 更新完成: ${updatedCount} 个案例`);
  return updatedCount;
}

async function main() {
  try {
    console.log('🚀 更新 Nano Banana 案例输入信息\n');
    console.log('='.repeat(60));

    const readme = await downloadREADME();
    const inputs = parseInputs(readme);

    const updatedCount = updateContentsJson(inputs);

    if (updatedCount > 0) {
      console.log('\n🔄 重新生成 JSON 数据...');
      const { execSync } = require('child_process');
      execSync('npm run generate', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 全部完成！');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
