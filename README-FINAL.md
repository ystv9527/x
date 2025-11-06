# X 推文采集系统 - 使用指南

## ✅ 系统功能

- 一键采集 X (Twitter) 推文的文本、作者、链接
- 自动下载推文中的图片（通过代理）
- 保存到 Markdown 文件，方便查看和管理
- 生成 JSON 数据集

## 📋 使用步骤

### 1. 启动服务器（带代理）

**双击：** `Start-Server-With-Proxy.bat`

确保：
- Clash 正在运行（端口 7897）
- 服务器启动成功，显示 "Content Collector Server Started!"

### 2. 添加浏览器书签

**书签名称：** `X采集`

**书签网址：**
```javascript
javascript:(function(){let t='',a='',p=[],s=document.querySelector('[data-testid="tweetText"]');s&&(t=s.textContent.trim());let e=document.querySelector('[data-testid="User-Name"] span');e&&(a=e.textContent.trim());let mainTweet=document.querySelector('article[data-testid="tweet"]');if(mainTweet){let mediaImgs=mainTweet.querySelectorAll('img[src*="/media/"]');mediaImgs.forEach(x=>{let src=x.src;if(src&&!p.find(img=>img.includes(src.split('?')[0]))){try{let url=new URL(src);url.searchParams.set('name','large');src=url.toString()}catch(err){}p.push(src)}})}console.log('找到主推文图片:',p.length);let params=new URLSearchParams({title:t.substring(0,100),source:'X / '+a,url:location.href,content:t,tags:'X,Twitter',date:new Date().toISOString().split('T')[0],images:p.join('|')});window.open('http://localhost:3000/add-auto.html?'+params.toString(),'_blank','width=900,height=1000');})();
```

**添加方法：**
1. Chrome 中按 Ctrl+D
2. 名称：`X采集`
3. 网址：粘贴上面的代码（必须是一行）
4. 保存

### 3. 采集推文

1. 打开 X 推文详情页（例如：https://x.com/user/status/xxxxx）
2. 点击浏览器书签栏中的 "X采集" 书签
3. 新窗口自动打开，显示采集的内容
4. 图片自动下载（服务器通过代理下载）
5. 可选：编辑内容、添加收藏理由等
6. 点击 "💾 保存到收藏库"
7. 完成！

### 4. 查看采集的内容

**Markdown 文件：** `content/collection.md`
- 包含所有采集的推文
- 图片引用格式：`![图片 1](../images/tweet-xxx-1.jpg)`

**图片文件：** `images/`
- 所有下载的图片，命名格式：`tweet-{推文ID}-{序号}.jpg`

**数据集：** 双击 `Generate-Data.bat` 生成 `data/dataset.json`

## 📁 项目结构

```
E:\gitpromts\
├── content/
│   └── collection.md              # 所有采集的内容（Markdown）
├── images/                        # 下载的图片
│   └── tweet-xxxxx-1.jpg
├── data/
│   └── dataset.json              # 生成的 JSON 数据集
├── server.js                     # 服务器（处理采集和保存）
├── add-auto.html                 # 自动处理页面
├── bookmarklet-final-fixed.txt   # 书签源代码（查看用）
├── Start-Server-With-Proxy.bat   # 启动服务器（带代理）
├── Generate-Data.bat             # 生成 JSON 数据集
└── README-FINAL.md              # 本文档
```

## 🔧 技术细节

### 工作流程

```
1. 用户在 X 推文页面点击书签
2. 书签提取：文本、作者、URL、图片URL
3. 打开 add-auto.html，传递数据
4. add-auto.html 调用服务器 API 下载图片
5. 服务器通过代理从 X 下载图片
6. 用户点击保存
7. 服务器生成 Markdown 并保存
```

### 关键特性

- **只提取主推文图片：** 使用 `article[data-testid="tweet"]` 选择器
- **代理支持：** 服务器使用 `https-proxy-agent` 通过 Clash 代理访问 X
- **图片命名：** `tweet-{推文ID}-{序号}.jpg`，便于管理
- **Markdown 格式：** 方便在各种工具中查看和编辑

## ⚙️ 配置

### 修改代理端口

编辑 `Start-Server-With-Proxy.bat`：
```batch
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
```

改为你的代理端口（Clash 默认是 7897）

### 修改服务器端口

编辑 `server.js` 第 21 行：
```javascript
const PORT = 3000;
```

## ❓ 故障排除

### 问题：图片下载失败（ETIMEDOUT）

**原因：** 服务器无法访问 X 的图片服务器

**解决：**
1. 确保 Clash 正在运行
2. 使用 `Start-Server-With-Proxy.bat` 启动服务器
3. 检查代理端口是否正确（默认 7897）

### 问题：书签点击无反应

**原因：** 书签代码被换行或格式错误

**解决：**
1. 从 `bookmarklet-final-fixed.txt` 重新复制代码
2. 确保是一行完整代码，没有换行符
3. 或者在 X 页面按 F12，直接在控制台粘贴代码运行

### 问题：提取了太多图片

**原因：** 旧版书签提取了页面所有图片

**解决：**
- 使用最新版书签（本文档中的代码）
- 新版只提取 `article[data-testid="tweet"]` 内的图片

## 📊 使用统计

每次采集会保存：
- 推文文本（完整内容）
- 作者名称
- 推文链接
- 采集日期
- 标签（可编辑）
- 图片（自动下载）

## 🎉 完成！

现在你有一个完整的 X 推文采集系统了！

- ✅ 一键采集推文
- ✅ 自动下载图片
- ✅ 保存到 Markdown
- ✅ 生成 JSON 数据集

享受使用吧！
