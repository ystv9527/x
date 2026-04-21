// 页面注入脚本 - 在页面上下文中运行
(function() {
  console.log('🔌 Twitter API 拦截器已注入');

  // 存储拦截到的数据
  window.__twitterMediaData = new Map();
  window.__twitterTweetData = new Map();
  window.__twitterArticleData = new Map();
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

        // 缓存推文文本与关系信息（用于“提示词在回复里”的场景）
        const tweetMeta = parseTweetMeta(tweet);
        if (tweetMeta.text) {
          window.__twitterTweetData.set(tweetId, tweetMeta);
          window.postMessage({
            type: 'TWITTER_TWEET_CACHED',
            tweetId: tweetId,
            tweetData: tweetMeta
          }, '*');
        }

        const articleData = parseArticleCard(tweet);
        if (articleData && (articleData.content || articleData.url || (articleData.images && articleData.images.length > 0))) {
          window.__twitterArticleData.set(tweetId, articleData);
          window.postMessage({
            type: 'TWITTER_ARTICLE_CACHED',
            tweetId: tweetId,
            articleData: articleData
          }, '*');
        }

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

  function normalizeText(text) {
    return String(text || '').replace(/\s+\n/g, '\n').trim();
  }

  function stringFromBindingValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return String(value || '');
    const directKeys = [
      'string_value',
      'scribe_key',
      'url',
      'expanded_url',
      'display_url',
      'vanity_url',
      'title',
      'description',
      'text'
    ];
    for (const key of directKeys) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key];
    }
    return '';
  }

  function getCardBindingMap(card) {
    const map = {};
    const legacy = card?.legacy || card || {};
    const bindings = legacy.binding_values || card?.binding_values || [];
    if (Array.isArray(bindings)) {
      bindings.forEach((binding) => {
        const key = binding?.key;
        if (!key) return;
        map[key] = stringFromBindingValue(binding.value);
      });
    } else if (bindings && typeof bindings === 'object') {
      Object.keys(bindings).forEach((key) => {
        map[key] = stringFromBindingValue(bindings[key]);
      });
    }
    return map;
  }

  function safeJsonParse(value) {
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function collectStringsDeep(obj, result = [], seen = new Set()) {
    if (!obj || seen.has(obj)) return result;
    if (typeof obj === 'string') {
      if (obj.trim()) result.push(obj.trim());
      return result;
    }
    if (typeof obj !== 'object') return result;
    seen.add(obj);
    if (Array.isArray(obj)) {
      obj.forEach((item) => collectStringsDeep(item, result, seen));
      return result;
    }
    Object.keys(obj).forEach((key) => collectStringsDeep(obj[key], result, seen));
    return result;
  }

  function collectImageUrlsDeep(obj, result = [], seen = new Set()) {
    if (!obj || seen.has(obj)) return result;
    if (typeof obj === 'string') {
      if (/pbs\.twimg\.com\/media\//i.test(obj) && !result.includes(obj)) {
        try {
          const url = new URL(obj);
          url.searchParams.set('name', 'orig');
          result.push(url.toString());
        } catch {
          result.push(obj);
        }
      }
      return result;
    }
    if (typeof obj !== 'object') return result;
    seen.add(obj);
    if (Array.isArray(obj)) {
      obj.forEach((item) => collectImageUrlsDeep(item, result, seen));
      return result;
    }
    Object.keys(obj).forEach((key) => collectImageUrlsDeep(obj[key], result, seen));
    return result;
  }

  function pickArticleUrl(strings) {
    const found = strings.find((value) => /(?:x|twitter)\.com\/i\/article\/\d+/i.test(value) || /\/i\/article\/\d+/i.test(value));
    if (!found) return '';
    try {
      const url = new URL(found, 'https://x.com');
      if (url.hostname === 'twitter.com') url.hostname = 'x.com';
      return url.toString();
    } catch {
      return found;
    }
  }

  function parseArticleCard(tweet) {
    const card = tweet?.card || tweet?.legacy?.card || null;
    const bindings = getCardBindingMap(card);
    const unifiedCard = safeJsonParse(bindings.unified_card || bindings.unified_card_card || '');
    const strings = collectStringsDeep({ bindings, unifiedCard, article: tweet?.article });
    const articleUrl = bindings.card_url || bindings.vanity_url || pickArticleUrl(strings);

    const title = normalizeText(
      bindings.title ||
      bindings.card_title ||
      bindings.summary_title ||
      strings.find((value) => value.length >= 12 && value.length <= 160 && !/^(https?:\/\/|\/)/i.test(value)) ||
      ''
    );

    const description = normalizeText(
      bindings.description ||
      bindings.card_description ||
      bindings.summary_description ||
      bindings.preview_text ||
      strings
        .filter((value) => value !== title && value.length >= 30 && !/^(https?:\/\/|\/)/i.test(value))
        .sort((a, b) => b.length - a.length)[0] ||
      ''
    );

    const images = collectImageUrlsDeep({ bindings, unifiedCard, card });
    const content = [title, description].filter(Boolean).join('\n\n');
    if (!content && !articleUrl && images.length === 0) return null;
    return { title, description, content, url: articleUrl, images };
  }

  function parseTweetMeta(tweet) {
    const legacy = tweet.legacy || tweet || {};

    const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text || '';
    const fullText = legacy.full_text || legacy.text || '';
    const text = String(noteText || fullText || '').trim();

    const userLegacy = tweet?.core?.user_results?.result?.legacy || {};
    const authorName = String(userLegacy.name || '').trim();
    const authorScreenName = String(userLegacy.screen_name || '').trim();

    return {
      text,
      authorName,
      authorScreenName,
      inReplyToStatusId: String(legacy.in_reply_to_status_id_str || '').trim(),
      conversationId: String(legacy.conversation_id_str || legacy.id_str || '').trim(),
      createdAt: legacy.created_at || '',
      lang: legacy.lang || ''
    };
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
