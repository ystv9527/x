#!/usr/bin/env node
/**
 * 生成所有静态页面
 * 包括：首页、分类主页、标签页
 */

const fs = require('fs');
const path = require('path');

// 配置
const SITE_URL = 'https://gemnana.com';
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ASSETS_PATH = 'assets';

console.log('🚀 开始生成静态页面...\n');

/**
 * 读取所有数据
 */
function loadAllData() {
    const latestPath = path.join(DATA_DIR, 'latest.json');
    const archivePath = path.join(DATA_DIR, 'archive.json');

    let allItems = [];

    // 读取最新数据
    if (fs.existsSync(latestPath)) {
        const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
        allItems.push(...(latest.items || []));
    }

    // 读取历史数据
    if (fs.existsSync(archivePath)) {
        const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
        allItems.push(...(archive.items || []));
    }

    console.log(`📊 加载数据：共 ${allItems.length} 个案例`);
    return allItems;
}

/**
 * 按媒体类型分组
 */
function groupByMediaType(items) {
    const groups = {
        image: [],
        video: [],
        text: []
    };

    items.forEach(item => {
        // 优先根据实际内容判断媒体类型
        if (item.videos && item.videos.length > 0) {
            // 有视频内容 → 视频分类
            groups.video.push(item);
        } else if (item.images && item.images.length > 0) {
            // 有图片内容 → 图片分类
            groups.image.push(item);
        } else {
            // 纯文本内容 → 文字分类
            groups.text.push(item);
        }
    });

    console.log(`📸 图片案例：${groups.image.length} 个`);
    console.log(`🎬 视频案例：${groups.video.length} 个`);
    console.log(`💬 文字案例：${groups.text.length} 个\n`);

    return groups;
}

/**
 * 统计标签
 */
function getTagStats(items) {
    const tagCount = {};
    items.forEach(item => {
        if (item.tags) {
            item.tags.forEach(tag => {
                tagCount[tag] = (tagCount[tag] || 0) + 1;
            });
        }
    });
    return tagCount;
}

/**
 * 标签名转文件名
 */
function tagToFilename(tag) {
    return tag.replace(/\s+/g, '-').toLowerCase() + '.html';
}

/**
 * 生成标签HTML（可点击或不可点击）
 * @param {string} tag - 标签名
 * @param {string} basePath - 基础路径（如 '.' 或 '..'）
 * @param {object} tagStats - 标签统计（用于判断是否有标签页）
 * @param {string} mediaType - 媒体类型（'image', 'video', 'text'）
 */
function generateTagHtml(tag, basePath = '.', tagStats = {}, mediaType = 'image') {
    // 只有图片类型且案例数 >= 10 的标签才有专属页面
    const hasPage = mediaType === 'image' && tagStats[tag] >= 10;

    if (hasPage) {
        const filename = tagToFilename(tag);
        const href = `${basePath}/image/${filename}`;
        return `<a href="${href}" class="tag">${tag}</a>`;
    } else {
        return `<span class="tag">${tag}</span>`;
    }
}

/**
 * 生成案例卡片 HTML
 */
