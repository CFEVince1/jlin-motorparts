const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function testDashboardAndPOS() {
  console.log('Capturing Dashboard and POS layouts...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  try {
    // 1. Login
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await page.type('input[placeholder="Username"]', 'admin');
    await page.type('input[placeholder="Password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });

    // 2. Dashboard
    await new Promise(r => setTimeout(r, 2000));
    const dashPath = path.join(SCREENSHOT_DIR, 'dashboard_with_best_sellers.png');
    await page.screenshot({ path: dashPath });
    console.log(`✅ Captured Dashboard screenshot: ${dashPath}`);

    // 3. POS
    await page.evaluate(() => {
      window.history.pushState({}, '', '/pos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await new Promise(r => setTimeout(r, 1500));
    const posPath = path.join(SCREENSHOT_DIR, 'pos_clean_layout.png');
    await page.screenshot({ path: posPath });
    console.log(`✅ Captured POS screenshot: ${posPath}`);

  } catch (err) {
    console.error('Error during testing:', err);
  } finally {
    await browser.close();
  }
}

testDashboardAndPOS();
