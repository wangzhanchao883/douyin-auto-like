// diagnose2.js - 深度诊断：CSS选择器点击 + 页面结构分析
const puppeteer = require('puppeteer-core');
const path = require('path');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

  console.log('1. 打开 douyin.com/jingxuan...');
  await page.goto('https://www.douyin.com/jingxuan', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  console.log('2. 分析页面结构...');
  const structure = await page.evaluate(() => {
    const info = { cards: [], links: [], overlays: [], scrollY: window.scrollY };

    // 所有卡片
    const allCards = document.querySelectorAll('.discover-video-card-item');
    info.totalCards = allCards.length;
    allCards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      // 卡片内的可点击元素
      const as = c.querySelectorAll('a');
      const videos = c.querySelectorAll('video');
      info.cards.push({
        index: i,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        links: as.length,
        videos: videos.length,
        // 卡片内的第一个可点击 target
        firstATag: as.length > 0 ? { href: as[0].href.substring(0, 80), text: (as[0].textContent || '').substring(0, 40) } : null,
      });
    });

    // 页面上的链接
    const allLinks = document.querySelectorAll('a[href*="video"], a[href*="note"]');
    allLinks.forEach(a => {
      info.links.push({ href: a.href.substring(0, 100), text: (a.textContent || '').substring(0, 30) });
    });

    // 覆盖层/弹窗
    const overlays = document.querySelectorAll('div[class*="mask"], div[class*="overlay"], div[class*="modal"]');
    overlays.forEach(o => {
      const r = o.getBoundingClientRect();
      if (r.width > 10 && r.height > 10 && window.getComputedStyle(o).display !== 'none') {
        info.overlays.push({ tag: o.tagName, classes: o.className.substring(0, 80), rect: { w: Math.round(r.width), h: Math.round(r.height) } });
      }
    });

    // 检查是否有 iframe
    info.iframes = document.querySelectorAll('iframe').length;

    return info;
  });

  console.log('页面结构:', JSON.stringify(structure, null, 2));

  // 如果有卡片，尝试用 select 方式点击
  if (structure.cards.length > 0) {
    const firstCard = structure.cards[0];
    
    // 方式1: 点击卡片内的第一个链接
    console.log('\n3. 方式1：点击卡片内的 <a> 标签...');
    await page.evaluate(() => {
      const firstCard = document.querySelector('.discover-video-card-item');
      if (firstCard) {
        const a = firstCard.querySelector('a');
        if (a) a.click();
      }
    });
    await sleep(3000);
    console.log('   当前 URL:', (await page.url()).substring(0, 80));
    
    // 看看有没有新标签页
    const pages = await browser.pages();
    console.log(`   已打开页面数: ${pages.length}`);
    if (pages.length > 1) {
      console.log('   新页面 URL:', (await pages[pages.length-1].url()).substring(0, 80));
    }

    // 回到 jingxuan
    if (page.url().includes('discover') || page.url().includes('video')) {
      await page.goBack({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await sleep(2000);
    }

    // 方式2: 用 page.click() 选择器
    console.log('\n4. 方式2：page.click() 选择器...');
    try {
      await page.click('.discover-video-card-item a, .discover-video-card-item video');
      console.log('   click 成功');
    } catch (e) {
      console.log('   click 失败:', e.message);
    }
    await sleep(3000);
    console.log('   当前 URL:', (await page.url()).substring(0, 80));

    if (page.url().includes('discover') || page.url().includes('video')) {
      await page.goBack({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await sleep(2000);
    }

    // 方式3: 在卡片上方 hover 一下再坐标点击
    console.log('\n5. 方式3：hover + 坐标点击...');
    const c = firstCard;
    const hoverX = c.rect.x + 10;
    const hoverY = c.rect.y + 10;
    await page.mouse.move(hoverX, hoverY, { steps: 5 });
    await sleep(500);
    await page.mouse.click(hoverX, hoverY, { delay: 100 });
    await sleep(3000);
    console.log('   当前 URL:', (await page.url()).substring(0, 80));

    if (page.url().includes('discover') || page.url().includes('video')) {
      await page.goBack({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await sleep(2000);
    }

    // 方式4: 用 page.evaluate 深入检查卡片是否有事件监听器
    console.log('\n6. 方式4：检查卡片的交互属性...');
    const cardAttrs = await page.evaluate(() => {
      const card = document.querySelector('.discover-video-card-item');
      if (!card) return 'no card found';
      return {
        tagName: card.tagName,
        className: card.className.substring(0, 200),
        id: card.id || '(none)',
        role: card.getAttribute('role') || '(none)',
        tabIndex: card.getAttribute('tabindex') || '(none)',
        cursor: window.getComputedStyle(card).cursor,
        onclick: typeof card.onclick,
        listeners: (typeof card.__reactProps !== 'undefined') ? 'has react props' : 'no react props detected',
        innerHTMLpreview: '...' + card.innerHTML.substring(0, 500) + '...',
      };
    });
    console.log(JSON.stringify(cardAttrs, null, 2));
  }

  console.log('\n===== 诊断完成 =====');
  await browser.close();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