function generateCaseCard(item, basePath = '.') {
    const tags = item.tags ? item.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';

    // 缩略图：优先显示图片，其次显示视频，最后显示默认图标
    let thumbnail;
    if (item.images && item.images[0]) {
        thumbnail = `<img src="${basePath}/${item.images[0]}" alt="${item.title}" loading="lazy">`;
    } else if (item.videos && item.videos[0]) {
        thumbnail = `<video style="width:100%; height:100%; object-fit: cover;" muted playsinline webkit-playsinline autoplay loop preload="metadata">
            <source src="${basePath}/${item.videos[0]}" type="video/mp4">
            您的浏览器不支持视频播放
        </video>`;
    } else {
        thumbnail = `<div class="no-image">📸</div>`;
    }

    // HTML转义函数
    const escapeHtml = (text) => text ? text.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const summary = escapeHtml(item.summary);

    // 生成提示词预览（截取前200字符，SEO友好）
    let promptPreview = '';
    const hasChinese = item.contentChinese && item.contentChinese.trim();
    const hasEnglish = item.contentEnglish && item.contentEnglish.trim();
    const hasContent = item.content && item.content.trim();

    if (hasChinese || hasEnglish || hasContent) {
        let chinesePreview = '';
        let englishPreview = '';
        let contentPreview = '';

        if (hasChinese) {
            const text = item.contentChinese.substring(0, 200);
            const truncated = item.contentChinese.length > 200 ? '...' : '';
            chinesePreview = `<div class="prompt-section">
                <h4>🇨🇳 中文提示词</h4>
                <p>${escapeHtml(text)}${truncated}</p>
            </div>`;
        }

        if (hasEnglish) {
            const text = item.contentEnglish.substring(0, 200);
            const truncated = item.contentEnglish.length > 200 ? '...' : '';
            englishPreview = `<div class="prompt-section">
                <h4>🇬🇧 English Prompt</h4>
                <p>${escapeHtml(text)}${truncated}</p>
            </div>`;
        }

        if (!hasChinese && !hasEnglish && hasContent) {
            const text = item.content.substring(0, 200);
            const truncated = item.content.length > 200 ? '...' : '';
            contentPreview = `<div class="prompt-section">
                <h4>📝 提示词</h4>
                <p>${escapeHtml(text)}${truncated}</p>
            </div>`;
        }

        promptPreview = `
            <details class="prompt-preview">
                <summary>🎨 查看AI提示词</summary>
                <div class="prompt-content">
                    ${chinesePreview}
                    ${englishPreview}
                    ${contentPreview}
                    <button class="view-full-btn" onclick="event.stopPropagation(); document.querySelector('.case-card[data-id=\\"${item.id}\\"]').click();">查看完整内容</button>
                </div>
            </details>`;
    }

    return `
        <div class="case-card" data-id="${item.id}">
            <button class="delete-btn" data-id="${item.id}" title="删除这条内容" style="display:none;">🗑️</button>
            <div class="case-thumbnail">${thumbnail}</div>
            <div class="case-info">
                <h3 class="case-title">${item.caseNumber}: ${item.title}</h3>
                ${summary ? `<p class="case-summary">${summary}</p>` : ''}
                <div class="case-meta">
                    <span class="case-date">${item.date || ''}</span>
                    <span class="case-source">${item.source || ''}</span>
                </div>
                <div class="case-tags">${tags}</div>
                ${promptPreview}
            </div>
        </div>`;
}

/**
 * 生成侧边栏HTML
 */
function generateSidebar(currentPage = 'home', stats = {}) {
    return `
    <aside class="sidebar">
        <div class="sidebar-header">
            <h1 class="logo">📚 Gem Nana</h1>
            <p class="tagline">AI 提示词收藏库</p>
        </div>

        <nav class="sidebar-nav">
            <a href="${currentPage === 'home' ? '#' : '../index.html'}" class="nav-item ${currentPage === 'home' ? 'active' : ''}">
                <span class="nav-icon">🏠</span>
                <span class="nav-text">首页</span>
                <span class="nav-count">${stats.total || 0}</span>
            </a>
            <a href="${currentPage.startsWith('image') ? '#' : (currentPage === 'home' ? 'image/index.html' : '../image/index.html')}" class="nav-item ${currentPage.startsWith('image') ? 'active' : ''}">
                <span class="nav-icon">📸</span>
                <span class="nav-text">图片生成</span>
                <span class="nav-count">${stats.image || 0}</span>
            </a>
            <a href="${currentPage.startsWith('video') ? '#' : (currentPage === 'home' ? 'video/index.html' : '../video/index.html')}" class="nav-item ${currentPage.startsWith('video') ? 'active' : ''}">
                <span class="nav-icon">🎬</span>
                <span class="nav-text">视频生成</span>
                <span class="nav-count">${stats.video || 0}</span>
            </a>
            <a href="${currentPage.startsWith('text') ? '#' : (currentPage === 'home' ? 'text/index.html' : '../text/index.html')}" class="nav-item ${currentPage.startsWith('text') ? 'active' : ''}">
                <span class="nav-icon">💬</span>
                <span class="nav-text">文字提示词</span>
                <span class="nav-count">${stats.text || 0}</span>
            </a>
        </nav>

        <div class="sidebar-footer">
            <p>© 2025 Gem Nana</p>
        </div>
    </aside>`;
}

/**
 * 生成模态框HTML
 */
function generateModal() {
    return `
    <!-- 详情模态框 -->
    <div id="modal" class="modal">
        <div class="modal-content">
            <span class="modal-close">&times;</span>
            <div id="modalBody"></div>
        </div>
    </div>`;
}

