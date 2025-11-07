const fs = require('fs');

// 读取现有数据
const data = JSON.parse(fs.readFileSync('data/contents.json', 'utf-8'));
const existingUrls = data.items.map(item => item.url.trim()).filter(url => url);

console.log('📊 用户现有案例总数:', data.items.length);
console.log('   其中有URL的:', existingUrls.length);
console.log('');

// Nano Banana的110个案例URL
const nanoBananaUrls = [
    'https://x.com/ZHO_ZHO_ZHO/status/1958539464994959715',
    'https://x.com/tokumin/status/1960583251460022626',
    'https://x.com/bilawalsidhu/status/1960529167742853378',
    'https://x.com/Zieeett/status/1960420874806247762',
    'https://x.com/AmirMushich/status/1960810850224091439',
    'https://x.com/MrDavids1/status/1960783672665128970',
    'https://x.com/op7418/status/1960528616573558864',
    'https://x.com/op7418/status/1960536717242573181',
    'https://x.com/op7418/status/1960896630586310656',
    'https://x.com/op7418/status/1960385812132192509',
    'https://x.com/ZHO_ZHO_ZHO/status/1960946893971706306',
    'https://x.com/ZHO_ZHO_ZHO/status/1960669234276753542',
    'https://x.com/ZHO_ZHO_ZHO/status/1960652077891510752',
    'https://weibo.com/5648162302/5204549851155423',
    'https://x.com/balconychy/status/1960665038504779923',
    'https://x.com/berryxia_ai/status/1960708465586004305',
    'https://x.com/umesh_ai/status/1960370946562564353',
    'https://x.com/Gdgtify/status/1960907695348691075',
    'https://www.xiaohongshu.com/explore/68ade0e7000000001d036677',
    'https://x.com/GeminiApp/status/1960347483021959197',
    'https://medium.com/@302.AI/google-nano-banana-vs-qwen-gpt-flux-topping-the-image-editing-leaderboard-96038b01bdcd',
    'https://x.com/skirano/status/1960343968320737397',
    'https://x.com/Error_HTTP_404/status/1960405116701303294',
    'https://x.com/GeminiApp/status/1960347483021959197',
    'https://x.com/arrakis_ai/status/1955901155726516652',
    'https://x.com/ZHO_ZHO_ZHO/status/1961024423596872184',
    'https://x.com/AiMachete/status/1963038793705128219',
    'https://x.com/icreatelife/status/1962998951948517428',
    'https://x.com/AiMachete/status/1962356993550643355',
    'https://x.com/icreatelife/status/1962724040205803773',
    'https://x.com/icreatelife/status/1961977580849873169',
    'https://x.com/icreatelife/status/1961653618529935720',
    'https://x.com/demishassabis/status/1961077016830083103',
    'https://x.com/ZHO_ZHO_ZHO/status/1963156830458085674',
    'https://x.com/ZHO_ZHO_ZHO/status/1961772524611768452',
    'https://x.com/ZHO_ZHO_ZHO/status/1962778069242126824',
    'https://x.com/ZHO_ZHO_ZHO/status/1962784384693739621',
    'https://x.com/techhalla/status/1962292272227102941',
    'https://x.com/umesh_ai/status/1961110485543371145',
    'https://x.com/tapehead_Lab/status/1960878455299694639',
    'https://x.com/ZHO_ZHO_ZHO/status/1962763864875167971',
    'https://x.com/ZHO_ZHO_ZHO/status/1962520937011855793',
    'https://x.com/ZHO_ZHO_ZHO/status/1961802767493939632',
    'https://x.com/ZHO_ZHO_ZHO/status/1961779457372602725',
    'https://x.com/ZHO_ZHO_ZHO/status/1961395526198595771',
    'https://x.com/ZHO_ZHO_ZHO/status/1961412823340265509',
    'https://x.com/AIimagined/status/1961431851245211958',
    'https://x.com/icreatelife/status/1963646757222715516',
    'https://x.com/nglprz/status/1961494974555394068',
    'https://x.com/bwabbage/status/1962903212937130450',
    'https://x.com/levelsio/status/1961595333034598487',
    'https://x.com/tetumemo/status/1962480699904282861',
    'https://x.com/azed_ai/status/1962878353784066342',
    'https://x.com/riddi0908/status/1963758463135412699',
    'https://x.com/riddi0908/status/1963422536819249239',
    'https://x.com/namaedousiyoka/status/1962461786181161340',
    'https://x.com/nobisiro_2023/status/1961231347986698371',
    'https://x.com/tetumemo/status/1964574226155000312',
    'https://x.com/tetumemo/status/1964860047705743700',
    'https://x.com/ZHO_ZHO_ZHO/status/1964995347505352794',
    'https://x.com/op7418/status/1961329148271513695',
    'https://x.com/hckinz/status/1962803203063586895',
    'https://x.com/songguoxiansen/status/1963602241610551609',
    'https://x.com/Gdgtify/status/1964979522370928319',
    'https://x.com/Gdgtify/status/1964679042994442454',
    'https://x.com/fofrAI/status/1964818395381248397',
    'https://x.com/Gdgtify/status/1964419331342909777',
    'https://x.com/0xFramer/status/1964992117324886349',
    'https://x.com/UNIBRACITY/status/1966122746288681461',
    'https://x.com/songguoxiansen/status/1965960484684968234',
    'https://x.com/lehua555/status/1966124995949863310',
    'https://x.com/tetumemo/status/1965721026849018141',
    'https://x.com/bind_lux/status/1965869157125402654',
    'https://x.com/op7418/status/1960540798573011209',
    'https://x.com/techhalla/status/1962088250199163285',
    'https://x.com/op7418/status/1961811274683310110',
    'https://x.com/vista8/status/1966164427243458977',
    'https://x.com/googlejapan/status/1965762180688584916',
    'https://x.com/NanoBanana_labs/status/1965827209534517654',
    'https://x.com/old_pgmrs_will/status/1966053092371444029',
    'https://x.com/AI_Kei75/status/1966053092371444029',
    'https://x.com/tokyo_Valentine/status/1966888938838298727',
    'https://x.com/tokyo_Valentine/status/1967174466636792287',
    'https://x.com/hAru_mAki_ch/status/1966877088365113722',
    'https://x.com/UNIBRACITY/status/1967129632093991164',
    'https://x.com/ImperfectEngel/status/1961833518163481001',
    'https://x.com/ZHO_ZHO_ZHO/status/1965816445008548213',
    'https://x.com/NanoBanana_labs/status/1967191346017673334',
    'https://x.com/NanoBanana_labs/status/1966791308321910922',
    'https://x.com/AI_Kei75/status/1967490141578236329',
    'https://x.com/AI_Kei75/status/1967498630467625127',
    'https://x.com/tokyo_Valentine/status/1968509703018922082',
    'https://x.com/Arminn_Ai/status/1968375201739177984',
    'https://x.com/tokyo_Valentine/status/1968419694920028552',
    'https://x.com/AI_Kei75/status/1968188091237372043',
    'https://x.com/AI_Kei75/status/1968181164243562665',
    'https://x.com/ZHO_ZHO_ZHO/status/1967915300063695300',
    'https://x.com/aiehon_aya/status/1967915300063695300',
    'https://x.com/icreatelife/status/1968020098515636635',
    'https://x.com/icreatelife/status/1967759082544332817',
    'https://x.com/emakiscroll/status/1970322227729191013',
    'https://x.com/IqraSaifiii/status/1969868863522423034',
    'https://x.com/googlejapan/status/1969733348852433316',
    'https://x.com/aziz4ai/status/1969868863522423034',
    'https://x.com/AI_Kei75/status/1969358521356742756',
    'https://x.com/nobisiro_2023/status/1968677481486914022',
    'https://x.com/AI_Kei75/status/1968607362576708042',
    'https://x.com/emakiscroll/status/1969959850676253016',
    'https://x.com/samann_ai/status/1969743981157265867',
    'https://x.com/NanoBanana_labs/status/1969824645743587519'
];

