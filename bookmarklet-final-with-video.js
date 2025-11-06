/**
 * X Content Collector - Final Version with Video Support
 * 自动下载图片和视频并上传到服务器
 */

javascript:(function() {
  if (!window.location.hostname.includes('twitter.com') && !window.location.hostname.includes('x.com')) {
    alert('⚠️ 请在X(Twitter)推文页面使用此书签！');
    return;
  }

  try {
    let tweetText = '';
    let author = '';
    let url = window.location.href;
    let images = [];
    let videos = [];

    // 提取文字内容
    const textSelectors = [
      '[data-testid="tweetText"]',
      'article [lang]',
      '[role="article"] [lang]'
    ];

    for (let selector of textSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        tweetText = element.textContent.trim();
        break;
      }
    }

    // 提取作者
    const authorElement = document.querySelector('[data-testid="User-Name"] span') ||
                         document.querySelector('article a[role="link"] span');
    if (authorElement) {
      author = authorElement.textContent.trim();
    }

    // 提取图片
    const imageSelectors = [
      'article img[src*="media"]',
      '[data-testid="tweetPhoto"] img',
      'div[data-testid="tweetPhoto"] img',
      'article div[role="link"] img'
    ];

    for (let selector of imageSelectors) {
      const imgs = document.querySelectorAll(selector);
      if (imgs.length > 0) {
        for (let img of imgs) {
          images.push({
            src: img.src,
            alt: img.alt || 'tweet image'
          });
        }
        break;
      }
    }

    // 提取视频
    const videoElements = document.querySelectorAll('article video, div[data-testid="videoPlayer"] video');
    if (videoElements.length > 0) {
      videoElements.forEach(video => {
        // 尝试获取video的source标签
        const sources = video.querySelectorAll('source');
        if (sources.length > 0) {
          sources.forEach(source => {
            if (source.src && source.src.includes('video.twimg.com')) {
              videos.push({
                src: source.src,
                type: source.type || 'video/mp4'
              });
            }
          });
        }
        // 如果没有source标签，尝试直接获取video的src
        if (videos.length === 0 && video.src && !video.src.startsWith('blob:')) {
          videos.push({
            src: video.src,
            type: 'video/mp4'
          });
        }
      });
    }

    if (!tweetText) {
      tweetText = document.title;
    }

    // 打开表单窗口
    const data = {
      title: tweetText.substring(0, 100) + (tweetText.length > 100 ? '...' : ''),
      source: 'X / ' + (author || '@unknown'),
      url: url,
      content: tweetText,
      tags: 'X, Twitter',
      date: new Date().toISOString().split('T')[0],
      images: images,
      videos: videos
    };

    // 通过localStorage传递数据
    localStorage.setItem('tweet_data', JSON.stringify(data));

    // 打开添加窗口
    window.open('http://localhost:3000/add-auto.html', '_blank', 'width=900,height=1000');

    // 提示用户采集结果
    console.log('📦 采集到的数据:', data);
    console.log('🖼️ 图片数量:', images.length);
    console.log('🎬 视频数量:', videos.length);

  } catch (error) {
    alert('❌ 提取失败：' + error.message);
    console.error('Bookmarklet error:', error);
  }
})();
