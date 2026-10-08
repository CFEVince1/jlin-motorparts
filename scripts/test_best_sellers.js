const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function testBestSellersBar() {
  console.log('Testing BestSellersBar on POS in Edge browser...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  try {
    // Login
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await page.type('input[placeholder="Username"]', 'admin');
    await page.type('input[placeholder="Password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });

    // Navigate to /pos
    await page.evaluate(() => {
      window.history.pushState({}, '', '/pos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await new Promise(r => setTimeout(r, 2000));

    // Capture screenshot of POS with BestSellersBar
    const shotPath = path.join(SCREENSHOT_DIR, 'pos_with_best_sellers.png');
    await page.screenshot({ path: shotPath });
    console.log(`✅ Saved screenshot to ${shotPath}`);

    // Test clicking a best-seller card to add to cart
    console.log('Testing 1-click add to cart from BestSellersBar...');
    const cardAdded = await page.evaluate(() => {
      const widget = document.querySelector('.best-sellers-widget');
      if (!widget) return false;
      const cards = widget.querySelectorAll('div[class*="relative flex flex-col"]');
      if (cards.length > 0) {
        cards[0].click();
        return true;
      }
      return false;
    });

    if (cardAdded) {
      await new Promise(r => setTimeout(r, 1000));
      const shotPath2 = path.join(SCREENSHOT_DIR, 'pos_best_seller_added_to_cart.png');
      await page.screenshot({ path: shotPath2 });
      console.log(`✅ Clicked best-seller card! Saved cart screenshot to ${shotPath2}`);
    }

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
  }
}

testBestSellersBar();
