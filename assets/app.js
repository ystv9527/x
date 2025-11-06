// 全局变量
let allItems = [];
let filteredItems = [];
let selectedTags = new Set();

// DOM元素
const searchInput = document.getElementById('searchInput');
const contentList = document.getElementById('contentList');
const tagFilters = document.getElementById('tagFilters');
const statsText = document.getElementById('statsText');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.querySelector('.modal-close');
const clearFiltersBtn = document.getElementById('clearFilters');

// 初始化
async function init() {
    try {
        await loadData();
        renderTagFilters();
        renderContent(allItems);
        updateStats();
        setupEventListeners();
    } catch (error) {
        console.error('初始化失败:', error);
        contentList.innerHTML = '<div class="no-results">❌ 加载失败，请检查数据文件</div>';
    }
}

// 加载数据
async function loadData() {
    const response = await fetch('data/contents.json');
    const data = await response.json();
    allItems = (data.items || []).reverse();  // 倒序显示（最新在前）
    filteredItems = [...allItems];
}

// 渲染标签筛选器
function renderTagFilters() {
    const tagCount = {};

    // 统计所有标签
    allItems.forEach(item => {
        item.tags.forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
    });

    // 按数量排序
    const sortedTags = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count }));

    // 渲染标签按钮
    tagFilters.innerHTML = sortedTags.map(({ tag, count }) => `
        <button class="tag-filter" data-tag="${tag}">
            ${tag} (${count})
        </button>
    `).join('');
}

// 渲染内容列表
function renderContent(items) {
    if (items.length === 0) {
        contentList.innerHTML = '<div class="no-results">😕 没有找到匹配的内容</div>';
        return;
    }

    contentList.innerHTML = items.map(item => `
        <div class="content-card" data-id="${item.id}">
            ${item.videos && item.videos.length > 0 && (!item.images || item.images.length === 0) ? `
                <div class="content-image">
                    <video style="width:100%; max-height:200px; object-fit:cover;" muted>
                        <source src="${item.videos[0]}" type="video/mp4">
                    </video>
                    ${item.videos.length > 1 ? `<span class="image-count">+${item.videos.length - 1}🎬</span>` : ''}
                </div>
            ` : ''}
            ${item.images && item.images.length > 0 ? `
                <div class="content-image">
                    <img src="${item.images[0]}" alt="${escapeHtml(item.title)}" loading="lazy">
                    ${item.images.length > 1 ? `<span class="image-count">+${item.images.length - 1}</span>` : ''}
                    ${item.caseNumber ? `<span class="case-number">${escapeHtml(item.caseNumber)}</span>` : ''}
                </div>
            ` : ''}
            ${!item.images || item.images.length === 0 && item.caseNumber ? `<div class="case-number-top">${escapeHtml(item.caseNumber)}</div>` : ''}
            <h3>${escapeHtml(item.title)}</h3>
            <div class="content-meta">
                ${item.source ? `<div class="content-meta-item">📌 ${escapeHtml(item.source)}</div>` : ''}
                ${item.date ? `<div class="content-meta-item">📅 ${item.date}</div>` : ''}
            </div>
            ${item.summary ? `<p class="content-summary">${escapeHtml(item.summary)}</p>` : ''}
            <div class="content-tags">
                ${item.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
        </div>
    `).join('');

    // 添加点击事件
    document.querySelectorAll('.content-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            showModal(id);
        });
    });
}

