# ⚡ 书签工具快速开始（3分钟搞定）

## 步骤1：启动服务器
```bash
cd E:\gitpromts
npm run server
```

## 步骤2：创建书签

### 复制这段代码（完整的一行）：

```javascript
javascript:(function(){if(!window.location.hostname.includes('twitter.com')&&!window.location.hostname.includes('x.com')){alert('⚠️ 请在X(Twitter)推文页面使用此书签！');return;}try{let tweetText='';let author='';let url=window.location.href;const textSelectors=['[data-testid="tweetText"]','article [lang]','[role="article"] [lang]'];for(let selector of textSelectors){const element=document.querySelector(selector);if(element&&element.textContent){tweetText=element.textContent.trim();break;}}const authorElement=document.querySelector('[data-testid="User-Name"] span')||document.querySelector('article a[role="link"] span');if(authorElement){author=authorElement.textContent.trim();}if(!tweetText){tweetText=document.title;}const data={title:tweetText.substring(0,100)+(tweetText.length>100?'...':''),source:'X / '+(author||'@unknown'),url:url,content:tweetText,tags:'X, Twitter',date:new Date().toISOString().split('T')[0]};const params=new URLSearchParams(data);const addUrl='http://localhost:3000/add.html?'+params.toString();window.open(addUrl,'_blank','width=800,height=900');}catch(error){alert('❌ 提取失败：'+error.message+'\n\n请确保：\n1. 在推文详情页使用\n2. 页面已完全加载\n3. 本地服务器正在运行');console.error('Bookmarklet error:',error);}})();
```

### 添加到浏览器：

1. 按 `Ctrl + Shift + O` 打开书签管理器
2. 右键书签栏 → 添加新书签
3. 名称：`📚 收藏到库`
4. 网址：粘贴上面的代码
5. 保存

## 步骤3：使用

1. 在X上打开任意推文详情页
2. 点击书签栏的「📚 收藏到库」
3. 在弹出的表单中确认/编辑信息
4. 点击「保存」
5. 运行 `npm run generate` 生成数据
6. 刷新 `http://localhost:3000` 查看

---

## 📋 完整流程

```
启动服务器 → 在X上找好文 → 点击书签 → 确认保存 → 生成数据 → 查看效果
```

## 🎯 每次使用

```bash
# 1. 启动服务器
npm run server

# 2. 在X上点击书签采集内容

# 3. 生成数据
npm run generate

# 4. 浏览器访问 http://localhost:3000
```

---

**详细说明请查看: [BOOKMARKLET.md](./BOOKMARKLET.md)**
