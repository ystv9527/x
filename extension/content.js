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
// Twitter 文本与会话缓存（从页面脚本接收）
const twitterTweetCache = new Map();

// 监听来自页面脚本的消息
window.addEventListener('message', (event) => {
  // 只接受来自同源的消息
  if (event.source !== window) return;

  if (event.data.type === 'TWITTER_MEDIA_CACHED') {
    const { tweetId, mediaData } = event.data;
    twitterMediaCache.set(tweetId, mediaData);
    console.log('📨 接收到媒体数据:', tweetId, mediaData);
  } else if (event.data.type === 'TWITTER_TWEET_CACHED') {
    const { tweetId, tweetData } = event.data;
    twitterTweetCache.set(tweetId, tweetData);
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

function getAuthorScreenNameFromUrl(tweetUrl) {
  if (!tweetUrl) return '';
  const match = tweetUrl.match(/x\.com\/([^/]+)\/status\/\d+/i);
  return match ? String(match[1] || '').trim() : '';
}

function getTweetIdFromUrl(tweetUrl) {
  if (!tweetUrl) return '';
  const match = String(tweetUrl).match(/status\/(\d+)/i);
  return match ? String(match[1] || '').trim() : '';
}

function normalizeText(text) {
  return String(text || '').replace(/\s+\n/g, '\n').trim();
}

function extractTweetTextFromElement(tweetElement) {
  if (!tweetElement) return '';

  const primary = tweetElement.querySelector('[data-testid="tweetText"]');
  if (primary) {
    const value = normalizeText(primary.textContent || '');
    if (value) return value;
  }

  const langNodes = Array.from(tweetElement.querySelectorAll('[lang]'))
    .map((el) => normalizeText(el.textContent || ''))
    .filter((text) => text.length > 8 && !/^@\w+$/i.test(text));

  if (!langNodes.length) return '';
  return normalizeText(langNodes.join('\n'));
}

function pickBetterText(domText, cachedText) {
  const a = normalizeText(domText);
  const b = normalizeText(cachedText);
  if (!a) return b;
  if (!b) return a;
  // GraphQL 缓存通常是 full_text / note_tweet，更完整时优先
  if (b.length >= a.length + 20) return b;
  return a;
}

function looksLikePromptRedirect(text) {
  const value = normalizeText(text).toLowerCase();
  if (!value) return false;
  return /prompt\s*(below|in reply|in replies|down|👇)|see\s*(reply|replies)|in\s*(reply|replies)|提示.*(下方|回复)|在回复里|看回复|见回复/.test(value);
}

function calcPromptScore(text) {
  const value = normalizeText(text);
  if (!value) return 0;
  let score = value.length;
  const lower = value.toLowerCase();
  if (/prompt|format|subject|negative|seedance|midjourney|参数|格式|主题/.test(lower)) score += 120;
  if (value.includes('\n')) score += 40;
  return score;
}

function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(text || '');
  return textarea.value;
}

function extractTweetTextFromOEmbedHtml(html) {
  const source = String(html || '');
  if (!source) return '';

  const paragraphMatch = source.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  let text = paragraphMatch ? paragraphMatch[1] : source;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => !(idx === arr.length - 1 && /^[-—]\s*@?/.test(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

async function fetchTweetTextViaOEmbed(tweetUrl) {
  const normalizedUrl = String(tweetUrl || '').replace('twitter.com', 'x.com').trim();
  if (!normalizedUrl) return '';

  const endpoint = new URL('https://publish.twitter.com/oembed');
  endpoint.searchParams.set('omit_script', 'true');
  endpoint.searchParams.set('dnt', 'true');
  endpoint.searchParams.set('url', normalizedUrl);

  try {
    const res = await fetch(endpoint.toString(), {
      method: 'GET',
      credentials: 'omit'
    });
    if (!res.ok) return '';
    const payload = await res.json();
    const text = extractTweetTextFromOEmbedHtml(payload?.html);
    return text.length >= 20 ? text : '';
  } catch (error) {
    console.warn('oEmbed fallback failed:', error.message);
    return '';
  }
}

function getOgDescriptionFallback() {
  const selectors = [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]'
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const content = normalizeText(el?.getAttribute('content') || '');
    if (content && content.length > 20) return content;
  }
  return '';
}

function findBestAuthorReplyPrompt(mainTweetId, authorScreenName) {
  const targetAuthor = String(authorScreenName || '').toLowerCase();
  if (!mainTweetId || !targetAuthor) return null;

  const mainMeta = twitterTweetCache.get(mainTweetId) || null;
  const directReplies = [];
  const sameConversation = [];

  for (const [tweetId, meta] of twitterTweetCache.entries()) {
    if (!meta || tweetId === mainTweetId) continue;
    const metaAuthor = String(meta.authorScreenName || '').toLowerCase();
    if (metaAuthor !== targetAuthor) continue;

    if (meta.inReplyToStatusId === mainTweetId) {
      directReplies.push({ tweetId, ...meta });
      continue;
    }

    if (
      mainMeta &&
      meta.conversationId &&
      mainMeta.conversationId &&
      meta.conversationId === mainMeta.conversationId
    ) {
      sameConversation.push({ tweetId, ...meta });
    }
  }

  const candidates = (directReplies.length ? directReplies : sameConversation).filter(
    (item) => normalizeText(item.text).length >= 80
  );
  if (!candidates.length) return null;

  candidates.sort((a, b) => calcPromptScore(b.text) - calcPromptScore(a.text));
  return candidates[0];
}

function findBestAuthorReplyPromptFromDom(currentTweetElement, mainTweetId, authorScreenName) {
  const targetAuthor = String(authorScreenName || '').toLowerCase().trim();
  if (!targetAuthor) return null;

  const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const candidates = [];

  for (const tweetEl of tweets) {
    if (!tweetEl || tweetEl === currentTweetElement) continue;
    const tweetUrl = resolveTweetUrl(tweetEl);
    const tweetId = getTweetIdFromUrl(tweetUrl);
    if (!tweetId || tweetId === mainTweetId) continue;

    const screenName = getAuthorScreenNameFromUrl(tweetUrl).toLowerCase();
    if (screenName !== targetAuthor) continue;

    const text = extractTweetTextFromElement(tweetEl);
    if (text.length < 80) continue;
    candidates.push({ tweetId, text });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => calcPromptScore(b.text) - calcPromptScore(a.text));
  return candidates[0];
}

function extractMediaFromDomTweetElement(domTweetElement) {
  const images = [];
  const videos = [];
  if (!domTweetElement) return { images, videos };

  const pushImageUrl = (value) => {
    const src = String(value || '').trim();
    if (!src || !/pbs\.twimg\.com\/media\//i.test(src)) return;
    const baseUrl = src.split('?')[0];
    if (images.some((url) => url.includes(baseUrl))) return;
    try {
      const url = new URL(src);
      url.searchParams.set('name', 'orig');
      images.push(url.toString());
    } catch {
      images.push(src);
    }
  };

  const readSrcset = (srcset) => {
    String(srcset || '')
      .split(',')
      .map((item) => item.trim().split(/\s+/)[0])
      .filter(Boolean)
      .forEach(pushImageUrl);
  };

  const readBackgroundImages = (element) => {
    const styleValue = element?.style?.backgroundImage || '';
    const matches = String(styleValue).matchAll(/url\(["']?([^"')]+)["']?\)/g);
    for (const match of matches) {
      pushImageUrl(match[1]);
    }
  };

  const mediaImages = domTweetElement.querySelectorAll('img[src], img[srcset], source[srcset], [style*="pbs.twimg.com/media"]');
  mediaImages.forEach((node) => {
    pushImageUrl(node.currentSrc || node.src || node.getAttribute?.('src'));
    readSrcset(node.srcset || node.getAttribute?.('srcset'));
    readBackgroundImages(node);
  });

  domTweetElement.querySelectorAll('*').forEach(readBackgroundImages);

  const mediaVideos = domTweetElement.querySelectorAll('video');
  mediaVideos.forEach((video) => {
    if (
      video.currentSrc &&
      video.currentSrc.includes('video.twimg.com') &&
      !video.currentSrc.startsWith('blob:')
    ) {
      videos.push({
        url: video.currentSrc,
        type: video.currentSrc.includes('.m3u8') ? 'hls' : 'mp4',
        contentType: 'video/mp4'
      });
      return;
    }

    const sources = video.querySelectorAll('source');
    sources.forEach((source) => {
      if (
        source.src &&
        source.src.includes('video.twimg.com') &&
        !source.src.startsWith('blob:')
      ) {
        videos.push({
          url: source.src,
          type: source.src.includes('.m3u8') ? 'hls' : 'mp4',
          contentType: source.type || 'video/mp4'
        });
      }
    });
  });

  return { images, videos };
}

function resolveTweetUrl(tweetElement) {
  if (!tweetElement) return '';

  // Prefer canonical time anchor.
  const timeElement = tweetElement.querySelector('time');
  if (timeElement) {
    const link = timeElement.closest('a');
    const href = link ? link.getAttribute('href') : '';
    if (href) {
      const normalized = href.startsWith('http') ? href : `https://x.com${href}`;
      const match = normalized.match(/https?:\/\/(?:x|twitter)\.com\/[^/]+\/status\/\d+/i);
      if (match) return match[0].replace('twitter.com', 'x.com');
    }
  }

  // Fallback: any status anchor under this tweet card.
  const anchors = Array.from(tweetElement.querySelectorAll('a[href*="/status/"]'));
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || '';
    if (!href) continue;
    const normalized = href.startsWith('http') ? href : `https://x.com${href}`;
    const match = normalized.match(/https?:\/\/(?:x|twitter)\.com\/[^/]+\/status\/\d+/i);
    if (match) return match[0].replace('twitter.com', 'x.com');
  }

  return '';
}

function findMediaFromNearbyTweets(currentTweetElement) {
  const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const currentIndex = tweets.indexOf(currentTweetElement);
  if (currentIndex < 0) return null;

  // Prefer nearby tweets above current one (often parent/root in thread view).
  for (let i = currentIndex - 1; i >= 0; i--) {
    const media = extractMediaFromDomTweetElement(tweets[i]);
    if (media.images.length > 0 || media.videos.length > 0) {
      return media;
    }
  }

  // Fallback: check below, in case the layout order is unusual.
  for (let i = currentIndex + 1; i < tweets.length; i++) {
    const media = extractMediaFromDomTweetElement(tweets[i]);
    if (media.images.length > 0 || media.videos.length > 0) {
      return media;
    }
  }

  return null;
}

function findMediaFromConversationCache(currentTweetId, currentMeta) {
  if (!currentMeta?.conversationId) return null;
  const conversationId = String(currentMeta.conversationId).trim();
  if (!conversationId) return null;

  const candidates = [];
  for (const [id, meta] of twitterTweetCache.entries()) {
    if (!meta || id === currentTweetId) continue;
    if (String(meta.conversationId || '').trim() !== conversationId) continue;
    if (!twitterMediaCache.has(id)) continue;
    const media = twitterMediaCache.get(id);
    const score = (Array.isArray(media.images) ? media.images.length : 0) * 10 +
      (Array.isArray(media.videos) ? media.videos.length : 0) * 20;
    if (score > 0) candidates.push({ score, media, id });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].media;
}

function findAnyCachedMediaExcept(currentTweetId) {
  const candidates = [];
  for (const [id, media] of twitterMediaCache.entries()) {
    if (!media || id === currentTweetId) continue;
    const imageCount = Array.isArray(media.images) ? media.images.length : 0;
    const videoCount = Array.isArray(media.videos) ? media.videos.length : 0;
    const score = imageCount * 10 + videoCount * 20;
    if (score > 0) candidates.push({ id, media, score });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].media;
}

/**
 * 提取推文数据
 */
async function extractTweetData(tweetElement) {
  let title = '';
  let author = '';
  let content = '';
  let imageUrls = [];
  let videoItems = [];
  let tweetUrl = '';

  // 提取推文文本
  content = extractTweetTextFromElement(tweetElement);
  if (content) {
    title = content.substring(0, 100);
  }

  // 提取作者
  const userNameElement = tweetElement.querySelector('[data-testid="User-Name"] span');
  if (userNameElement) {
    author = userNameElement.textContent.trim();
  }

  // 提取推文URL和ID
  tweetUrl = resolveTweetUrl(tweetElement);

  const tweetId = tweetUrl ? tweetUrl.match(/status\/(\d+)/)?.[1] : null;
  const pageStatusId = (window.location.href.match(/status\/(\d+)/) || [])[1] || '';
  const authorScreenNameFromUrl = getAuthorScreenNameFromUrl(tweetUrl);
  if (!author && authorScreenNameFromUrl) {
    author = `@${authorScreenNameFromUrl}`;
  }

  let cachedMainTweet = null;
  if (tweetId && twitterTweetCache.has(tweetId)) {
    cachedMainTweet = twitterTweetCache.get(tweetId);
    content = pickBetterText(content, cachedMainTweet.text);
    if (!author && cachedMainTweet.authorName) {
      author = cachedMainTweet.authorName;
    }
  }

  // 条件触发：仅当主贴像“引导语”或主贴明显过短时，才切换到作者回复里的长提示词。
  
  const authorScreenName = (cachedMainTweet?.authorScreenName || authorScreenNameFromUrl || '').trim();
  let bestReplyPrompt = findBestAuthorReplyPrompt(tweetId, authorScreenName);
  if (!bestReplyPrompt) {
    bestReplyPrompt = findBestAuthorReplyPromptFromDom(tweetElement, tweetId, authorScreenName);
  }
  if (bestReplyPrompt) {
    const mainText = normalizeText(content);
    const replyText = normalizeText(bestReplyPrompt.text);
    const shouldUseReply =
      !mainText ||
      (looksLikePromptRedirect(mainText) && replyText.length >= Math.max(120, mainText.length + 20)) ||
      (mainText.length < 90 && replyText.length >= Math.max(160, mainText.length + 60));

    if (shouldUseReply) {
      console.log('🧠 检测到提示词在作者回复中，自动使用回复正文:', {
        mainTweetId: tweetId,
        replyTweetId: bestReplyPrompt.tweetId,
        mainLength: mainText.length,
        replyLength: replyText.length
      });
      content = replyText;
      if (!title || title.length < 16) {
        title = replyText.substring(0, 100);
      }
    }
  }

  if (!normalizeText(content) && pageStatusId && pageStatusId !== tweetId) {
    const pageAnchor = document.querySelector(`a[href*="/status/${pageStatusId}"]`);
    const pageTweetElement = pageAnchor ? pageAnchor.closest('article[data-testid="tweet"]') : null;
    const pageText = extractTweetTextFromElement(pageTweetElement);
    if (pageText) {
      content = pageText;
      console.log('🧩 Fallback text from page root tweet');
    }
  }

  if (!normalizeText(content)) {
    const ogText = getOgDescriptionFallback();
    if (ogText) {
      content = ogText;
      console.log('🧩 Fallback text from meta description');
    }
  }

  if (!normalizeText(content) && tweetUrl) {
    const oembedText = await fetchTweetTextViaOEmbed(tweetUrl);
    if (oembedText) {
      content = oembedText;
      console.log('🧩 Fallback text from oEmbed');
    }
  }

  if (!title || title.length < 16) {
    title = normalizeText(content).slice(0, 100);
  }

  // 方法1：从 content script 缓存中获取媒体数据
  if (tweetId && twitterMediaCache.has(tweetId)) {
    const cachedMedia = twitterMediaCache.get(tweetId);
    console.log('✅ 从缓存获取媒体:', tweetId, cachedMedia);
    imageUrls = cachedMedia.images || [];
    videoItems = cachedMedia.videos || [];
  }

  // 方法2：从 DOM 直接提取（作为后备）
  if (imageUrls.length === 0 || videoItems.length === 0) {
    const domMedia = extractMediaFromDomTweetElement(tweetElement);
    if (imageUrls.length === 0) imageUrls = domMedia.images;
    if (videoItems.length === 0) videoItems = domMedia.videos;
  }

  const parentTweetId = String(cachedMainTweet?.inReplyToStatusId || '').trim();
  const isReplyTweet = !!parentTweetId && parentTweetId !== tweetId;
  const isThreadReplyOnDetailPage = !!pageStatusId && !!tweetId && pageStatusId !== tweetId;
  const hasNoMedia = imageUrls.length === 0 && videoItems.length === 0;
  const shouldTryParentMedia =
    hasNoMedia && (
      isReplyTweet ||
      isThreadReplyOnDetailPage ||
      !!bestReplyPrompt ||
      looksLikePromptRedirect(content)
    );

  if (shouldTryParentMedia) {
    let parentMedia = null;

    // 1) Direct parent by in_reply_to
    if (parentTweetId) {
      if (twitterMediaCache.has(parentTweetId)) {
        parentMedia = twitterMediaCache.get(parentTweetId);
        console.log('🧩 回复采集：命中主贴媒体缓存', parentTweetId, parentMedia);
      } else {
        const parentAnchor = document.querySelector(`a[href*="/status/${parentTweetId}"]`);
        const parentTweetElement = parentAnchor ? parentAnchor.closest('article[data-testid="tweet"]') : null;
        if (parentTweetElement) {
          const domParentMedia = extractMediaFromDomTweetElement(parentTweetElement);
          if (domParentMedia.images.length > 0 || domParentMedia.videos.length > 0) {
            parentMedia = domParentMedia;
            console.log('🧩 回复采集：从 DOM 回填主贴媒体', parentTweetId, parentMedia);
          }
        }
      }
    }

    // 1.5) Fallback to page status tweet (Post detail URL usually points to root/main tweet)
    if (!parentMedia) {
      if (pageStatusId && pageStatusId !== tweetId) {
        if (twitterMediaCache.has(pageStatusId)) {
          parentMedia = twitterMediaCache.get(pageStatusId);
          console.log('🧩 回复采集：命中页面主贴媒体缓存', pageStatusId, parentMedia);
        } else {
          const pageAnchor = document.querySelector(`a[href*="/status/${pageStatusId}"]`);
          const pageTweetElement = pageAnchor ? pageAnchor.closest('article[data-testid="tweet"]') : null;
          if (pageTweetElement) {
            const domPageMedia = extractMediaFromDomTweetElement(pageTweetElement);
            if (domPageMedia.images.length > 0 || domPageMedia.videos.length > 0) {
              parentMedia = domPageMedia;
              console.log('🧩 回复采集：从页面主贴 DOM 回填媒体', pageStatusId, parentMedia);
            }
          }
        }
      }
    }

    // 2) Same conversation cache fallback
    if (!parentMedia) {
      parentMedia = findMediaFromConversationCache(tweetId, cachedMainTweet);
      if (parentMedia) {
        console.log('🧩 回复采集：从会话缓存回填主贴媒体');
      }
    }

    // 3) Nearby tweet DOM fallback
    if (!parentMedia) {
      parentMedia = findMediaFromNearbyTweets(tweetElement);
      if (parentMedia) {
        console.log('🧩 回复采集：从同页邻近推文回填媒体');
      }
    }

    // 4) Last resort: use any cached media from this page session.
    if (!parentMedia && (isReplyTweet || isThreadReplyOnDetailPage)) {
      parentMedia = findAnyCachedMediaExcept(tweetId);
      if (parentMedia) {
        console.log('回复采集：使用缓存全局兜底媒体');
      }
    }

    if (parentMedia) {
      imageUrls = Array.isArray(parentMedia.images) ? parentMedia.images : [];
      videoItems = Array.isArray(parentMedia.videos) ? parentMedia.videos : [];
    }
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

    // 3. 打开编辑页面（使用固定窗口名称，可以重用）
    const editorUrl = `${SERVER_URL}/add-auto.html?${params.toString()}`;
    console.log('📤 打开编辑页面:', editorUrl);
    console.log('📤 videos 参数:', params.get('videos'));
    const editorWindow = window.open(editorUrl, 'xCollectorEditor', 'width=900,height=1000');

    // 如果窗口被拦截，给出提示
    if (!editorWindow || editorWindow.closed) {
      alert('❌ 弹窗被拦截！\n\n请允许此网站的弹窗，然后重试。');
      return;
    }

    // 聚焦到编辑窗口
    editorWindow.focus();

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
      const tweetData = await extractTweetData(tweetElement);

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
  getTweetCache: () => {
    console.log('🧾 当前推文文本缓存:', twitterTweetCache);
    return twitterTweetCache;
  },
  getCacheSize: () => {
    const size = twitterMediaCache.size;
    console.log(`📊 缓存大小: ${size} 个推文`);
    return size;
  },
  getTweetCacheSize: () => {
    const size = twitterTweetCache.size;
    console.log(`🧾 文本缓存大小: ${size} 条`);
    return size;
  },
  getTweet: (tweetId) => {
    const data = twitterMediaCache.get(tweetId);
    console.log(`🔍 推文 ${tweetId}:`, data || '未找到');
    return data;
  },
  getTweetText: (tweetId) => {
    const data = twitterTweetCache.get(tweetId);
    console.log(`🧾 推文文本 ${tweetId}:`, data || '未找到');
    return data;
  },
  clearCache: () => {
    twitterMediaCache.clear();
    twitterTweetCache.clear();
    console.log('🗑️ 缓存已清空');
  }
};

console.log('💡 调试提示：使用 window.__debugTwitterCollector 查看缓存状态');
console.log('   例如：__debugTwitterCollector.getCache()');
console.log('        __debugTwitterCollector.getCacheSize()');
console.log('        __debugTwitterCollector.getTweet("1234567890")');
