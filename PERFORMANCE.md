# 🚀 性能优化指南

本文档说明如何优化网站加载速度和性能。

## ✅ 已完成的优化

### 1. HTML 优化
- ✅ 添加了完整的 Meta 标签和 Open Graph
- ✅ 脚本使用 `defer` 延迟加载
- ✅ 添加了 `preconnect` 和 `dns-prefetch` 预连接
- ✅ 添加了 JSON-LD 结构化数据

### 2. HTTP 头部优化（_headers 文件）
- ✅ 静态资源（CSS/JS）缓存 1 年
- ✅ JSON 数据缓存 1 小时
- ✅ HTML 页面缓存 5 分钟
- ✅ 字体文件缓存 1 年
- ✅ 安全头部（XSS、MIME、Frame 保护）

### 3. SEO 优化
- ✅ robots.txt 配置
- ✅ Meta description 和 keywords
- ✅ 规范化 URL（canonical）
- ✅ 社交媒体卡片（Twitter/OG）

---

## 📦 推荐的进一步优化

### 1. 资源压缩

#### 安装压缩工具
```bash
npm install --save-dev terser clean-css-cli
```

#### 添加压缩脚本到 package.json
在 `scripts` 中添加：
```json
"minify:css": "cleancss -o assets/style.min.css assets/style.css",
"minify:js": "terser assets/app.js -o assets/app.min.js -c -m",
"minify": "npm run minify:css && npm run minify:js",
"build:prod": "npm run generate && npm run minify"
```

然后在 index.html 中引用压缩版本：
```html
<link rel="stylesheet" href="assets/style.min.css">
<script src="assets/app.min.js" defer></script>
```

### 2. 图片优化

#### 社交媒体卡片图片
创建以下图片：
- `assets/og-image.jpg` - 1200x630px（Open Graph）
- `assets/twitter-card.jpg` - 1200x675px（Twitter）
- `favicon-32x32.png` - 32x32px
- `favicon-16x16.png` - 16x16px
- `apple-touch-icon.png` - 180x180px

#### 图片压缩工具
- TinyPNG: https://tinypng.com/
- Squoosh: https://squoosh.app/
- ImageOptim (Mac): https://imageoptim.com/

### 3. CDN 加速

如果使用了外部库，可以使用 CDN：
```html
<!-- 示例：使用 jsDelivr CDN -->
<script src="https://cdn.jsdelivr.net/npm/marked@latest/marked.min.js" defer></script>
```

### 4. 懒加载（Lazy Loading）

对于图片和内容，可以添加懒加载：
```javascript
// 图片懒加载
<img src="placeholder.jpg" data-src="real-image.jpg" loading="lazy">

// IntersectionObserver 懒加载内容
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
});
```

### 5. 使用 Gzip/Brotli 压缩

大多数现代托管平台（Netlify、Vercel、Cloudflare Pages）会自动启用，无需配置。

如果使用 Nginx，在配置中添加：
```nginx
gzip on;
gzip_vary on;
gzip_types text/plain text/css application/json application/javascript text/xml;
brotli on;
```

---

## 🎯 性能测试工具

使用以下工具测试网站性能：

1. **Google PageSpeed Insights**
   https://pagespeed.web.dev/

2. **GTmetrix**
   https://gtmetrix.com/

3. **WebPageTest**
   https://www.webpagetest.org/

4. **Chrome DevTools Lighthouse**
   浏览器 F12 → Lighthouse 标签

---

## 📊 性能目标

- ✅ First Contentful Paint (FCP) < 1.8s
- ✅ Largest Contentful Paint (LCP) < 2.5s
- ✅ Cumulative Layout Shift (CLS) < 0.1
- ✅ Time to Interactive (TTI) < 3.8s
- ✅ Total Blocking Time (TBT) < 200ms

---

## 🔍 监控

定期检查：
- Google Search Console（索引状态）
- Google Analytics（用户体验指标）
- Web Vitals 报告

---

*最后更新：2025-11-08*