/**
 * 生成页面内嵌脚本
 */
function generateInlineScript(items, dataPath = '', currentPage = 'home') {
    // 转义JSON数据
    const jsonData = JSON.stringify(items).replace(/</g, '\\u003c');

    return `
    <script>
    // 页面数据
    const pageItems = ${jsonData};

    // DOM元素
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.querySelector('.modal-close');

    // HTML转义
    function escapeHtml(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, m => map[m]);
    }

    // 显示详情弹窗
    function showModal(id) {
        const item = pageItems.find(i => i.id === id);
        if (!item) return;

        let html = \`
            <h2 class="modal-title">\${escapeHtml(item.title)}</h2>
            <div class="modal-meta">
                <span>📅 \${item.date || ''}</span>
                \${item.url ? \`<a href="\${item.url}" target="_blank" class="modal-source-link">🔗 \${item.source || '查看原文'}</a>\` : \`<span>🔗 \${item.source || ''}</span>\`}
            </div>
        \`;

        // 标签（移到摘要上面）
        if (item.tags && item.tags.length > 0) {
            html += '<div class="modal-section"><h3>🏷️ 标签</h3><div class="modal-tags">';
            item.tags.forEach(tag => {
                html += \`<span class="tag">\${tag}</span>\`;
            });
            html += '</div></div>';
        }

        // 摘要
        if (item.summary) {
            html += \`
                <div class="modal-section">
                    <h3>📝 内容摘要</h3>
                    <p class="modal-summary">\${escapeHtml(item.summary)}</p>
                </div>
            \`;
        }

        if (checkLocalAccess()) {
            html += \`
                <div class="modal-section">
                    <h3>📣 发布到公众号</h3>
                    <button class="view-full-btn" onclick="publishToWechat(\${item.id}, this)">发布到草稿箱</button>
                </div>
            \`;
        }

        // 图片
        if (item.images && item.images.length > 0) {
            html += '<div class="modal-section"><h3>📸 图片</h3><div class="modal-images">';
            item.images.forEach(img => {
                const imgPath = '${dataPath}' + img;
                html += \`<img src="\${imgPath}" alt="\${escapeHtml(item.title)}" loading="lazy">\`;
            });
            html += '</div></div>';
        }

        // 视频
        if (item.videos && item.videos.length > 0) {
            html += '<div class="modal-section"><h3>🎬 视频</h3><div class="modal-videos">';
            item.videos.forEach(video => {
                const videoPath = '${dataPath}' + video;
                html += \`<video controls><source src="\${videoPath}" type="video/mp4"></video>\`;
            });
            html += '</div></div>';
        }

        // 中文提示词
        if (item.contentChinese) {
            html += \`
                <div class="modal-section">
                    <h3>🇨🇳 中文提示词
                        <button class="copy-btn" onclick="copyText('chinese')">📋 复制</button>
                    </h3>
                    <div class="modal-content-text" id="text-chinese">\${escapeHtml(item.contentChinese)}</div>
                </div>
            \`;
        }

        // 英文提示词
        if (item.contentEnglish) {
            html += \`
                <div class="modal-section">
                    <h3>🇬🇧 英文提示词
                        <button class="copy-btn" onclick="copyText('english')">📋 复制</button>
                    </h3>
                    <div class="modal-content-text" id="text-english">\${escapeHtml(item.contentEnglish)}</div>
                </div>
            \`;
        }

        // 通用内容
        if (item.content) {
            html += \`
                <div class="modal-section">
                    <h3>📝 内容
                        <button class="copy-btn" onclick="copyText('content')">📋 复制</button>
                    </h3>
                    <div class="modal-content-text" id="text-content">\${escapeHtml(item.content)}</div>
                </div>
            \`;
        }

        modalBody.innerHTML = html;
        modal.style.display = 'block';
    }

    // 复制文本
    function copyText(type) {
        const element = document.getElementById('text-' + type);
        if (!element) return;

        const text = element.textContent;
        navigator.clipboard.writeText(text).then(() => {
            alert('✅ 已复制到剪贴板');
        }).catch(err => {
            console.error('复制失败:', err);
        });
    }

    async function publishToWechat(id, button) {
        if (!id) return;
        const originalText = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = '发布中...';
        }

        try {
            const response = await fetch('/api/wechat-publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const result = await response.json();

            if (response.ok && result.success) {
                alert('✅ 已发布到公众号草稿箱');
            } else {
                const message = result.error || result.message || ('HTTP ' + response.status);
                alert('❌ 发布失败：' + message);
            }
        } catch (error) {
            alert('❌ 发布失败：' + error.message);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText || '发布到草稿箱';
            }
        }
    }

    // 关闭模态框
    modalClose.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // 检查是否为本地访问
    function checkLocalAccess() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
    }

    // 删除内容
    async function deleteContent(id) {
        const item = pageItems.find(i => i.id === id);
        if (!item) {
            alert('未找到该内容');
            return;
        }

        // 二次确认
        if (!confirm(\`确定要删除这条内容吗？\\n\\n标题：\${item.title}\\n\\n删除后无法恢复！\`)) {
            return;
        }

        try {
            const response = await fetch('/api/delete-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            const result = await response.json();

            if (result.success) {
                // 删除成功，直接刷新页面
                location.reload();
            } else {
                alert('❌ 删除失败：' + result.error);
            }
        } catch (error) {
            alert('❌ 删除失败：' + error.message);
        }
    }

    // 搜索和筛选功能
    let selectedTags = new Set();

    function filterContent() {
        const searchInput = document.getElementById('searchInput');
        const statsText = document.getElementById('statsText');
        const caseGrid = document.getElementById('caseGrid');

        if (!searchInput || !caseGrid) return; // 如果没有搜索框，直接返回

        const searchTerm = searchInput.value.toLowerCase().trim();
        let filteredItems = pageItems;

        // 标签筛选
        if (selectedTags.size > 0) {
            filteredItems = filteredItems.filter(item => {
                return item.tags && item.tags.some(tag => selectedTags.has(tag));
            });
        }

        // 搜索筛选
        if (searchTerm) {
            filteredItems = filteredItems.filter(item => {
                const searchableText = [
                    item.title || '',
                    item.summary || '',
                    item.content || '',
                    item.source || '',
                    ...(item.tags || [])
                ].join(' ').toLowerCase();
                return searchableText.includes(searchTerm);
            });
        }

        // 重新渲染卡片
        renderCards(filteredItems);

        // 更新统计
        if (statsText) {
            if (selectedTags.size > 0 || searchTerm) {
                statsText.textContent = \`显示 \${filteredItems.length} / \${pageItems.length} 条内容\`;
            } else {
                statsText.textContent = \`共 \${pageItems.length} 条内容\`;
            }
        }
    }

    function renderCards(items) {
        const caseGrid = document.getElementById('caseGrid');
        if (!caseGrid) return;

        if (items.length === 0) {
            caseGrid.innerHTML = '<div class="no-results">😕 没有找到匹配的内容</div>';
            return;
        }

        caseGrid.innerHTML = items.map(item => {
            const tags = item.tags ? item.tags.map(t => \`<span class="tag">\${t}</span>\`).join('') : '';

            // 缩略图：优先显示图片，其次显示视频，最后显示默认图标
            let thumbnail;
            if (item.images && item.images[0]) {
                thumbnail = \`<img src="\${item.images[0]}" alt="\${escapeHtml(item.title)}" loading="lazy">\`;
            } else if (item.videos && item.videos[0]) {
                thumbnail = \`<video style="width:100%; height:100%; object-fit: cover;" muted playsinline webkit-playsinline autoplay loop preload="metadata">
                    <source src="\${item.videos[0]}" type="video/mp4">
                    您的浏览器不支持视频播放
                </video>\`;
            } else {
                thumbnail = \`<div class="no-image">📸</div>\`;
            }

            const summary = item.summary ? escapeHtml(item.summary) : '';
            const hasChinese = item.contentChinese && item.contentChinese.trim();
            const hasEnglish = item.contentEnglish && item.contentEnglish.trim();
            const hasContent = item.content && item.content.trim();
            let promptPreview = '';

            if (hasChinese || hasEnglish || hasContent) {
                let chinesePreview = '';
                let englishPreview = '';
                let contentPreview = '';

                if (hasChinese) {
                    const text = item.contentChinese.substring(0, 200);
                    const truncated = item.contentChinese.length > 200 ? '...' : '';
                    chinesePreview = \`<div class="prompt-section">
                        <h4>🇨🇳 中文提示词</h4>
                        <p>\${escapeHtml(text)}\${truncated}</p>
                    </div>\`;
                }

                if (hasEnglish) {
                    const text = item.contentEnglish.substring(0, 200);
                    const truncated = item.contentEnglish.length > 200 ? '...' : '';
                    englishPreview = \`<div class="prompt-section">
                        <h4>🇬🇧 English Prompt</h4>
                        <p>\${escapeHtml(text)}\${truncated}</p>
                    </div>\`;
                }

                if (!hasChinese && !hasEnglish && hasContent) {
                    const text = item.content.substring(0, 200);
                    const truncated = item.content.length > 200 ? '...' : '';
                    contentPreview = \`<div class="prompt-section">
                        <h4>📝 提示词</h4>
                        <p>\${escapeHtml(text)}\${truncated}</p>
                    </div>\`;
                }

                promptPreview = \`
                    <details class="prompt-preview">
                        <summary>🎨 查看AI提示词</summary>
                        <div class="prompt-content">
                            \${chinesePreview}
                            \${englishPreview}
                            \${contentPreview}
                            <button class="view-full-btn" onclick="event.stopPropagation(); document.querySelector('.case-card[data-id=\\\"${'${item.id}'}\\\"]').click();">查看完整内容</button>
                        </div>
                    </details>\`;
            }

            return \`
                <div class="case-card" data-id="\${item.id}">
                    <button class="delete-btn" data-id="\${item.id}" title="删除这条内容" style="display:none;">🗑️</button>
                    <div class="case-thumbnail">\${thumbnail}</div>
                    <div class="case-info">
                        <h3 class="case-title">\${item.caseNumber}: \${escapeHtml(item.title)}</h3>
                        \${summary ? \`<p class="case-summary">\${summary}</p>\` : ''}
                        <div class="case-meta">
                            <span class="case-date">\${item.date || ''}</span>
                            <span class="case-source">\${item.source || ''}</span>
                        </div>
                        <div class="case-tags">\${tags}</div>
                        \${promptPreview}
                    </div>
                </div>\`;
        }).join('');

        // 重新绑定事件
        bindCardEvents();
    }

    function bindCardEvents() {
        const isLocalAccess = checkLocalAccess();

        // 如果是本地访问，显示删除按钮
        if (isLocalAccess) {
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.style.display = 'block';
            });
        }

        // 绑定卡片点击事件
        document.querySelectorAll('.case-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-btn') || e.target.closest('.delete-btn')) {
                    return;
                }
                const id = parseInt(card.getAttribute('data-id'));
                showModal(id);
            });
        });

        // 绑定删除按钮事件
        if (isLocalAccess) {
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(btn.getAttribute('data-id'));
                    deleteContent(id);
                });
            });
        }
    }

    // 初始化
    document.addEventListener('DOMContentLoaded', () => {
        bindCardEvents();

        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', filterContent);
        }

        // 标签筛选
        const tagFilters = document.getElementById('tagFilters');
        if (tagFilters) {
            tagFilters.addEventListener('click', (e) => {
                if (e.target.classList.contains('tag-filter')) {
                    const tag = e.target.dataset.tag;
                    e.target.classList.toggle('active');

                    if (selectedTags.has(tag)) {
                        selectedTags.delete(tag);
                    } else {
                        selectedTags.add(tag);
                    }

                    filterContent();
                }
            });
        }

        // 清除筛选
        const clearFilters = document.getElementById('clearFilters');
        if (clearFilters) {
            clearFilters.addEventListener('click', () => {
                selectedTags.clear();
                if (searchInput) searchInput.value = '';
                document.querySelectorAll('.tag-filter.active').forEach(btn => {
                    btn.classList.remove('active');
                });
                filterContent();
            });
        }
    });
    </script>
    `;
}