// 显示详情模态框
function showModal(id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;

    modalBody.innerHTML = `
        <h2 class="modal-title">${escapeHtml(item.title)}</h2>
        <div class="modal-meta">
            ${item.source ? `<p><strong>来源:</strong> ${escapeHtml(item.source)}</p>` : ''}
            ${item.url ? `<p><strong>链接:</strong> <a href="${item.url}" target="_blank">${item.url}</a></p>` : ''}
            ${item.date ? `<p><strong>日期:</strong> ${item.date}</p>` : ''}
            ${item.tags.length > 0 ? `<p><strong>标签:</strong> ${item.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ')}</p>` : ''}
            ${item.reason ? `<p><strong>收藏理由:</strong> ${escapeHtml(item.reason)}</p>` : ''}
        </div>
        ${item.summary ? `
            <div class="modal-section">
                <h4>📋 内容摘要</h4>
                <p>${escapeHtml(item.summary)}</p>
            </div>
        ` : ''}
        ${item.keyPoints.length > 0 ? `
            <div class="modal-section">
                <h4>⭐ 关键要点</h4>
                <ul>
                    ${item.keyPoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        ${item.contentChinese || item.contentEnglish ? `
            ${item.contentChinese ? `
                <div class="modal-section">
                    <div class="content-header">
                        <h4>🇨🇳 中文内容</h4>
                        <button class="copy-btn" onclick="copyContent('chinese-${item.id}', event)">📋 复制</button>
                    </div>
                    <div class="modal-content-text" id="chinese-${item.id}">${escapeHtml(item.contentChinese)}</div>
                </div>
            ` : ''}
            ${item.contentEnglish ? `
                <div class="modal-section">
                    <div class="content-header">
                        <h4>🇺🇸 英文内容</h4>
                        <button class="copy-btn" onclick="copyContent('english-${item.id}', event)">📋 复制</button>
                    </div>
                    <div class="modal-content-text" id="english-${item.id}">${escapeHtml(item.contentEnglish)}</div>
                </div>
            ` : ''}
        ` : item.content ? `
            <div class="modal-section">
                <div class="content-header">
                    <h4>📖 完整内容</h4>
                    <button class="copy-btn" onclick="copyContent('content-${item.id}', event)">📋 复制</button>
                </div>
                <div class="modal-content-text" id="content-${item.id}">${escapeHtml(item.content)}</div>
            </div>
        ` : ''}
        ${item.images.length > 0 ? `
            <div class="modal-section">
                <h4>🖼️ 相关图片</h4>
                ${item.images.map(img => `<img src="${img}" alt="图片" style="max-width: 100%; border-radius: 8px; margin-top: 10px;">`).join('')}
            </div>
        ` : ''}
        ${item.videos && item.videos.length > 0 ? `
            <div class="modal-section">
                <h4>🎬 相关视频</h4>
                ${item.videos.map(video => `<video width="100%" controls style="margin-top: 10px; border-radius: 8px;"><source src="${video}" type="video/mp4"></video>`).join('')}
            </div>
        ` : ''}
    `;

    modal.style.display = 'block';
}

// 搜索和筛选
function filterContent() {
    const searchTerm = searchInput.value.toLowerCase().trim();

    filteredItems = allItems.filter(item => {
        // 标签筛选
        if (selectedTags.size > 0) {
            const hasTag = item.tags.some(tag => selectedTags.has(tag));
            if (!hasTag) return false;
        }

        // 搜索筛选
        if (searchTerm) {
            const searchableText = [
                item.title,
                item.summary,
                item.content,
                item.source,
                ...item.tags,
                ...item.keyPoints
            ].join(' ').toLowerCase();

            if (!searchableText.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    renderContent(filteredItems);
    updateStats();
}

// 更新统计信息
function updateStats() {
    const total = allItems.length;
    const shown = filteredItems.length;
    const filtered = selectedTags.size > 0 || searchInput.value.trim();

    if (filtered) {
        statsText.textContent = `显示 ${shown} / ${total} 条内容`;
    } else {
        statsText.textContent = `共 ${total} 条内容`;
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 搜索输入
    searchInput.addEventListener('input', filterContent);

    // 标签筛选
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

    // 清除筛选
    clearFiltersBtn.addEventListener('click', () => {
        selectedTags.clear();
        searchInput.value = '';
        document.querySelectorAll('.tag-filter.active').forEach(btn => {
            btn.classList.remove('active');
        });
        filterContent();
    });

    // 模态框关闭
    modalClose.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            modal.style.display = 'none';
        }
    });
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 复制内容到剪贴板
function copyContent(elementId, event) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const text = element.textContent;
    const button = event ? event.target : null;

    // 使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (button) showCopyFeedback(button);
        }).catch(err => {
            console.error('复制失败:', err);
            if (button) {
                button.textContent = '❌ 复制失败';
                setTimeout(() => {
                    button.textContent = '📋 复制';
                }, 2000);
            }
        });
    } else {
        // 兼容旧浏览器
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            if (button) showCopyFeedback(button);
        } catch (err) {
            console.error('复制失败:', err);
        }
        document.body.removeChild(textarea);
    }
}

// 显示复制成功反馈
function showCopyFeedback(button) {
    const originalText = button.textContent;
    button.textContent = '✅ 已复制';
    button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    button.style.transform = 'scale(1.05)';

    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
        button.style.transform = '';
    }, 2000);
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
