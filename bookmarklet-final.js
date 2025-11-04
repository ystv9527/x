/**
 * X Content Collector - Final Version
 * 自动下载图片并上传到服务器
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

    // 提取图片 - 重要：获取本地图片而不是URL
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
      images: images
    };

    // 通过localStorage传递数据
    localStorage.setItem('tweet_data', JSON.stringify(data));

    // 打开添加窗口
    window.open('http://localhost:3000/add-auto.html', '_blank', 'width=900,height=1000');

  } catch (error) {
    alert('❌ 提取失败：' + error.message);
    console.error('Bookmarklet error:', error);
  }
})();