/**
 * 生成结构化数据（JSON-LD）
 */
function generateSchema(options) {
    const {
        pageType = 'WebPage',
        title,
        description,
        url,
        breadcrumbs = [],
        itemCount = 0
    } = options;

    let schemas = [];

    // 首页：WebSite + ItemList
    if (pageType === 'home') {
        schemas.push({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Gem Nana AI 提示词库",
            "url": SITE_URL + "/",
            "description": "精选 AI 提示词收藏库，包含图片生成、视频生成和文字提示词等优质案例",
            "inLanguage": "zh-CN",
            "potentialAction": {
                "@type": "SearchAction",
                "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": SITE_URL + "/?q={search_term_string}"
                },
                "query-input": "required name=search_term_string"
            }
        });

        schemas.push({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "name": "AI 提示词案例精选",
            "description": description,
            "numberOfItems": itemCount,
            "itemListElement": []
        });
    }
    // 分类页或标签页：CollectionPage + BreadcrumbList
    else if (pageType === 'collection') {
        const schema = {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": title + " | Gem Nana AI 提示词库",
            "description": description,
            "url": url,
            "inLanguage": "zh-CN",
            "isPartOf": {
                "@type": "WebSite",
                "name": "Gem Nana AI 提示词库",
                "url": SITE_URL + "/"
            }
        };

        // 添加面包屑导航
        if (breadcrumbs.length > 0) {
            schema.breadcrumb = {
                "@type": "BreadcrumbList",
                "itemListElement": breadcrumbs.map((crumb, index) => ({
                    "@type": "ListItem",
                    "position": index + 1,
                    "name": crumb.name,
                    "item": crumb.url
                }))
            };
        }

        schemas.push(schema);
    }

    // 生成 JSON-LD 脚本标签
    return schemas.map(schema => `
    <script type="application/ld+json">
    ${JSON.stringify(schema, null, 2)}
    </script>`).join('');
}

