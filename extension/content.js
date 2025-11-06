// X 推文收藏助手 - Content Script v2.0
// 基于 Codex 验证的方案：优先 DOM 直取 + GraphQL API 拦截 + HLS 处理
console.log('📚 X 推文收藏助手 v2.0 已加载');

// 配置
const SERVER_URL = 'http://localhost:3000';
const COLLECT_BUTTON_CLASS = 'x-collector-btn';

// 已处理的推文集合
const processedTweets = new Set();

// Twitter 媒体数据缓存（从页面脚本接收）
const twitterMediaCache = new Map();

// 监听来自页面脚本的消息
window.addEventListener('message', (event) => {
  // 只接受来自同源的消息
  if (event.source !== window) return;

  if (event.data.type === 'TWITTER_MEDIA_CACHED') {
    const { tweetId, mediaData } = event.data;
    twitterMediaCache.set(tweetId, mediaData);
    console.log('📨 接收到媒体数据:', tweetId, mediaData);
  }
});

// =============================================================================
// 第一步：注入页面脚本，Hook Fetch/XHR，拦截 GraphQL API
// =============================================================================

function injectPageScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// 立即注入页面脚本
injectPageScript();

// =============================================================================
// 第二步：从 DOM 或缓存中提取媒体
// =============================================================================

/**
 * 提取推文数据
 */
function extractTweetData(tweetElement) {
  let title = '';
  let author = '';
  let content = '';
  let imageUrls = [];
  let videoItems = [];
  let tweetUrl = '';

  // 提取推文文本
  const tweetText = tweetElement.querySelector('[data-testid="tweetText"]');
  if (tweetText) {
    content = tweetText.textContent.trim();
    title = content.substring(0, 100);
  }

  // 提取作者
  const userNameElement = tweetElement.querySelector('[data-testid="User-Name"] span');
  if (userNameElement) {
    author = userNameElement.textContent.trim();
  }

  // 提取推文URL和ID
  const timeElement = tweetElement.querySelector('time');
  if (timeElement) {
    const link = timeElement.closest('a');
    if (link) {
      tweetUrl = 'https://x.com' + link.getAttribute('href');
    }
  }

  const tweetId = tweetUrl ? tweetUrl.match(/status\/(\d+)/)?.[1] : null;

  // 方法1：从 content script 缓存中获取媒体数据
  if (tweetId && twitterMediaCache.has(tweetId)) {
    const cachedMedia = twitterMediaCache.get(tweetId);
    console.log('✅ 从缓存获取媒体:', tweetId, cachedMedia);
    imageUrls = cachedMedia.images || [];
    videoItems = cachedMedia.videos || [];
  }

  // 方法2：从 DOM 直接提取（作为后备）
  if (imageUrls.length === 0) {
    const mediaImages = tweetElement.querySelectorAll('img[src*="/media/"]');
    mediaImages.forEach(img => {
      let src = img.src;
      if (src && !imageUrls.find(url => url.includes(src.split('?')[0]))) {
        try {
          const url = new URL(src);
          url.searchParams.set('name', 'orig');
          imageUrls.push(url.toString());
        } catch (err) {
          imageUrls.push(src);
        }
      }
    });
  }

  // 方法3：从 DOM 提取视频（如果缓存中没有）
  if (videoItems.length === 0) {
    const mediaVideos = tweetElement.querySelectorAll('video');
    mediaVideos.forEach(video => {
      // 检查 currentSrc
      if (video.currentSrc && video.currentSrc.includes('video.twimg.com') && !video.currentSrc.startsWith('blob:')) {
        videoItems.push({
          url: video.currentSrc,
          type: video.currentSrc.includes('.m3u8') ? 'hls' : 'mp4',
          contentType: 'video/mp4'
        });
      } else {
        // 检查 source 标签
        const sources = video.querySelectorAll('source');
        sources.forEach(source => {
          if (source.src && source.src.includes('video.twimg.com') && !source.src.startsWith('blob:')) {
            videoItems.push({
              url: source.src,
              type: source.src.includes('.m3u8') ? 'hls' : 'mp4',
              contentType: source.type || 'video/mp4'
            });
          }
        });
      }
    });
  }

  console.log('📝 提取结果:', {
    title,
    author,
    tweetId,
    images: imageUrls.length,
    videos: videoItems.length,
    videoDetails: videoItems
  });

  return {
    title,
    author,
    content,
    imageUrls,
    videoItems, // 包含 { url, type, contentType, bitrate }
    url: tweetUrl || window.location.href,
    date: new Date().toISOString().split('T')[0],
    tags: 'X,Twitter',
    tweetId
  };
}

// =============================================================================
// 第三步：HLS 处理 - 下载 m3u8 并合并分片
// =============================================================================

/**
 * 下载并处理 HLS 视频
 */
