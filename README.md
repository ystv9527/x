# 📚 内容收藏库 - Content Collector

半自动化内容采集与整理系统，用于收集和管理来自X (Twitter)、技术博客和教程网站的优质内容。

## ✨ 特性

- 🚀 **半自动化采集**: 简化的命令行工具，快速添加内容
- 📝 **Markdown格式**: 易于编辑和版本管理的内容存储
- 🔍 **智能搜索**: 全文搜索，支持标题、内容、标签
- 🏷️ **标签筛选**: 按分类快速筛选内容
- 🎨 **精美界面**: 响应式Web界面，卡片式展示
- 📊 **数据导出**: 自动生成JSON数据集
- 💾 **版本管理**: Git支持，轻松同步到GitHub

## 📁 项目结构

```
E:/gitpromts/
├── content/              # 内容存储（Markdown格式）
│   ├── example.md       # 格式示例
│   └── collection.md    # 主内容文件
├── data/                # 生成的数据文件
│   └── contents.json    # JSON数据集
├── scripts/             # 工具脚本
│   ├── add-content.js   # 完整版添加工具
│   ├── quick-add.js     # 快速添加工具
│   └── generate-dataset.js  # 数据生成脚本
├── assets/              # 前端资源
│   ├── style.css        # 样式文件
│   └── app.js           # 前端逻辑
├── images/              # 图片资源
├── index.html           # 主页面
├── package.json         # 项目配置
├── .gitignore          # Git忽略规则
└── README.md           # 使用文档（本文件）
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd E:/gitpromts
npm install
```

### 2. 添加内容

#### 方式一：完整版添加工具（推荐新手）

```bash
npm run add
```

按照提示输入：
- 标题
- 来源（如 X / @username）
- 链接
- 标签（用逗号分隔）
- 收藏理由
- 内容摘要
- 关键要点
- 完整内容
- 图片（可选）

#### 方式二：快速添加（适合熟练用户）

```bash
node scripts/quick-add.js
```

只需输入标题、链接、标签和内容，更加快速。

#### 方式三：手动编辑

直接编辑 `content/collection.md` 文件，参考 `content/example.md` 的格式。

### 3. 生成数据集

添加内容后，运行以下命令生成JSON数据：

```bash
npm run generate
```

### 4. 查看内容

在浏览器中打开 `index.html` 文件，或使用本地服务器：

```bash
# 使用 Python
python -m http.server 8000

# 使用 Node.js (需要安装 http-server)
npx http-server
```

然后访问 `http://localhost:8000`

## 📝 内容格式说明

### Markdown格式

```markdown
## 标题：你的内容标题
- **来源**: X / @username
- **链接**: https://example.com
- **日期**: 2025-01-04
- **分类**: AI, 教程, 技巧
- **收藏理由**: 为什么收藏这篇内容

### 内容摘要
简短的内容摘要...

### 关键要点
- 要点1
- 要点2
- 要点3

### 完整内容
[完整的内容或笔记...]

### 相关图片
![描述](../images/image-name.jpg)

---
```

## 🔧 常用命令

```bash
# 添加内容（完整版）
npm run add

# 快速添加内容
node scripts/quick-add.js

# 生成JSON数据
npm run generate

# 构建（等同于生成数据）
npm run build
```

## 🌐 部署到GitHub Pages

1. 在GitHub创建新仓库

2. 添加远程仓库并推送

```bash
git remote add origin https://github.com/你的用户名/你的仓库名.git
git add .
git commit -m "Initial commit: Content collector setup"
git branch -M main
git push -u origin main
```

3. 在仓库设置中启用GitHub Pages
   - Settings > Pages
   - Source: Deploy from a branch
   - Branch: main / root
   - 保存

4. 访问你的网站
   - 地址：`https://你的用户名.github.io/你的仓库名/`

## 📊 工作流程

```
1. 发现好内容
   ↓
2. 运行添加脚本 (npm run add)
   ↓
3. 输入内容信息
   ↓
4. 生成数据集 (npm run generate)
   ↓
5. 提交到Git (git add . && git commit -m "Add new content")
   ↓
6. 推送到GitHub (git push)
   ↓
7. 自动部署到GitHub Pages
```

## 💡 使用技巧

### 高效采集

1. **准备模板**: 为常见来源准备固定的标签组合
2. **批量添加**: 一次性收集多个内容，然后批量添加
3. **定期整理**: 每周运行一次数据生成，保持数据最新

### 标签管理

- 使用一致的标签命名（如 `AI` 而非 `ai` 或 `人工智能`）
- 控制标签数量（建议每篇内容2-5个标签）
- 使用层级标签（如 `编程-Python-教程`）

### Git最佳实践

```bash
# 每次添加内容后提交
git add .
git commit -m "Add: [内容标题简述]"
git push

# 定期创建标签
git tag -a v1.0 -m "Version 1.0 - 100 articles"
git push --tags
```

## 🔍 搜索功能

Web界面支持以下搜索方式：

- **关键词搜索**: 搜索标题、摘要、内容、标签
- **标签筛选**: 点击标签按钮进行筛选
- **组合筛选**: 同时使用搜索和标签筛选
- **清除筛选**: 一键清除所有筛选条件

## 📦 扩展功能

### 添加更多来源

编辑 `scripts/add-content.js`，添加特定来源的模板。

### 自定义样式

编辑 `assets/style.css` 修改界面外观。

### 添加分类

在添加内容时使用有意义的标签，系统会自动生成标签筛选器。

### 图片管理

1. 将图片保存到 `images/` 目录
2. 在Markdown中使用相对路径引用：`![描述](../images/图片名.jpg)`

## 🐛 故障排除

### 问题：npm install 失败

解决方案：
```bash
# 清除缓存
npm cache clean --force
# 重新安装
npm install
```

### 问题：数据没有显示

解决方案：
1. 确认运行了 `npm run generate`
2. 检查 `data/contents.json` 是否存在
3. 使用浏览器开发者工具查看控制台错误

### 问题：中文乱码

解决方案：
- 确保所有文件使用UTF-8编码
- 在编辑器中设置默认编码为UTF-8

## 📄 许可证

MIT License - 自由使用和修改

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📞 支持

如有问题，请创建Issue或参考文档。

---

**开始收集你的第一篇内容吧！** 🎉

```bash
npm run add
```
