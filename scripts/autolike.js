const puppeteer = require('puppeteer-core');
const path = require('path');

// ====================== 配置 ======================
const CFG = {
  minWatchMs: 4000,
  maxWatchMs: 8000,
  skipRate: 0.15,
  likeBatch: 10,
  minPauseMs: 300000,     // 5min
  maxPauseMs: 600000,     // 10min
  maxRunMs: 7200000,      // 2h
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  playerWaitMs: 15000,    // 最多等15秒让播放器加载
  playerCheckInterval: 1000,
};

// ====================== 工具 ======================
const startTime = Date.now();
let totalLikes = 0, totalSkips = 0, batchCount = 0;
let totalVideos = 0, consecutiveFails = 0;

function log(m) { console.log(`[${new Date().toLocaleTimeString()}] ${m}`); }
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ====================== 检测已赞 ======================
async function isLiked(page) {
  try {
    return await page.evaluate(() => {
      const d = document.querySelector('[data-e2e="video-player-digg"]');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      if (r.width < 5) return null;
      for (const p of d.querySelectorAll('svg path')) {
        const s = (p.getAttribute('d') || '').toLowerCase();
        if ((s.match(/m/g)||[]).length > 2 && (s.match(/c/g)||[]).length > 2) {
          const f = (p.getAttribute('fill')||'').toLowerCase();
          if (f && f!=='none' && f!=='transparent') return true;
          const st = (p.getAttribute('stroke')||'').toLowerCase();
          if (st && st!=='none' && st!=='transparent') return true;
        }
      }
      return false;
    });
  } catch { return null; }
}

async function doLike(page) {
  try {
    return await page.evaluate(() => {
      const d = document.querySelector('[data-e2e="video-player-digg"]');
      if (!d) return false;
      d.click();
      return true;
    });
  } catch { return false; }
}

// ====================== 等待弹窗出现 + 播放器就绪 ======================
async function waitForModalAndPlayer(page) {
  const start = Date.now();
  let modalDetected = false;
  while (Date.now() - start < CFG.playerWaitMs) {
    try {
      const state = await page.evaluate(() => {
        const url = window.location.href;
        const inModal = url.includes('modal_id=');
        const digg = document.querySelector('[data-e2e="video-player-digg"]');
        let diggOk = false;
        if (digg) {
          const r = digg.getBoundingClientRect();
          diggOk = r.width > 5 && r.height > 5;
        }
        return { inModal, diggOk };
      });
      if (state.inModal) modalDetected = true;
      if (state.inModal && state.diggOk) return true;
    } catch {}
    if (!modalDetected) await sleep(200);
    else await sleep(CFG.playerCheckInterval);
  }
  return false;
}

// ====================== 打开视频（hover + 点击卡片）======================
async function openVideo(page, cardIndex) {
  const info = await page.evaluate((idx) => {
    const cards = document.querySelectorAll('.discover-video-card-item');
    if (idx >= cards.length) return null;
    const c = cards[idx];
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y) };
  }, cardIndex);
  if (!info) return false;

  await page.mouse.move(info.x + 10, info.y + 10, { steps: 10 });
  await sleep(rand(300, 700));
  await page.mouse.click(info.x + 10, info.y + 10, { delay: rand(50, 150) });
  await sleep(800);
  return true;
}

// ====================== 关闭弹窗 ======================
async function closeModal(page) {
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  await sleep(1000);
  // 如果还没关掉，尝试点击左上角区域
  const stillInModal = await page.evaluate(() => window.location.href.includes('modal_id=')).catch(() => false);
  if (stillInModal) {
    await page.mouse.click(50, 50);
    await sleep(1500);
  }
}

// ====================== 滚动加载 ======================
async function scrollFeed(page) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy({ top: 700, behavior: 'smooth' }));
    await sleep(1200);
  }
}

