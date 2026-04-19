// X 推文收藏助手 - Popup Script

const SERVER_URL = 'http://localhost:3000';

// 检查服务器状态
async function checkServerStatus() {
    const statusDiv = document.getElementById('serverStatus');
    const statusText = document.getElementById('statusText');

    try {
        const response = await fetch(`${SERVER_URL}/api/status`);
        if (response.ok) {
            const data = await response.json();
            statusText.textContent = '运行中';
            statusDiv.classList.remove('offline');
        } else {
            throw new Error('Server not responding');
        }
    } catch (error) {
        statusText.textContent = '离线';
        statusDiv.classList.add('offline');
    }
}

// 打开收藏库
document.getElementById('openLibrary').addEventListener('click', () => {
    chrome.tabs.create({ url: SERVER_URL });
});

// 打开设置（暂时打开编辑页面）
document.getElementById('openSettings').addEventListener('click', () => {
    chrome.tabs.create({ url: `${SERVER_URL}/add-auto.html` });
});

// 页面加载时检查服务器状态
checkServerStatus();

// 每5秒检查一次服务器状态
setInterval(checkServerStatus, 5000);
