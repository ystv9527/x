/**
 * X内容采集书签脚本 - 调试版本
 * 输出提取的所有信息，包括图片URL
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

    // 提取作者信息
    const authorElement = document.querySelector('[data-testid="User-Name"] span') ||
                         document.querySelector('article a[role="link"] span');
    if (authorElement) {
      author = authorElement.textContent.trim();
    }

    // 提取图片 - 多种选择器
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
        if (src.includes('?')) {
          src = src.split('?')[0] + '?format=jpg&name=large';
        }
        if (src && !images.includes(src) && src.includes('pbs.twimg.com')) {
          images.push(src);
        }
      });
      if (images.length > 0) break;
    }

    if (!tweetText) {
      tweetText = document.title;
    }

    // 输出调试信息
    console.log('=== X Content Extraction Debug Info ===');
    console.log('Title:', tweetText.substring(0, 100));
    console.log('Author:', author);
    console.log('URL:', url);
    console.log('Images found:', images.length);
    images.forEach((img, index) => {
      console.log(`Image ${index + 1}:`, img);
    });
    console.log('=====================================');

    // 在页面上显示信息
    const debugInfo = `
=== DEBUG INFO ===
Images: ${images.length}
${images.map((url, i) => `\n[Image ${i+1}]\n${url}`).join('\n')}
`;

    alert('✅ 调试信息已输出到浏览器控制台\n\n按 F12 打开开发者工具，在 Console 标签页查看完整的图片URL\n\n' + debugInfo);

  } catch (error) {
    alert('❌ 提取失败：' + error.message);
    console.error('Bookmarklet error:', error);
  }
})();
