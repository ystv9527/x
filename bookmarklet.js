/**
 * X内容采集书签脚本
 * 使用方法：在X推文页面点击此书签，自动提取内容
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

    /* 尝试多种选择器提取内容 */
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

    /* 如果没有提取到内容，使用页面标题 */
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
      date: new Date().toISOString().split('T')[0]
    };

    /* 打开本地添加页面，通过URL参数传递数据 */
    const params = new URLSearchParams(data);
    const addUrl = 'http://localhost:3000/add.html?' + params.toString();

    window.open(addUrl, '_blank', 'width=800,height=900');

  } catch (error) {
    alert('❌ 提取失败：' + error.message + '\n\n请确保：\n1. 在推文详情页使用\n2. 页面已完全加载\n3. 本地服务器正在运行');
    console.error('Bookmarklet error:', error);
  }
})();
