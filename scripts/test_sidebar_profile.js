const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DASHBOARD_SCREENSHOT = path.join(__dirname, '..', 'screenshots', 'sidebar_profile_card_dashboard.png');
const PROFILE_SCREENSHOT = path.join(__dirname, '..', 'screenshots', 'sidebar_profile_card_navigated.png');

async function test() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  try {
    console.log('Logging in to test sidebar...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await page.type('input[placeholder="Username"]', 'admin');
    await page.type('input[placeholder="Password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    
    // 1. Dashboard screenshot showing new bottom card & removed duplicate My Profile
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: DASHBOARD_SCREENSHOT });
    console.log('Dashboard screenshot captured: ' + DASHBOARD_SCREENSHOT);

    // 2. Click the user card NavLink at the bottom of the sidebar
    console.log('Clicking bottom profile card...');
    await page.click('a[title="View & Edit Profile"]');
    await new Promise(r => setTimeout(r, 1500));
    
    console.log('Current URL after click:', page.url());
    await page.screenshot({ path: PROFILE_SCREENSHOT });
    console.log('Profile screen screenshot captured: ' + PROFILE_SCREENSHOT);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

test();
