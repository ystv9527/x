#!/usr/bin/env node
/**
 * 提取视频的第一帧作为缩略图
 * 需要安装 ffmpeg: https://ffmpeg.org/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VIDEO_DIR = path.join(__dirname, '..', 'videos');
const THUMBNAIL_DIR = path.join(__dirname, '..', 'thumbnails');

// 创建缩略图目录
if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

console.log('🎬 开始提取视频缩略图...\n');

try {
    // 检查 ffmpeg 是否安装
    execSync('ffmpeg -version', { stdio: 'ignore' });
} catch (error) {
    console.error('❌ 错误：未检测到 ffmpeg');
    console.error('请访问 https://ffmpeg.org/download.html 安装 ffmpeg');
    process.exit(1);
}

// 获取所有视频文件
const videoFiles = fs.readdirSync(VIDEO_DIR).filter(file => file.endsWith('.mp4'));

let successCount = 0;
let failCount = 0;

videoFiles.forEach((videoFile, index) => {
    const videoPath = path.join(VIDEO_DIR, videoFile);
    const thumbnailName = videoFile.replace('.mp4', '.jpg');
    const thumbnailPath = path.join(THUMBNAIL_DIR, thumbnailName);

    // 如果缩略图已存在，跳过
    if (fs.existsSync(thumbnailPath)) {
        console.log(`⏭️  跳过 ${videoFile}（缩略图已存在）`);
        return;
    }

    try {
        // 使用 ffmpeg 提取第一帧，缩放到 300x200
        execSync(
            `ffmpeg -i "${videoPath}" -ss 0 -vframes 1 -vf "scale=300:200:force_original_aspect_ratio=decrease,pad=300:200:(ow-iw)/2:(oh-ih)/2" "${thumbnailPath}" -y`,
            { stdio: 'ignore' }
        );
        console.log(`✅ ${videoFile} → ${thumbnailName}`);
        successCount++;
    } catch (error) {
        console.error(`❌ ${videoFile} 失败: ${error.message}`);
        failCount++;
    }
});

console.log(`\n📊 完成：${successCount} 成功，${failCount} 失败`);

if (successCount > 0) {
    console.log(`\n✨ 缩略图已保存到 thumbnails/ 目录`);
}
