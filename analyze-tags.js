const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/contents.json', 'utf-8'));
const allTags = {};

data.items.forEach(item => {
    item.tags.forEach(tag => {
        allTags[tag] = (allTags[tag] || 0) + 1;
    });
});

const sorted = Object.entries(allTags).sort((a, b) => b[1] - a[1]);

console.log('📊 当前使用的所有标签统计:\n');
sorted.forEach(([tag, count]) => {
    console.log(`  ${tag}: ${count}个案例`);
});

console.log('\n📝 标签总数:', sorted.length);
console.log('💡 标签使用建议：');
console.log('   - 最常用的标签可以直接复用');
console.log('   - Nano Banana案例建议标签: 图片, Nano Banana, Gemini');
