const fs = require('fs');

const videos = fs.readdirSync('videos').filter(f => f.endsWith('.mp4'));
const md = fs.readFileSync('content/collection.md', 'utf-8');

console.log('📊 视频文件统计：');
console.log(`- 总视频文件数: ${videos.length}`);

let orphaned = [];
videos.forEach(v => {
  const match = v.match(/tweet-(\d+)-/);
  if (match) {
    const id = match[1];
    if (!md.includes('status/' + id)) {
      orphaned.push({ file: v, id: id });
    }
  }
});

if (orphaned.length > 0) {
  console.log(`\n⚠️  没有对应推文的视频文件 (${orphaned.length} 个):`);
  orphaned.forEach(item => {
    console.log(`   - ${item.file} (推文ID: ${item.id})`);
  });
} else {
  console.log('\n✅ 所有视频文件都有对应的推文');
}

console.log(`\n✅ 正常识别的视频: ${videos.length - orphaned.length} 个`);
