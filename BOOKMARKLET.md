# 📖 书签工具使用指南

## 🎯 一键采集X内容到收藏库

通过浏览器书签，在X上看到好内容时一键采集！

---

## 🚀 快速开始（3步搞定）

### 第一步：启动服务器

打开命令行，运行：

```bash
cd E:\gitpromts
npm run server
```

看到这个提示说明启动成功：
```
🚀 书签采集服务器已启动！

   访问地址: http://localhost:3000
   API地址: http://localhost:3000/api/add-content
   添加页面: http://localhost:3000/add.html

💡 现在可以使用书签工具采集X内容了！
```

**⚠️ 重要：服务器必须保持运行状态！**

---

### 第二步：创建书签

#### 方法A：手动创建（推荐）

1. **打开书签管理器**
   - Chrome: `Ctrl + Shift + O` 或点击右上角三个点 → 书签 → 书签管理器
   - Edge: `Ctrl + Shift + O`
   - Firefox: `Ctrl + Shift + B`

2. **右键点击书签栏 → 添加新书签**

3. **填写书签信息：**
   - **名称**: `📚 收藏到库`
   - **网址**: 复制下面的完整代码（一整行）

```javascript
javascript:(function(){if(!window.location.hostname.includes('twitter.com')&&!window.location.hostname.includes('x.com')){alert('⚠️ 请在X(Twitter)推文页面使用此书签！');return;}try{let tweetText='';let author='';let url=window.location.href;const textSelectors=['[data-testid="tweetText"]','article [lang]','[role="article"] [lang]'];for(let selector of textSelectors){const element=document.querySelector(selector);if(element&&element.textContent){tweetText=element.textContent.trim();break;}}const authorElement=document.querySelector('[data-testid="User-Name"] span')||document.querySelector('article a[role="link"] span');if(authorElement){author=authorElement.textContent.trim();}if(!tweetText){tweetText=document.title;}const data={title:tweetText.substring(0,100)+(tweetText.length>100?'...':''),source:'X / '+(author||'@unknown'),url:url,content:tweetText,tags:'X, Twitter',date:new Date().toISOString().split('T')[0]};const params=new URLSearchParams(data);const addUrl='http://localhost:3000/add.html?'+params.toString();window.open(addUrl,'_blank','width=800,height=900');}catch(error){alert('❌ 提取失败：'+error.message+'\n\n请确保：\n1. 在推文详情页使用\n2. 页面已完全加载\n3. 本地服务器正在运行');console.error('Bookmarklet error:',error);}})();
```

4. **保存书签**

#### 方法B：快速创建

1. 将下面这个链接拖到书签栏：

<a href="javascript:(function(){if(!window.location.hostname.includes('twitter.com')&&!window.location.hostname.includes('x.com')){alert('⚠️ 请在X(Twitter)推文页面使用此书签！');return;}try{let tweetText='';let author='';let url=window.location.href;const textSelectors=['[data-testid=\"tweetText\"]','article [lang]','[role=\"article\"] [lang]'];for(let selector of textSelectors){const element=document.querySelector(selector);if(element&&element.textContent){tweetText=element.textContent.trim();break;}}const authorElement=document.querySelector('[data-testid=\"User-Name\"] span')||document.querySelector('article a[role=\"link\"] span');if(authorElement){author=authorElement.textContent.trim();}if(!tweetText){tweetText=document.title;}const data={title:tweetText.substring(0,100)+(tweetText.length>100?'...':''),source:'X / '+(author||'@unknown'),url:url,content:tweetText,tags:'X, Twitter',date:new Date().toISOString().split('T')[0]};const params=new URLSearchParams(data);const addUrl='http://localhost:3000/add.html?'+params.toString();window.open(addUrl,'_blank','width=800,height=900');}catch(error){alert('❌ 提取失败：'+error.message+'\n\n请确保：\n1. 在推文详情页使用\n2. 页面已完全加载\n3. 本地服务器正在运行');console.error('Bookmarklet error:',error);}})();">📚 收藏到库</a>