const nanoBananaTitles = [
    '插画变手办', '根据地图箭头生成地面视角图片', '真实世界的AR信息化', '分离出3D建筑/制作等距模型',
    '不同时代自己的照片', '多参考图像生成', '自动修图', '手绘图控制多角色姿态',
    '跨视角图像生成', '定制人物贴纸', '动漫转真人Coser', '生成角色设定',
    '色卡线稿上色', '文章信息图', '更换多种发型', '模型标注讲解图',
    '定制大理石雕塑', '根据食材做菜', '数学题推理', '旧照片上色',
    'OOTD穿搭', '人物换衣', '多视图结果生成', '电影分镜',
    '人物姿势修改', '线稿图生成图像', '为图像添加水印', '知识推理生成图像',
    '红笔批注', '爆炸的食物', '制作漫画书', '动作人偶',
    '地图生成等距建筑', '参考图控制人物表情', '插画绘画过程四格', '虚拟试妆',
    '妆面分析', 'Google地图视角下的中土世界', '印刷插画生成', '超多人物姿势生成',
    '物品包装生成', '叠加滤镜/材质', '控制人物脸型', '光影控制',
    '乐高玩具小人', '高达模型小人', '硬件拆解图', '食物卡路里标注',
    '提取信息并放置透明图层', '图像外扩修复', '古老地图生成古代场景', '时尚服装拼贴画',
    '精致可爱的产品照片', '动漫雕像放入现实', '痛车制作', '漫画构图',
    '漫画风格转换', '等距全息投影图', 'Minecraft风格场景生成', '材质球赋予材质',
    '平面图3D渲染', '重置相机参数', '制作证件照', '场景A6折叠卡',
    '设计国际象棋', '分割对照样式照片', '珠宝首饰设计', '周边设计',
    '模型全息投影', '巨型人物脚手架', '遥感影像建筑物提取', '部件提取',
    '移除汉堡的配料', '图像高清修复', '图片生成微缩场景', '科普漫画',
    '自定义人物的表情包生成', '恢复被吃了部分的食物', '格斗游戏界面制作', '切割模型',
    '海盗通缉书', '周边展示货架', '漫展展台', '线稿转涂鸦画',
    '现代美术展览空间', '暗黑哥特塔罗牌', '黑白进化图', '玻璃瓶纪念品',
    '微型商店', '成为Vtuber', '车站电影海报', '电影休息室',
    '切割带有卡通爆炸效果的物体', '卡通人物主题火车', '自定义主题公园', '创建星座图',
    '图片变手机壁纸', '制作电影海报', '将X账户变成软盘', '将参考图像变为透明物体',
    '鱼眼镜头视角图像', '超级英雄室内设计', '自定义娃娃机', '字体logo设计',
    '游戏角色状态界面', '文字转象形图', '数位板上的绘画', '创建Line印章图片',
    '对童年的自己治疗', 'PIXAR风格图片'
];

// 检查重复
const duplicates = [];
const newCases = [];

nanoBananaUrls.forEach((url, index) => {
    if (existingUrls.includes(url)) {
        duplicates.push({ index: index + 1, title: nanoBananaTitles[index], url });
    } else {
        newCases.push({ index: index + 1, title: nanoBananaTitles[index], url });
    }
});

console.log('🔴 重复的URL (' + duplicates.length + '个):');
duplicates.forEach(item => {
    console.log(`  ${item.index}. ${item.title}`);
    console.log(`     ${item.url}`);
});

console.log('');
console.log('✅ 新的案例 (' + newCases.length + '个):');
newCases.slice(0, 10).forEach(item => {
    console.log(`  ${item.index}. ${item.title}`);
});
if (newCases.length > 10) {
    console.log(`  ... 还有 ${newCases.length - 10} 个`);
}

console.log('');
console.log('📈 最终统计:');
console.log(`  - 现有案例: ${data.items.length}个`);
console.log(`  - Nano Banana案例: ${nanoBananaUrls.length}个`);
console.log(`  - URL重复: ${duplicates.length}个`);
console.log(`  - 可导入新案例: ${newCases.length}个`);
console.log(`  - 导入后总数: ${data.items.length + newCases.length}个`);
