const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STAFF_SCREENSHOT = path.join(__dirname, '..', 'screenshots', 'staff_inventory_view_only.png');
const ADMIN_SCREENSHOT = path.join(__dirname, '..', 'screenshots', 'admin_inventory_full_access.png');

async function testRoles() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  try {
    // === 1. TEST AS STAFF (blaze / staff123) ===
    console.log('Logging in as staff (blaze)...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await page.type('input[placeholder="Username"]', 'blaze');
    await page.type('input[placeholder="Password"]', 'staff123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    
    await new Promise(r => setTimeout(r, 1500));
    console.log('Navigating to /inventory as staff...');
    await page.evaluate(() => {
      window.history.pushState({}, '', '/inventory');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ path: STAFF_SCREENSHOT });
    console.log('Saved staff view screenshot: ' + STAFF_SCREENSHOT);

    // Logout
    await page.evaluate(() => {
      localStorage.clear();
      window.location.href = '/login';
    });
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    // === 2. TEST AS ADMIN (admin / admin123) ===
    console.log('Logging in as admin (admin)...');
    await page.type('input[placeholder="Username"]', 'admin');
    await page.type('input[placeholder="Password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });

    await new Promise(r => setTimeout(r, 1500));
    console.log('Navigating to /inventory as admin...');
    await page.evaluate(() => {
      window.history.pushState({}, '', '/inventory');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ path: ADMIN_SCREENSHOT });
    console.log('Saved admin view screenshot: ' + ADMIN_SCREENSHOT);

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

testRoles();
