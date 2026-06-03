// diagnose3.js - 诊断弹窗模态内的结构
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

  // 找到第一张可见卡片并 hover
  const firstCard = await page.evaluate(() => {
    const card = document.querySelector('.discover-video-card-item');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });

  console.log('第一张卡片:', firstCard);

  // hover
  await page.mouse.move(firstCard.x + 10, firstCard.y + 10, { steps: 10 });
  await sleep(800);

  // 点击
  console.log('2. 点击卡片...');
  await page.mouse.click(firstCard.x + 10, firstCard.y + 10, { delay: 100 });
  await sleep(3000);
  console.log('当前 URL:', (await page.url()).substring(0, 100));

  // 检查是否在弹窗模式
  const url = await page.url();
  const hasModal = url.includes('modal_id=');

  if (hasModal) {
    console.log('3. ✅ 弹窗已打开！');

    // 等待弹窗完全渲染 (弹窗动画可能需额外时间)
    await sleep(3000);

    // 探测弹窗内所有可能的播放器元素
    const modalContent = await page.evaluate(() => {
      const result = { selectors: {}, allButtons: [], allDataE2E: [], allSvgClasses: [] };

      // 检查 data-e2e 元素
      const e2eElements = document.querySelectorAll('[data-e2e]');
      const counts = {};
      e2eElements.forEach(el => {
        const attr = el.getAttribute('data-e2e');
        counts[attr] = (counts[attr] || 0) + 1;
        // 只记录前几个
        if (Object.keys(counts).length <= 30) {
          const r = el.getBoundingClientRect();
          result.allDataE2E.push({
            name: attr,
            visible: r.width > 5 && r.height > 5,
            rect: { w: Math.round(r.width), h: Math.round(r.height) },
            tag: el.tagName,
            text: (el.textContent || '').substring(0, 30),
          });
        }
      });
      result.selectorCount = counts;

      // 找所有按钮
      const buttons = document.querySelectorAll('button, [role="button"], [class*="digg"], [class*="like"], [class*="zan"]');
      buttons.forEach((b, i) => {
        const r = b.getBoundingClientRect();
        if (r.width > 10 && r.height > 10) {
          result.allButtons.push({
            index: i,
            tag: b.tagName,
            className: (b.className || '').substring(0, 80),
            rect: { w: Math.round(r.width), h: Math.round(r.height) },
            visible: r.width > 5 && r.height > 5,
          });
        }
      });

      // 弹窗容器
      const modalWrap = document.querySelector('[class*="modal"], [class*="overlay"], [class*="mask"], [class*="popup"], [class*="container"]');
      if (modalWrap) {
        const r = modalWrap.getBoundingClientRect();
        result.modalContainer = {
          classes: (modalWrap.className || '').substring(0, 150),
          rect: { w: Math.round(r.width), h: Math.round(r.height) },
        };
      }

      // 获取 body 上的所有大尺寸 div
      const bodyDivs = document.querySelectorAll('body > div');
      bodyDivs.forEach((d, i) => {
        const r = d.getBoundingClientRect();
        if (r.width > 100 && r.height > 100) {
          result[`bodyDiv_${i}`] = {
            classes: (d.className || '').substring(0, 100),
            rect: { w: Math.round(r.width), h: Math.round(r.height) },
          };
        }
      });

      return result;
    });

    console.log('弹窗结构:', JSON.stringify(modalContent, null, 2));

    // 尝试找到点赞按钮并点击
    console.log('\n4. 尝试找到点赞按钮...');
    
    // 先找一个已知的点赞按钮选择器
    const likeFound = await page.evaluate(() => {
      // 尝试多个选择器
      const selectors = [
        '[data-e2e="video-player-digg"]',
        '[data-e2e="digg-icon"]',
        '.like-wrapper',
        '[class*="digg"]',
        'svg[class*="like"]',
        '[class*="thumbs"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const r = el.getBoundingClientRect();
          const tag = el.tagName;
          const cls = (el.className || '').substring(0, 60);
          return { selector: sel, visible: r.width > 5, rect: { w: Math.round(r.width), h: Math.round(r.height) }, tag, cls };
        }
      }
      return null;
    });
    
    console.log('点赞按钮查找结果:', JSON.stringify(likeFound, null, 2));

    // 如果没有找到，打印整个 body 的大致结构
    if (!likeFound) {
      console.log('\n5. body 内部结构 (前5000字符):');
      const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 5000));
      console.log(bodyHtml);
    }

  } else {
    console.log('❌ 弹窗未打开，URL:', url);
  }

  console.log('\n===== 诊断完成 =====');
  await browser.close();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