/**
 * 生成页面模板
 */
function generatePageTemplate(options) {
    const {
        title,
        description,
        keywords = 'AI提示词,Prompt,Midjourney,Stable Diffusion,DALL-E,图片生成,AI绘画,提示词库',
        currentPage,
        stats,
        content,
        stylePath = 'assets/style.css',
        scriptPath = null,
        items = [],
        dataPath = '',
        pageType = 'WebPage',
        pageUrl = '',
        breadcrumbs = []
    } = options;

    // 生成结构化数据
    const schemaMarkup = generateSchema({
        pageType,
        title,
        description,
        url: pageUrl,
        breadcrumbs,
        itemCount: items.length
    });

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Gem Nana AI 提示词库</title>
    <meta name="description" content="${description}">
    <meta name="keywords" content="${keywords}">
    <link rel="stylesheet" href="${stylePath}?v=${Date.now()}">
${schemaMarkup}
</head>
<body class="layout-sidebar">
    ${generateSidebar(currentPage, stats)}

    <main class="main-content">
        ${content}
    </main>

    ${generateModal()}
    ${generateInlineScript(items, dataPath, currentPage)}
</body>
</html>`;
}

/**
 * 生成首页（内容流）
 */
function generateHomePage(allItems, stats) {
    console.log('📄 生成首页...');

    // 按时间倒序
    const sortedItems = allItems.sort((a, b) => {
        return (b.id || 0) - (a.id || 0);
    });

    // 统计所有标签
    const tagStats = getTagStats(sortedItems);
    const topTags = Object.entries(tagStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20) // 显示前20个热门标签
        .map(([tag, count]) => `<button class="tag-filter" data-tag="${tag}">${tag} (${count})</button>`)
        .join('');

    const displayItems = sortedItems;
    const casesHtml = displayItems.map(item => generateCaseCard(item, '.')).join('\n');

    const content = `
        <div class="page-header">
            <h1>最新案例</h1>
            <p>精选 ${stats.total} 个 AI 提示词案例</p>
        </div>

        <!-- 搜索和筛选区 -->
        <div class="controls">
            <div class="search-box">
                <input
                    type="text"
                    id="searchInput"
                    placeholder="🔍 搜索标题、内容、标签..."
                    class="search-input"
                />
            </div>

            <div class="filter-section">
                <div class="filter-header">
                    <span>🏷️ 标签筛选:</span>
                    <button id="clearFilters" class="btn-clear">清除筛选</button>
                </div>
                <div id="tagFilters" class="tag-filters">
                    ${topTags}
                </div>
            </div>

            <div class="stats">
                <span id="statsText">共 ${stats.total} 条内容</span>
            </div>
        </div>

        <div class="case-grid" id="caseGrid">
            ${casesHtml}
        </div>
    `;

    const html = generatePageTemplate({
        title: 'AI提示词库 - ' + stats.total + '个Midjourney/Stable Diffusion/ChatGPT提示词案例',
        description: `免费AI图片生成提示词库，收录${stats.total}个精选Prompt案例，支持Midjourney、DALL-E、Stable Diffusion、Gemini等工具。包含中英文提示词、图像编辑、人像生成、创意设计等分类，助力AI绘画创作。`,
        keywords: 'AI提示词,Prompt,Midjourney提示词,Stable Diffusion,DALL-E,ChatGPT,Gemini,图片生成,AI绘画,提示词库,人像生成,创意设计,3D转换,图像编辑',
        currentPage: 'home',
        stats,
        content,
        stylePath: 'assets/style.css',
        items: displayItems,
        dataPath: '',
        pageType: 'home',
        pageUrl: SITE_URL + '/',
        enableSearch: true  // 启用搜索功能
    });

    fs.writeFileSync(path.join(ROOT_DIR, 'index.html'), html, 'utf8');
    console.log('✅ 首页生成完成\n');
}

/**
 * 生成图片主页
 */
function generateImagePage(imageItems, stats) {
    console.log('📄 生成图片主页...');

    // 按ID倒序排列
    const sortedItems = imageItems.sort((a, b) => (b.id || 0) - (a.id || 0));
    const displayItems = sortedItems.slice(0, 100);
    const casesHtml = displayItems.map(item => generateCaseCard(item, '..')).join('\n');

    const content = `
        <div class="page-header">
            <h1>📸 图片生成提示词</h1>
            <p>精选 ${imageItems.length} 个图片生成案例</p>
        </div>

        <div class="case-grid">
            ${casesHtml}
        </div>
    `;

    const html = generatePageTemplate({
        title: 'AI图片生成提示词 - ' + imageItems.length + '个Midjourney/Stable Diffusion Prompt案例',
        description: `${imageItems.length}个精选AI图片生成提示词，涵盖Midjourney、Stable Diffusion、DALL-E等主流工具，包含人像摄影、创意设计、3D转换、图像编辑等多种风格，提供中英双语Prompt参考。`,
        currentPage: 'image',
        stats,
        content,
        stylePath: '../assets/style.css',
        items: displayItems,
        dataPath: '../',
        pageType: 'collection',
        pageUrl: SITE_URL + '/image/',
        breadcrumbs: [
            { name: '首页', url: SITE_URL + '/' },
            { name: '图片生成', url: SITE_URL + '/image/' }
        ]
    });

    fs.writeFileSync(path.join(ROOT_DIR, 'image', 'index.html'), html, 'utf8');
    console.log('✅ 图片主页生成完成\n');
}

/**
 * 生成视频主页
 */
function generateVideoPage(videoItems, stats) {
    console.log('📄 生成视频主页...');

    // 按ID倒序排列
    const sortedItems = videoItems.sort((a, b) => (b.id || 0) - (a.id || 0));

    const casesHtml = sortedItems.length > 0 ?
        sortedItems.map(item => generateCaseCard(item, '..')).join('\n') :
        '<div class="no-results">暂无视频案例，敬请期待...</div>';

    const content = `
        <div class="page-header">
            <h1>🎬 视频生成提示词</h1>
            <p>${videoItems.length > 0 ? `精选 ${videoItems.length} 个视频生成案例` : '即将上线'}</p>
        </div>

        <div class="case-grid">
            ${casesHtml}
        </div>
    `;

    const html = generatePageTemplate({
        title: 'AI视频生成提示词 - ' + sortedItems.length + '个Sora/Runway/Pika Prompt案例',
        description: `${sortedItems.length}个精选AI视频生成提示词，支持Sora、Runway、Pika、Veo等主流视频生成工具，涵盖电影级场景、动画特效、创意视频等类型，提供中英双语Prompt参考。`,
        currentPage: 'video',
        stats,
        content,
        stylePath: '../assets/style.css',
        items: sortedItems,
        dataPath: '../',
        pageType: 'collection',
        pageUrl: SITE_URL + '/video/',
        breadcrumbs: [
            { name: '首页', url: SITE_URL + '/' },
            { name: '视频生成', url: SITE_URL + '/video/' }
        ]
    });

    fs.writeFileSync(path.join(ROOT_DIR, 'video', 'index.html'), html, 'utf8');
    console.log('✅ 视频主页生成完成\n');
}

/**
 * 生成文字主页
 */
function generateTextPage(textItems, stats) {
    console.log('📄 生成文字主页...');

    const content = `
        <div class="page-header">
            <h1>💬 文字提示词</h1>
            <p>即将上线，敬请期待</p>
        </div>

        <div class="coming-soon">
            <div class="coming-soon-icon">🚧</div>
            <h2>内容筹备中</h2>
            <p>我们正在收集和整理优质的 AI 对话提示词</p>
            <p>包括 ChatGPT、Claude、Gemini 等工具的高级用法</p>
        </div>
    `;

    const html = generatePageTemplate({
        title: 'AI文字提示词库 - ChatGPT/Claude/Gemini Prompt大全',
        description: 'AI文字提示词库即将上线，将收录ChatGPT、Claude、Gemini等主流AI对话工具的高级Prompt，涵盖写作、编程、分析、创意等多种场景，助力提升AI对话效率。',
        currentPage: 'text',
        stats,
        content,
        stylePath: '../assets/style.css',
        items: [],
        dataPath: '../',
        pageType: 'collection',
        pageUrl: SITE_URL + '/text/',
        breadcrumbs: [
            { name: '首页', url: SITE_URL + '/' },
            { name: '文字提示词', url: SITE_URL + '/text/' }
        ]
    });

    fs.writeFileSync(path.join(ROOT_DIR, 'text', 'index.html'), html, 'utf8');
    console.log('✅ 文字主页生成完成\n');
}

/**
 * 生成标签分类页（图片）
 */
function generateImageTagPages(imageItems, stats) {
    console.log('📄 生成图片标签分类页...');

    const tagStats = getTagStats(imageItems);

    // 只生成案例数 >= 10 的标签页
    const majorTags = Object.entries(tagStats)
        .filter(([tag, count]) => count >= 10)
        .sort((a, b) => b[1] - a[1]);

    majorTags.forEach(([tag, count]) => {
        // 筛选该标签的案例并按ID倒序排列
        const tagItems = imageItems
            .filter(item => item.tags && item.tags.includes(tag))
            .sort((a, b) => (b.id || 0) - (a.id || 0));

        const casesHtml = tagItems.map(item => generateCaseCard(item, '..')).join('\n');

        const content = `
            <div class="page-header">
                <nav class="breadcrumb">
                    <a href="../index.html">🏠 首页</a>
                    <span>›</span>
                    <a href="index.html">📸 图片生成</a>
                    <span>›</span>
                    <span>${tag}</span>
                </nav>
                <h1>${tag}</h1>
                <p>精选 ${count} 个相关案例</p>
            </div>

            <div class="case-grid">
                ${casesHtml}
            </div>
        `;

        const filename = tag.replace(/\s+/g, '-').toLowerCase() + '.html';
        const html = generatePageTemplate({
            title: `${tag} - 图片生成`,
            description: `${count} 个 ${tag} 相关的图片生成提示词案例`,
            currentPage: 'image',
            stats,
            content,
            stylePath: '../assets/style.css',
            items: tagItems,
            dataPath: '../',
            pageType: 'collection',
            pageUrl: SITE_URL + '/image/' + filename,
            breadcrumbs: [
                { name: '首页', url: SITE_URL + '/' },
                { name: '图片生成', url: SITE_URL + '/image/' },
                { name: tag, url: SITE_URL + '/image/' + filename }
            ]
        });

        fs.writeFileSync(path.join(ROOT_DIR, 'image', filename), html, 'utf8');
        console.log(`  ✓ ${tag} (${count})`);
    });

    console.log(`✅ 生成了 ${majorTags.length} 个标签页\n`);
}

/**
 * 主函数
 */
function main() {
    try {
        // 加载数据
        const allItems = loadAllData();

        // 按媒体类型分组
        const groups = groupByMediaType(allItems);

        // 统计数据
        const stats = {
            total: allItems.length,
            image: groups.image.length,
            video: groups.video.length,
            text: groups.text.length
        };

        // 生成各页面
        generateHomePage(allItems, stats);
        generateImagePage(groups.image, stats);
        generateVideoPage(groups.video, stats);
        generateTextPage(groups.text, stats);
        generateImageTagPages(groups.image, stats);

        console.log('🎉 所有页面生成完成！');
        console.log(`📊 总计: ${stats.total} 个案例`);
        console.log(`   - 图片: ${stats.image} 个`);
        console.log(`   - 视频: ${stats.video} 个`);
        console.log(`   - 文字: ${stats.text} 个`);

    } catch (error) {
        console.error('❌ 生成失败:', error);
        process.exit(1);
    }
}

// 执行
main();
