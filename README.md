# 📚 X 推文收藏助手

> 一键采集 X(Twitter) 推文，支持图片/视频自动下载，AI 智能分类，现代化界面展示

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue.svg)](https://developer.chrome.com/docs/extensions/)

## ✨ 特性

- 🎬 **完整媒体支持** - 自动下载推文图片和视频（支持 MP4 和 M3U8 格式）
- 🤖 **智能内容处理** - AI 自动生成摘要、中英文分离、标签智能推荐
- 🎨 **现代化界面** - 深色主题、玻璃态设计、流畅动画
- 🔍 **强大搜索** - 全文搜索、标签筛选、快速定位
- 📋 **便捷复制** - 一键复制中英文内容，带视觉反馈
- 🌐 **浏览器扩展** - Chrome 扩展一键采集，无需手动操作
- 🔧 **诊断工具** - 完善的日志系统和诊断脚本

## 🖼️ 界面预览

### 主界面 - 内容列表
现代化深色主题，玻璃态卡片设计，支持搜索和标签筛选

### 详情页面
展示完整内容，支持中英文对照，图片视频预览

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Google Chrome 浏览器

### 安装步骤

1. **克隆仓库**
```bash
git clone https://github.com/ystv9527/X.git
cd X
```

2. **安装依赖**
```bash
npm install
```

3. **配置文件**（可选）
```bash
cp config.example.json config.json
# 编辑 config.json 配置代理等选项
```

4. **启动服务器**
```bash
npm start
# 或使用批处理文件
启动服务器.bat
```

5. **访问界面**
打开浏览器访问：http://localhost:3000

### 安装浏览器扩展

1. 打开 Chrome 浏览器，进入 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目中的 `extension` 文件夹
5. 扩展安装完成！

详细说明请查看：[extension/安装说明.md](extension/安装说明.md)

## 📖 使用指南

### 采集推文

1. **访问 X.com** - 浏览你想要采集的推文
2. **点击采集按钮** - 推文下方会出现蓝色"📚 采集"按钮
3. **自动处理** - 系统自动下载图片/视频，提取内容
4. **编辑保存** - 在弹出的编辑页面确认信息后保存

### 查看内容

1. **访问主页** - http://localhost:3000
2. **搜索筛选** - 使用搜索框或标签筛选
3. **查看详情** - 点击卡片查看完整内容
4. **复制内容** - 使用复制按钮快速复制文本

### 管理内容

- **编辑内容** - 修改 `content/collection.md` 文件
- **重新生成** - 运行 `npm run generate` 更新数据
- **诊断问题** - 运行 `node diagnose.js` 检查系统状态

## 🛠️ 技术栈

### 后端
- **Node.js** - 服务器运行环境
- **原生 HTTP 模块** - 轻量级服务器
- **ffmpeg** - M3U8 视频格式转换（可选）

### 前端
- **原生 JavaScript** - 无框架依赖
- **现代 CSS** - 玻璃态设计、渐变动画
- **Chrome Extension API** - 浏览器扩展

### AI 集成
- **Claude API** - 智能摘要生成
- **内容分析** - 中英文分离、标签推荐

## 📁 项目结构

```
X/
├── extension/              # Chrome 浏览器扩展
│   ├── content.js         # 内容脚本（注入到 X.com）
│   ├── injected.js        # 页面脚本（拦截 API）
│   ├── popup.js           # 扩展弹出窗口
│   └── manifest.json      # 扩展配置文件
├── assets/                # 前端资源
│   ├── app.js            # 主应用逻辑
│   └── style.css         # 样式文件
├── scripts/              # 脚本工具
│   └── generate-dataset.js  # 生成 JSON 数据
├── content/              # 内容存储
│   └── collection.md     # Markdown 格式的推文数据
├── data/                 # 生成的数据
│   └── contents.json     # JSON 格式数据
├── images/               # 下载的图片（不上传 Git）
├── videos/               # 下载的视频（不上传 Git）
├── server.js             # Node.js 服务器
├── add-auto.html         # 自动填充编辑页面
├── index.html            # 主页面
├── diagnose.js           # 诊断工具
├── fix-videos.js         # 视频标签修复工具
└── package.json          # 项目配置
```

## 🔧 高级功能

### 代理配置

如果需要使用代理下载视频，在 `config.json` 中配置：

```json
{
  "proxy": {
    "host": "127.0.0.1",
    "port": 7890
  }
}
```

### M3U8 视频支持

系统支持两种视频格式：
- **MP4 直链** - 直接下载
- **M3U8 流媒体** - 自动处理分片并合并

详细说明：[M3U8视频支持说明.md](M3U8视频支持说明.md)

### 诊断工具

运行诊断脚本检查系统状态：

```bash
node diagnose.js
```

输出示例：
```
🔍 开始诊断视频采集系统...
📁 视频文件: 15 个
📝 Markdown 文件: 视频标签数: 15
📊 JSON 数据: 有视频的条目: 15
✅ 一切正常！
```

## 🐛 常见问题

### 视频不显示？

1. 运行诊断：`node diagnose.js`
2. 检查视频文件是否存在于 `videos/` 目录
3. 重新生成数据：`npm run generate`
4. 查看详细排查步骤：[测试视频采集.md](测试视频采集.md)

### 扩展无法采集？

1. 确保服务器已启动（http://localhost:3000）
2. 重新加载扩展
3. 检查扩展控制台是否有错误
4. 查看：[extension/安装说明.md](extension/安装说明.md)

### 如何修复丢失的视频标签？

运行修复脚本：
```bash
node fix-videos.js
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 开发计划

- [ ] 编辑已采集内容功能
- [ ] 删除内容功能
- [ ] 批量操作
- [ ] 导出为 Markdown/JSON
- [ ] 深色/浅色主题切换
- [ ] 更多 AI 功能（翻译、摘要优化）

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- 感谢 [Claude AI](https://claude.ai) 提供智能内容分析
- 感谢所有贡献者和使用者

## 📧 联系方式

- GitHub: [@ystv9527](https://github.com/ystv9527)
- 项目主页: https://github.com/ystv9527/X

---

⭐ 如果这个项目对你有帮助，请给个 Star！