async function downloadHLS(m3u8Url, progressCallback) {
  console.log('🎬 开始处理 HLS:', m3u8Url);

  try {
    // 1. 下载 master/media playlist
    const playlistText = await fetch(m3u8Url).then(r => r.text());
    console.log('📄 Playlist 内容:', playlistText.substring(0, 200));

    // 2. 判断是否是 master playlist
    if (playlistText.includes('#EXT-X-STREAM-INF')) {
      // Master playlist - 选择最高码率
      console.log('📋 检测到 Master Playlist，选择最高码率...');
      const bestVariant = parseMasterPlaylist(playlistText, m3u8Url);
      if (!bestVariant) {
        throw new Error('无法解析 master playlist');
      }
      console.log('✅ 选择变体:', bestVariant);
      return downloadHLS(bestVariant, progressCallback); // 递归处理
    }

    // 3. 解析 media playlist
    const { initSegment, segments } = parseMediaPlaylist(playlistText, m3u8Url);
    console.log(`📦 找到 ${segments.length} 个分片`);

    // 4. 下载所有分片
    const buffers = [];

    if (initSegment) {
      console.log('⬇️ 下载 init segment...');
      const initBuffer = await fetch(initSegment).then(r => r.arrayBuffer());
      buffers.push(initBuffer);
    }

    for (let i = 0; i < segments.length; i++) {
      if (progressCallback) {
        progressCallback((i + 1) / segments.length);
      }
      console.log(`⬇️ 下载分片 ${i + 1}/${segments.length}...`);
      const segBuffer = await fetch(segments[i]).then(r => r.arrayBuffer());
      buffers.push(segBuffer);
    }

    // 5. 合并所有分片
    console.log('🔗 合并分片...');
    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    buffers.forEach(buf => {
      merged.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    });

    // 6. 创建 Blob
    const mimeType = segments[0].endsWith('.m4s') ? 'video/mp4' : 'video/mp2t';
    const blob = new Blob([merged], { type: mimeType });
    console.log(`✅ HLS 处理完成，大小: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

    return { blob, mimeType };

  } catch (error) {
    console.error('❌ HLS 处理失败:', error);
    throw error;
  }
}

/**
 * 解析 Master Playlist，返回最高码率的 URL
 */
function parseMasterPlaylist(playlistText, baseUrl) {
  const lines = playlistText.split('\n');
  let bestBandwidth = 0;
  let bestUrl = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      // 提取 BANDWIDTH 或 AVERAGE-BANDWIDTH
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/) || line.match(/AVERAGE-BANDWIDTH=(\d+)/);
      if (bandwidthMatch) {
        const bandwidth = parseInt(bandwidthMatch[1]);
        if (bandwidth > bestBandwidth) {
          // 下一行是 URL
          const nextLine = lines[i + 1]?.trim();
          if (nextLine && !nextLine.startsWith('#')) {
            bestBandwidth = bandwidth;
            bestUrl = new URL(nextLine, baseUrl).href;
          }
        }
      }
    }
  }

  return bestUrl;
}

/**
 * 解析 Media Playlist，返回 init segment 和所有分片 URL
 */
function parseMediaPlaylist(playlistText, baseUrl) {
  const lines = playlistText.split('\n');
  let initSegment = null;
  const segments = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 提取 init segment
    if (line.startsWith('#EXT-X-MAP')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        initSegment = new URL(uriMatch[1], baseUrl).href;
      }
    }

    // 提取分片 URL
    if (!line.startsWith('#') && line.length > 0) {
      const segmentUrl = new URL(line, baseUrl).href;
      segments.push(segmentUrl);
    }
  }

  return { initSegment, segments };
}

// =============================================================================
// 第四步：发送数据到服务器
// =============================================================================

async function collectTweet(tweetData) {
  try {
    console.log('📤 开始采集推文:', tweetData.title);
    console.log('📤 视频数量:', tweetData.videoItems?.length || 0);
    console.log('📤 视频数据:', tweetData.videoItems);

    // 1. 处理 HLS 视频（在浏览器端完成）
    const processedVideos = [];
    for (let i = 0; i < tweetData.videoItems.length; i++) {
      const video = tweetData.videoItems[i];
      console.log(`📤 处理视频 ${i + 1}:`, video);

      if (video.type === 'hls') {
        console.log(`🎬 处理 HLS 视频 ${i + 1}...`);
        try {
          const { blob, mimeType } = await downloadHLS(video.url, (progress) => {
            console.log(`⏳ 进度: ${(progress * 100).toFixed(0)}%`);
          });

          // 将 Blob 发送到服务器
          const formData = new FormData();
          formData.append('video', blob, `tweet-${tweetData.tweetId}-${i}.mp4`);
          formData.append('tweetId', tweetData.tweetId);
          formData.append('index', i);
          formData.append('mimeType', mimeType);

          const uploadResponse = await fetch(`${SERVER_URL}/api/upload-video`, {
            method: 'POST',
            body: formData
          });

          const result = await uploadResponse.json();
          if (result.success) {
            processedVideos.push(result.filename);
            console.log(`✅ HLS 视频上传成功: ${result.filename}`);
          }
        } catch (error) {
          console.error(`❌ HLS 处理失败:`, error);
          alert(`视频 ${i + 1} 处理失败: ${error.message}`);
        }
      } else {
        // MP4 直链，让服务器下载
        console.log(`📤 MP4 直链 ${i + 1}:`, video.url);
        processedVideos.push(video.url);
      }
    }

    console.log('📤 处理后的视频列表:', processedVideos);

    // 2. 构建URL参数
    const params = new URLSearchParams({
      title: tweetData.title,
      source: 'X / ' + tweetData.author,
      url: tweetData.url,
      content: tweetData.content,
      tags: tweetData.tags,
      date: tweetData.date,
      images: tweetData.imageUrls.join('|'),
      videos: processedVideos.join('|'),
      tweetId: tweetData.tweetId || ''
    });

    // 3. 打开编辑页面
    const editorUrl = `${SERVER_URL}/add-auto.html?${params.toString()}`;
    console.log('📤 打开编辑页面:', editorUrl);
    console.log('📤 videos 参数:', params.get('videos'));
    window.open(editorUrl, '_blank', 'width=900,height=1000');

  } catch (error) {
    console.error('❌ 采集失败:', error);
    alert('采集失败: ' + error.message);
  }
}

// =============================================================================
// 第五步：UI - 创建采集按钮
// =============================================================================

function createCollectButton(tweetElement) {
  const button = document.createElement('button');
  button.className = COLLECT_BUTTON_CLASS;
  button.innerHTML = '📚 采集';
  button.title = '采集这条推文到收藏库';

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      // 提取数据
      const tweetData = extractTweetData(tweetElement);

      // 检查是否有媒体
      if (tweetData.imageUrls.length === 0 && tweetData.videoItems.length === 0) {
        console.warn('⚠️ 未找到媒体文件');
      }

      // 检查视频类型
      const hasHLS = tweetData.videoItems.some(v => v.type === 'hls');
      if (hasHLS) {
        button.innerHTML = '🎬 处理中...';
        button.disabled = true;
      } else {
        button.innerHTML = '✅ 已采集';
        button.style.background = '#4caf50';
      }

      // 采集
      await collectTweet(tweetData);

      // 恢复按钮
      setTimeout(() => {
        button.innerHTML = '📚 采集';
        button.style.background = '';
        button.disabled = false;
      }, 2000);

    } catch (error) {
      console.error('❌ 采集失败:', error);
      button.innerHTML = '❌ 失败';
      button.style.background = '#f44336';
      setTimeout(() => {
        button.innerHTML = '📚 采集';
        button.style.background = '';
      }, 2000);
    }
  });

  return button;
}

function addCollectButton(tweetElement) {
  if (processedTweets.has(tweetElement)) return;

  const actionBar = tweetElement.querySelector('[role="group"]');
  if (!actionBar) return;

  if (actionBar.querySelector('.' + COLLECT_BUTTON_CLASS)) return;

  const button = createCollectButton(tweetElement);
  const buttonWrapper = document.createElement('div');
  buttonWrapper.style.display = 'flex';
  buttonWrapper.style.alignItems = 'center';
  buttonWrapper.appendChild(button);
  actionBar.appendChild(buttonWrapper);

  processedTweets.add(tweetElement);
  console.log('✅ 已为推文添加采集按钮');
}

function scanTweets() {
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  tweets.forEach(tweet => addCollectButton(tweet));
}

const observer = new MutationObserver(() => scanTweets());

function startObserving() {
  scanTweets();
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  console.log('👀 开始监听新推文...');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserving);
} else {
  startObserving();
}

setInterval(scanTweets, 2000);

// 调试助手：暴露缓存到控制台
window.__debugTwitterCollector = {
  getCache: () => {
    console.log('📦 当前缓存:', twitterMediaCache);
    return twitterMediaCache;
  },
  getCacheSize: () => {
    const size = twitterMediaCache.size;
    console.log(`📊 缓存大小: ${size} 个推文`);
    return size;
  },
  getTweet: (tweetId) => {
    const data = twitterMediaCache.get(tweetId);
    console.log(`🔍 推文 ${tweetId}:`, data || '未找到');
    return data;
  },
  clearCache: () => {
    twitterMediaCache.clear();
    console.log('🗑️ 缓存已清空');
  }
};

console.log('💡 调试提示：使用 window.__debugTwitterCollector 查看缓存状态');
console.log('   例如：__debugTwitterCollector.getCache()');
console.log('        __debugTwitterCollector.getCacheSize()');
console.log('        __debugTwitterCollector.getTweet("1234567890")');
