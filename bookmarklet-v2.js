/**
 * X内容采集书签脚本 V2 - 支持图片提取
 * 使用方法：在X推文页面点击此书签，自动提取内容和图片
 */

javascript:(function() {
  /* 检查是否在X/Twitter页面 */
  if (!window.location.hostname.includes('twitter.com') && !window.location.hostname.includes('x.com')) {
    alert('⚠️ 请在X(Twitter)推文页面使用此书签！');
    return;
  }

  try {
    /* 提取推文内容 */
    let tweetText = '';
    let author = '';
    let url = window.location.href;
    let images = [];

    /* 提取文字内容 */
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

    /* 提取作者信息 */
    const authorElement = document.querySelector('[data-testid="User-Name"] span') ||
                         document.querySelector('article a[role="link"] span');
    if (authorElement) {
      author = authorElement.textContent.trim();
    }

    /* 提取图片 - 多种选择器 */
    const imageSelectors = [
      'article img[src*="media"]',
      '[data-testid="tweetPhoto"] img',
      'div[data-testid="tweetPhoto"] img',
      'article div[role="link"] img'
    ];

    for (let selector of imageSelectors) {
      const imgs = document.querySelectorAll(selector);
      imgs.forEach(img => {
        let src = img.src;
        // 获取原图（去掉小图参数）
        if (src.includes('?')) {
          src = src.split('?')[0] + '?format=jpg&name=large';
        }
        if (src && !images.includes(src) && src.includes('pbs.twimg.com')) {
          images.push(src);
        }
      });
      if (images.length > 0) break;
    }

    /* 如果没有提取到文字，使用页面标题 */
    if (!tweetText) {
      tweetText = document.title;
    }

    /* 构建数据对象 */
    const data = {
      title: tweetText.substring(0, 100) + (tweetText.length > 100 ? '...' : ''),
      source: 'X / ' + (author || '@unknown'),
      url: url,
      content: tweetText,
      tags: 'X, Twitter',
      date: new Date().toISOString().split('T')[0],
      images: images.join('|||') // 用特殊分隔符连接多个图片URL
    };

    /* 打开本地添加页面，通过URL参数传递数据 */
    const params = new URLSearchParams(data);
    const addUrl = 'http://localhost:3000/add.html?' + params.toString();

    window.open(addUrl, '_blank', 'width=900,height=1000');

  } catch (error) {
    alert('❌ 提取失败：' + error.message + '\n\n请确保：\n1. 在推文详情页使用\n2. 页面已完全加载\n3. 本地服务器正在运行');
    console.error('Bookmarklet error:', error);
  }
})();
