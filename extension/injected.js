// 页面注入脚本 - 在页面上下文中运行
(function() {
  console.log('🔌 Twitter API 拦截器已注入');

  // 存储拦截到的数据
  window.__twitterMediaData = new Map();
  window.__twitterApiResponses = [];

  // Hook fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const response = await originalFetch.apply(this, args);

    // 拦截 GraphQL API
    if (url && url.includes('/i/api/graphql/')) {
      try {
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();

        // 存储响应数据
        window.__twitterApiResponses.push({
          url,
          data,
          timestamp: Date.now()
        });

        // 提取媒体信息
        extractMediaFromGraphQL(data);

        console.log('📡 拦截到 GraphQL 响应:', url.substring(0, 100));
      } catch (e) {
        // JSON 解析失败，忽略
      }
    }

    return response;
  };

  // Hook XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__url = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this.__url && this.__url.includes('/i/api/graphql/')) {
      this.addEventListener('load', function() {
        try {
          const data = JSON.parse(this.responseText);
          window.__twitterApiResponses.push({
            url: this.__url,
            data,
            timestamp: Date.now()
          });
          extractMediaFromGraphQL(data);
          console.log('📡 拦截到 XHR 响应:', this.__url.substring(0, 100));
        } catch (e) {
          // 忽略
        }
      });
    }
    return originalSend.apply(this, args);
  };

  // 从 GraphQL 响应中提取媒体信息
  function extractMediaFromGraphQL(data) {
    try {
      // 递归查找所有的 tweet 对象
      const tweets = [];
      findTweets(data, tweets);

      tweets.forEach(tweet => {
        const tweetId = tweet.rest_id || tweet.id_str;
        if (!tweetId) return;

        const legacy = tweet.legacy || tweet;
        const media = legacy.extended_entities?.media || legacy.entities?.media;

        if (media && media.length > 0) {
          const mediaData = parseMediaArray(media);
          if (mediaData.images.length > 0 || mediaData.videos.length > 0) {
            window.__twitterMediaData.set(tweetId, mediaData);
            console.log('💾 缓存媒体数据:', tweetId, mediaData);

            // 发送消息给 content script
            window.postMessage({
              type: 'TWITTER_MEDIA_CACHED',
              tweetId: tweetId,
              mediaData: mediaData
            }, '*');
          }
        }
      });
    } catch (e) {
      console.error('媒体提取失败:', e);
    }
  }

  // 递归查找所有 tweet 对象
  function findTweets(obj, tweets) {
    if (!obj || typeof obj !== 'object') return;

    // 检查是否是 tweet 对象
    if (obj.legacy && (obj.rest_id || obj.id_str)) {
      tweets.push(obj);
    } else if (obj.__typename === 'Tweet') {
      tweets.push(obj);
    }

    // 递归搜索
    if (obj.result) findTweets(obj.result, tweets);
    if (obj.tweet_results) findTweets(obj.tweet_results, tweets);
    if (obj.itemContent) findTweets(obj.itemContent, tweets);
    if (obj.tweet) findTweets(obj.tweet, tweets);

    // 搜索数组和对象
    for (const key in obj) {
      if (Array.isArray(obj[key])) {
        obj[key].forEach(item => findTweets(item, tweets));
      } else if (typeof obj[key] === 'object') {
        findTweets(obj[key], tweets);
      }
    }
  }

  // 解析媒体数组
  function parseMediaArray(mediaArray) {
    const result = { images: [], videos: [] };

    mediaArray.forEach(media => {
      if (media.type === 'photo') {
        // 图片：使用原图
        const url = media.media_url_https + '?name=orig';
        result.images.push(url);
      } else if (media.type === 'video' || media.type === 'animated_gif') {
        // 视频：选择最高质量
        const variants = media.video_info?.variants || [];

        // 优先选择 MP4
        const mp4Variants = variants.filter(v => v.content_type === 'video/mp4');
        if (mp4Variants.length > 0) {
          // 选择最高 bitrate
          const best = mp4Variants.reduce((prev, curr) => {
            const prevBitrate = prev.bitrate || 0;
            const currBitrate = curr.bitrate || 0;
            return currBitrate > prevBitrate ? curr : prev;
          });
          result.videos.push({
            url: best.url,
            type: 'mp4',
            bitrate: best.bitrate,
            contentType: best.content_type
          });
        } else {
          // 只有 HLS (m3u8)
          const hlsVariant = variants.find(v => v.content_type === 'application/x-mpegURL');
          if (hlsVariant) {
            result.videos.push({
              url: hlsVariant.url,
              type: 'hls',
              contentType: hlsVariant.content_type
            });
          }
        }
      }
    });

    return result;
  }

  // 解析页面初始状态
  function parseInitialState() {
    try {
      // 尝试读取 __INITIAL_STATE__
      if (window.__INITIAL_STATE__) {
        console.log('📦 找到 __INITIAL_STATE__');
        extractMediaFromGraphQL(window.__INITIAL_STATE__);
      }

      // 尝试读取 __APOLLO_STATE__
      if (window.__APOLLO_STATE__) {
        console.log('📦 找到 __APOLLO_STATE__');
        extractMediaFromGraphQL(window.__APOLLO_STATE__);
      }
    } catch (e) {
      console.error('初始状态解析失败:', e);
    }
  }

  // 页面加载后立即解析
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', parseInitialState);
  } else {
    parseInitialState();
  }

  console.log('✅ Twitter API 拦截器已启动');
})();
