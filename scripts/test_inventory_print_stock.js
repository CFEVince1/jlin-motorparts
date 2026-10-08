const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const STAFF_INVENTORY_HEADER = path.join(__dirname, '..', 'screenshots', 'staff_inventory_print_buttons.png');
const STAFF_OUT_OF_STOCK_MODAL = path.join(__dirname, '..', 'screenshots', 'staff_inventory_out_of_stock_modal.png');
const STAFF_IN_STOCK_MODAL = path.join(__dirname, '..', 'screenshots', 'staff_inventory_in_stock_modal.png');

async function testPrintStock() {
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
    
    // Navigate to /inventory
    await new Promise(r => setTimeout(r, 1000));
    console.log('Navigating to /inventory as staff...');
    await page.evaluate(() => {
      window.history.pushState({}, '', '/inventory');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await new Promise(r => setTimeout(r, 2000));

    // Capture inventory page with Print Stock buttons
    await page.screenshot({ path: STAFF_INVENTORY_HEADER });
    console.log('Saved header screenshot: ' + STAFF_INVENTORY_HEADER);

    // 2. Click "Print Stock/Out of Stock"
    console.log('Clicking Print Stock/Out of Stock button...');
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('Print Stock/Out of Stock')) {
        await b.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: STAFF_OUT_OF_STOCK_MODAL });
    console.log('Saved Out of Stock Modal screenshot: ' + STAFF_OUT_OF_STOCK_MODAL);

    // 3. Switch tab to "In-Stock Only"
    console.log('Switching to In-Stock Only filter tab in modal...');
    const modalButtons = await page.$$('button');
    for (const b of modalButtons) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('In-Stock Only')) {
        await b.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: STAFF_IN_STOCK_MODAL });
    console.log('Saved In-Stock Modal screenshot: ' + STAFF_IN_STOCK_MODAL);

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

testPrintStock();
