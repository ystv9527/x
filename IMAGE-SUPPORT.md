# 🖼️ 图片采集功能使用指南

## 🎉 新功能

书签工具现在支持自动提取和下载X推文中的图片！

---

## 🚀 快速开始

### 1. 重启服务器

```bash
cd E:\gitpromts
# 先停止旧服务器 (Ctrl+C)
npm run server
```

### 2. 更新书签

复制下面的新书签代码（**支持图片提取**）：

```javascript
javascript:(function(){if(!window.location.hostname.includes('twitter.com')&&!window.location.hostname.includes('x.com')){alert('⚠️ 请在X(Twitter)推文页面使用此书签！');return;}try{let tweetText='';let author='';let url=window.location.href;let images=[];const textSelectors=['[data-testid="tweetText"]','article [lang]','[role="article"] [lang]'];for(let selector of textSelectors){const element=document.querySelector(selector);if(element&&element.textContent){tweetText=element.textContent.trim();break;}}const authorElement=document.querySelector('[data-testid="User-Name"] span')||document.querySelector('article a[role="link"] span');if(authorElement){author=authorElement.textContent.trim();}const imageSelectors=['article img[src*="media"]','[data-testid="tweetPhoto"] img','div[data-testid="tweetPhoto"] img','article div[role="link"] img'];for(let selector of imageSelectors){const imgs=document.querySelectorAll(selector);imgs.forEach(img=>{let src=img.src;if(src.includes('?')){src=src.split('?')[0]+'?format=jpg&name=large';}if(src&&!images.includes(src)&&src.includes('pbs.twimg.com')){images.push(src);}});if(images.length>0)break;}if(!tweetText){tweetText=document.title;}const data={title:tweetText.substring(0,100)+(tweetText.length>100?'...':''),source:'X / '+(author||'@unknown'),url:url,content:tweetText,tags:'X, Twitter',date:new Date().toISOString().split('T')[0],images:images.join('|||')};const params=new URLSearchParams(data);const addUrl='http://localhost:3000/add.html?'+params.toString();window.open(addUrl,'_blank','width=900,height=1000');}catch(error){alert('❌ 提取失败：'+error.message+'\n\n请确保：\n1. 在推文详情页使用\n2. 页面已完全加载\n3. 本地服务器正在运行');console.error('Bookmarklet error:',error);}})();
```

在书签管理器中编辑「📚 收藏到库」书签，替换网址。

---

## 📖 使用流程

### 完整流程：

```
1. 在X上找到有图片的推文
   ↓
2. 点击书签「📚 收藏到库」
   ↓
3. 自动打开表单，显示图片预览
   ↓
4. 点击「📥 下载」或「📥 下载全部图片」
   ↓
5. 图片下载到默认下载文件夹
   ↓
6. 将图片移动到 E:\gitpromts\images\
   ↓
7. 记住图片文件名（例如：x-image-xxx-1.jpg）
   ↓
8. 填写表单，点击「保存」
   ↓
9. 运行 npm run generate
   ↓
10. 刷新浏览器查看（图片也会显示！）
```

---

## 🎯 新功能说明

### 1. 自动提取图片

书签会自动从推文中提取所有图片的URL（最高质量版本）

### 2. 图片预览

在添加表单中会显示所有图片的缩略图

### 3. 一键下载

- **单张下载**：点击每张图片下的「📥 下载」按钮
- **批量下载**：点击「📥 下载全部图片」一次性下载所有图片

### 4. 图片命名

下载的图片会自动命名为：`x-image-时间戳-序号.jpg`

例如：`x-image-1730707234567-1.jpg`

### 5. 图片保存

下载后，将图片文件：
1. 从默认下载文件夹
2. 移动到 `E:\gitpromts\images\` 目录
3. 可以重命名为更有意义的名字（例如：`fashion-photo-001.jpg`）

### 6. Markdown引用

在保存内容时，如果你下载了图片，系统会在Markdown中添加图片引用。

---

## 💡 使用技巧

### 技巧1：批量下载

如果推文有多张图片，点击「📥 下载全部图片」，所有图片会自动连续下载。

### 技巧2：图片管理

建议在 `images/` 目录下按主题创建子文件夹：
```
E:\gitpromts\images\
├── fashion/        # 时尚相关
├── ai-art/         # AI艺术
├── tutorials/      # 教程截图
└── misc/           # 其他
```

### 技巧3：不下载也能保存

如果暂时不想下载图片，直接保存也可以。系统会将图片URL保存为注释，以后可以手动下载。

### 技巧4：图片文件名

下载后可以重命名图片为更有意义的名字，但要记得：
- 文件名中保留图片序号（-1, -2等）
- 使用英文和数字
- 避免特殊字符

---

## 🔧 故障排除

### Q: 看不到图片预览？

**原因**：推文中可能没有图片，或提取失败

**解决**：
1. 确保在有图片的推文详情页使用
2. 等页面完全加载后再点击书签
3. 检查浏览器控制台是否有错误

### Q: 图片下载失败？

**解决方案**：
1. 右键图片 → 另存为
2. 或复制图片URL，用浏览器直接下载
3. 检查网络连接

### Q: 图片不显示在收藏库？

**原因**：图片文件没有放在正确位置

**解决**：
1. 确认图片在 `E:\gitpromts\images\` 目录
2. 检查Markdown中的图片路径是否正确
3. 重新运行 `npm run generate`

---

## 📊 示例

### 采集带图片的推文

**采集前：**
```
X推文：一张漂亮的AI生成图片
[图片1] [图片2]
```

**点击书签后：**
```
添加表单打开
🖼️ 推文图片 (2张)
[预览图1] [预览图2]
```

**下载图片：**
```
下载到: C:\Users\你的用户名\Downloads\
- x-image-1730707234567-1.jpg
- x-image-1730707234567-2.jpg
```

**移动图片：**
```
移动到: E:\gitpromts\images\
重命名为:
- ai-art-001.jpg
- ai-art-002.jpg
```

**生成后的Markdown：**
```markdown
## 标题：AI生成的艺术作品
- **来源**: X / @artist
- **链接**: https://x.com/...
- **分类**: AI, 艺术, X

### 完整内容
一张漂亮的AI生成图片...

### 相关图片
![图片 1](../images/ai-art-001.jpg)
![图片 2](../images/ai-art-002.jpg)
```

---

## 🎯 完整工作流

```bash
# 1. 启动服务器
npm run server

# 2. 在X上点击书签采集（包含图片）

# 3. 下载图片到本地

# 4. 移动图片到 images/ 目录

# 5. 生成数据
npm run generate

# 6. 查看效果
# 浏览器访问 http://localhost:3000
```

---

## 🆕 新旧对比

### 旧版书签

- ✅ 提取文字内容
- ❌ 不支持图片

### 新版书签V2

- ✅ 提取文字内容
- ✅ 自动提取图片URL
- ✅ 图片预览
- ✅ 一键下载
- ✅ Markdown自动引用

---

## 📝 下一步

1. 重启服务器
2. 更新书签代码
3. 找一条有图片的X推文测试
4. 体验新功能！

**祝你采集愉快！** 🖼️✨
