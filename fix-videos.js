const fs = require('fs');
const path = require('path');

// 读取 collection.md
const mdPath = path.join(__dirname, 'content', 'collection.md');
let content = fs.readFileSync(mdPath, 'utf-8');

// 获取所有视频文件
const videosDir = path.join(__dirname, 'videos');
const videoFiles = fs.readdirSync(videosDir).filter(f => f.endsWith('.mp4'));

console.log(`📹 找到 ${videoFiles.length} 个视频文件`);

let addedCount = 0;

videoFiles.forEach(filename => {
  // 从文件名提取推文 ID：tweet-{tweetId}-{index}.mp4
  const match = filename.match(/tweet-(\d+)-\d+\.mp4/);
  if (!match) {
    console.log(`⚠️  跳过无效文件名: ${filename}`);
    return;
  }

  const tweetId = match[1];

  // 查找这个推文ID在markdown中的位置
  const linkPattern = new RegExp(`https://x\\.com/[^/]+/status/${tweetId}`, 'g');
  const matches = [...content.matchAll(linkPattern)];

  if (matches.length === 0) {
    console.log(`⚠️  未找到推文 ID ${tweetId} 的链接`);
    return;
  }

  // 检查是否已经有视频标记了
  const videoTag = `../videos/${filename}`;
  if (content.includes(videoTag)) {
    console.log(`✅ ${tweetId} 已有视频标记`);
    return;
  }

  // 找到这个链接后面的第一个 "---" 分隔符
  // 只处理第一个匹配（避免重复推文）
  const linkMatch = matches[0];
  const linkPos = linkMatch.index;

  // 查找下一个 \n---（Windows和Unix换行符都支持）
  let nextSeparator = content.indexOf('\n---', linkPos);
  if (nextSeparator === -1) {
    nextSeparator = content.indexOf('\r\n---', linkPos);
  }

  if (nextSeparator === -1) {
    console.log(`⚠️  未找到分隔符 for ${tweetId}`);
    return;
  }

  // 在分隔符前插入视频标记
  const videoSection = `\n### 相关视频\n<video width="100%" controls><source src="../videos/${filename}" type="video/mp4"></video>\n`;

  content = content.slice(0, nextSeparator) + videoSection + content.slice(nextSeparator);
  addedCount++;
  console.log(`✅ 添加视频到推文 ${tweetId}`);
});

// 写回文件
fs.writeFileSync(mdPath, content, 'utf-8');

console.log(`\n🎉 完成！共添加 ${addedCount} 个视频标记`);