（在浏览器中打开这个README，将上面的链接拖到书签栏）

---

### 第三步：使用书签采集

1. **在X上找到想要收藏的推文**
   - 打开推文详情页（点进单条推文）

2. **点击书签栏的「📚 收藏到库」**

3. **自动弹出表单**
   - 内容已自动提取
   - 标题、来源、链接、内容都已填好
   - 你可以编辑任何字段
   - 添加标签、收藏理由、摘要等

4. **点击「💾 保存到收藏库」**

5. **成功提示**
   - 看到绿色提示：✅ 内容已保存！
   - 窗口会自动关闭

6. **更新数据**
   ```bash
   npm run generate
   ```

7. **刷新浏览器查看新内容**
   - 访问 `http://localhost:3000`

---

## 🎬 完整工作流程

```
在X上看到好内容
    ↓
点击书签「📚 收藏到库」
    ↓
自动提取内容并打开表单
    ↓
确认/编辑信息
    ↓
点击「保存」
    ↓
运行 npm run generate
    ↓
刷新浏览器查看
```

---

## 💡 使用技巧

### 1. 快捷键
- **在X页面**: 直接按书签快捷键（如果设置了）
- **或者**: 点击书签栏的书签按钮

### 2. 批量采集
```bash
# 保持服务器运行
npm run server

# 然后在X上连续点击多个推文的书签
# 每个都会打开新窗口
# 确认保存即可

# 全部完成后，统一生成数据
npm run generate
```

### 3. 标签管理
推荐标签格式：
```
AI, ChatGPT, 教程
编程, Python, 技巧
设计, UI/UX, 案例
```

### 4. 内容整理
在表单中可以：
- ✅ 修改标题（提取的可能太长）
- ✅ 添加摘要（一句话概括）
- ✅ 设置标签（方便筛选）
- ✅ 写收藏理由（为什么保存）

---

## 🔧 常见问题

### Q1: 点击书签没反应？
**解决方案：**
- 确保服务器正在运行（`npm run server`）
- 刷新X页面重试
- 检查是否在推文详情页

### Q2: 提取的内容不对？
**解决方案：**
- 在表单中手动编辑
- 确保推文页面完全加载后再点击书签
- 尝试刷新页面重试

### Q3: 保存失败？
**解决方案：**
- 检查命令行，确认服务器正在运行
- 查看服务器日志是否有错误
- 确认 `E:\gitpromts\content\collection.md` 文件存在

### Q4: 如何停止服务器？
在命令行窗口按 `Ctrl + C`

### Q5: 端口被占用？
修改 `server.js` 第15行：
```javascript
const PORT = 3001; // 改成其他端口
```

然后书签代码中的3000也要相应修改

---

## 📊 命令速查表

```bash
# 启动服务器（必须）
npm run server

# 生成数据（每次采集后）
npm run generate

# 查看内容
# 浏览器访问 http://localhost:3000

# 停止服务器
Ctrl + C
```

---

## 🎯 高级技巧

### 自定义提取逻辑
编辑 `bookmarklet.js`，修改提取选择器

### 修改默认标签
在 `bookmarklet.js` 第45行修改：
```javascript
tags: 'X, Twitter, 你的标签',
```

### 添加更多字段
1. 在 `bookmarklet.js` 的 `data` 对象添加字段
2. 在 `add.html` 添加对应的表单字段
3. 在 `server.js` 的 `generateMarkdown` 函数处理字段

---

## 🚀 下一步升级

准备好后，可以升级到：
- ✨ Chrome扩展（更好的体验）
- 🤖 GitHub Actions（全自动）
- 📱 移动端支持

---

## 💬 反馈与建议

使用过程中遇到问题？随时反馈！

**祝你收藏愉快！** 📚✨