// ====================== 确保在推荐流 ======================
async function ensureFeed(page) {
  const url = await page.url();
  if (url.includes('jingxuan') && !url.includes('modal_id')) return true;
  log('📍 回到推荐流...');
  await page.goto('https://www.douyin.com/jingxuan', { waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(3000);
  return true;
}

// ====================== 找一个可见卡片 ======================
async function findVisibleCards(page) {
  return await page.evaluate(() => {
    const all = document.querySelectorAll('.discover-video-card-item');
    const h = window.innerHeight;
    const r = [];
    all.forEach((c, i) => {
      const rect = c.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50 && rect.y > -100 && rect.y < h + 100) r.push(i);
    });
    return r;
  });
}

// ====================== 主循环 ======================
async function run() {
  log('========================================');
  log('  抖音自动点赞 v7（一赞一关版）');
  log(`  观看 ${CFG.minWatchMs/1000}-${CFG.maxWatchMs/1000}s`);
  log(`  每 ${CFG.likeBatch} 赞暂停 ${CFG.minPauseMs/60000}-${CFG.maxPauseMs/60000}min`);
  log('========================================');

  const userDataDir = path.join(__dirname, '..', 'chrome-profile');
  const browser = await puppeteer.launch({
    executablePath: CFG.chromePath,
    headless: false,
    userDataDir,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled',
           '--window-size=1400,900', '--disable-notifications'],
    defaultViewport: null,
  });

  const page = (await browser.pages())[0];
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  log('打开 douyin.com/jingxuan ...');
  await page.goto('https://www.douyin.com/jingxuan', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  // 登录检测
  const needLogin = await page.evaluate(() => !!document.querySelector('.login-guide')).catch(() => false);
  if (needLogin) {
    log('⚠️ 请在浏览器中登录（60s 超时）');
    try {
      await page.waitForFunction(() => !document.querySelector('.login-guide'), { timeout: 60000 });
      log('✅ 登录成功');
    } catch { log('⏰ 登录超时'); }
  }

  // ====================== 主循环 ======================
  while (Date.now() - startTime < CFG.maxRunMs) {
    // 批量暂停
    if (batchCount >= CFG.likeBatch) {
      const t = rand(CFG.minPauseMs, CFG.maxPauseMs);
      log(`⏸ 休息 ${(t/60000).toFixed(1)}min（已赞 ${totalLikes}）`);
      await sleep(t);
      log('▶️ 继续');
      batchCount = 0;
    }

    // 连续失败保护
    if (consecutiveFails >= 5) {
      log('🔄 连续失败，刷新...');
      await page.goto('https://www.douyin.com/jingxuan', { waitUntil: 'networkidle2', timeout: 20000 });
      await sleep(3000);
      consecutiveFails = 0;
    }

    try {
      // 确保在推荐流
      await ensureFeed(page);

      // 找可见卡片
      const visible = await findVisibleCards(page);
      if (visible.length === 0) {
        log('📺 无卡片，滚动...');
        await scrollFeed(page);
        continue;
      }

      // 随机跳过
      if (Math.random() < CFG.skipRate) {
        totalSkips++;
        log(`⏭ 跳过 #${totalVideos + 1}`);
        totalVideos++;
        // 跳到下一个卡片需要先关掉可能存在的弹窗
        continue;
      }

      // 选卡片（优先选不在屏幕中间的，更像人类）
      const pick = visible[rand(0, visible.length - 1)];
      log(`🎬 打开卡片 #${pick}`);

      // 打开视频弹窗
      const opened = await openVideo(page, pick);
      if (!opened) { consecutiveFails++; continue; }

      // 等待播放器加载
      const ready = await waitForModalAndPlayer(page);
      if (!ready) {
        consecutiveFails++;
        log(`⚠️ 播放器未加载 (${consecutiveFails})`);
        await closeModal(page);
        continue;
      }

      consecutiveFails = 0;
      totalVideos++;

      // 观看
      const watchMs = rand(CFG.minWatchMs, CFG.maxWatchMs);
      log(`👀 #${totalVideos} 观看 ${(watchMs/1000).toFixed(1)}s...`);
      await sleep(watchMs);

      // 点赞
      const liked = await isLiked(page);
      if (liked === null) {
        log('⚠️ 检测不到点赞按钮');
      } else if (liked) {
        log('❤️ 已赞过');
      } else {
        const ok = await doLike(page);
        if (ok) {
          totalLikes++; batchCount++;
          log(`👍 点赞成功 #${totalLikes}`);
          await sleep(rand(1000, 3000));
        } else {
          log('❌ 点赞失败');
        }
      }

      // 关闭弹窗
      log('❌ 关闭弹窗');
      await closeModal(page);

      // 滚动加载
      await scrollFeed(page);

    } catch (err) {
      log(`❌ 错误: ${err.message}`);
      consecutiveFails++;
      await sleep(3000);
      try { await page.goto('https://www.douyin.com/jingxuan', { waitUntil: 'networkidle2', timeout: 15000 }); } catch {}
      await sleep(2000);
    }
  }

  log('\n========================================');
  log(`📊 运行结束`);
  log(`👁 处理: ${totalVideos}`);
  log(`👍 点赞: ${totalLikes}`);
  log(`⏭ 跳过: ${totalSkips}`);
  log(`⏱ 时长: ${((Date.now()-startTime)/3600000).toFixed(1)}h`);
  log('========================================');
  await browser.close();
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
