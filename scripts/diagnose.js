// diagnose.js - 诊断点击卡片后发生了什么
const puppeteer = require('puppeteer-core');
const path = require('path');

async function run() {
  const userDataDir = path.join(__dirname, '..', 'chrome-profile');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    userDataDir,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1400,900'],
    defaultViewport: null,
  });

  const page = (await browser.pages())[0];
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

  console.log('打开 douyin.com/discover...');
  await page.goto('https://www.douyin.com/discover', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // 打印当前 URL 和页面标题
  console.log('当前 URL:', page.url());
  console.log('页面标题:', await page.title());

  // 检查视频卡片
  const cards = await page.evaluate(() => {
    const result = [];
    const allCards = document.querySelectorAll('.discover-video-card-item');
    const h = window.innerHeight;
    for (const card of allCards) {
      const r = card.getBoundingClientRect();
      if (r.width > 50 && r.height > 50 && r.y > -100 && r.y < h + 100) {
        // 获取卡片上的一些信息
        const text = card.textContent.substring(0, 50);
        result.push({ cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2), text });
      }
    }
    return result.slice(0, 3);
  });
  console.log(`找到 ${cards.length} 张视频卡片:`, JSON.stringify(cards, null, 2));

  if (cards.length === 0) {
    console.log('没有卡片，检查页面...');
    const html = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
    console.log('页面 HTML (前2000字):', html);
    await browser.close();
    return;
  }

  // 逐个点击，记录每次的变化
  for (let i = 0; i < Math.min(3, cards.length); i++) {
    console.log(`\n===== 点击卡片 #${i+1} =====`);
    
    const urlBefore = page.url();
    console.log('点击前 URL:', urlBefore);

    // 监听导航事件
    let navDetected = false;
    let navUrl = '';
    const navHandler = (n) => { navDetected = true; navUrl = n.url(); };
    page.on('framenavigated', navHandler);

    // 点击
    await page.mouse.click(cards[i].cx, cards[i].cy, { delay: 100 });
    console.log('已点击，等待 5 秒观察...');

    // 等待并观察
    for (let s = 1; s <= 5; s++) {
      await new Promise(r => setTimeout(r, 1000));
      const urlNow = page.url();
      const urlChanged = urlNow !== urlBefore;
      
      // 尝试查找播放器
      const playerInfo = await page.evaluate(() => {
        const digg = document.querySelector('[data-e2e="video-player-digg"]');
        const diggRect = digg ? digg.getBoundingClientRect() : null;
        
        // 查找视频详情页的元素
        const videoDetail = document.querySelector('.video-info-detail');
        const likeBtn = document.querySelector('[data-e2e="digg-icon"]') || 
                       document.querySelector('.like-wrapper') ||
                       document.querySelector('[class*="digg"]') ||
                       document.querySelector('[class*="like"]');
        
        return {
          hasDigg: !!digg,
          diggVisible: diggRect ? (diggRect.width > 5 && diggRect.height > 5) : false,
          hasVideoDetail: !!videoDetail,
          hasLikeBtn: !!likeBtn,
          bodyClasses: document.body.className.substring(0, 200),
          url: window.location.href,
        };
      }).catch(e => ({ error: e.message }));

      console.log(`  ${s}s: URL变化=${urlChanged ? '是 → ' + urlNow.substring(0, 60) : '否'} | 导航事件=${navDetected} | 播放器=${JSON.stringify(playerInfo)}`);
    }

    page.off('framenavigated', navHandler);

    // 如果发生了导航，回退
    if (page.url() !== urlBefore) {
      console.log('导航后回退...');
      await page.goBack({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    // Esc 关闭可能的弹窗
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n===== 诊断完成 =====');
  await browser.close();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
