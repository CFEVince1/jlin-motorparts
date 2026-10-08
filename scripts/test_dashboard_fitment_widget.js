const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STAFF_DASH_SCREENSHOT = path.join(__dirname, '..', 'screenshots', 'staff_dashboard_upper_fitment.png');
const STAFF_FITMENT_RESULTS_SCREENSHOT = path.join(__dirname, '..', 'screenshots', 'staff_dashboard_fitment_results.png');

async function testFitmentWidget() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  try {
    // 1. Login as staff (blaze)
    console.log('Logging in as staff (blaze)...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await page.type('input[placeholder="Username"]', 'blaze');
    await page.type('input[placeholder="Password"]', 'staff123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    
    // Wait for dashboard and compatibility options to load
    await new Promise(r => setTimeout(r, 2000));
    console.log('Capturing staff dashboard upper fitment widget...');
    await page.screenshot({ path: STAFF_DASH_SCREENSHOT });
    console.log('Saved: ' + STAFF_DASH_SCREENSHOT);

    // 2. Select Brand, Model, Version and click Check Fitment
    console.log('Testing fitment search interaction...');
    // Select first non-empty brand
    await page.evaluate(() => {
      const brandSelect = document.querySelectorAll('select')[0];
      if (brandSelect && brandSelect.options.length > 1) {
        brandSelect.selectedIndex = 1;
        brandSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 500));

    // Select first non-empty model
    await page.evaluate(() => {
      const modelSelect = document.querySelectorAll('select')[1];
      if (modelSelect && modelSelect.options.length > 1) {
        modelSelect.selectedIndex = 1;
        modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 500));

    // Select first non-empty version
    await page.evaluate(() => {
      const versionSelect = document.querySelectorAll('select')[2];
      if (versionSelect && versionSelect.options.length > 1) {
        versionSelect.selectedIndex = 1;
        versionSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 500));

    // Click Check Fitment button
    console.log('Clicking Check Fitment button...');
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('Check Fitment')) {
        await b.click();
        break;
      }
    }

    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: STAFF_FITMENT_RESULTS_SCREENSHOT });
    console.log('Saved results screenshot: ' + STAFF_FITMENT_RESULTS_SCREENSHOT);

  } catch (err) {
    console.error('Error in test:', err);
  } finally {
    await browser.close();
  }
}

testFitmentWidget();
