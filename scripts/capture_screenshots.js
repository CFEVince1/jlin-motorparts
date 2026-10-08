const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function captureAllModules() {
  console.log('Launching Edge browser...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  try {
    // 1. LOGIN PAGE
    console.log('\n[1/11] Capturing Login Page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login_page.png') });

    // Login via UI
    console.log('Logging in as admin...');
    await page.type('input[placeholder="Username"]', 'admin');
    await page.type('input[placeholder="Password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Wait for URL to leave /login
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    console.log('Logged in successfully! Landed on:', page.url());

    // SPA helper: use React Router or in-page navigation without hard reloads losing localStorage
    const navigateTo = async (routePath) => {
      await page.evaluate((p) => {
        window.history.pushState({}, '', p);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, routePath);
      await new Promise(r => setTimeout(r, 1500));
    };

    // 2. SALES (POS)
    console.log('\n[2/11] Capturing Sales (POS) Page...');
    await navigateTo('/pos');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_sales_pos.png') });

    // 3. TRANSACTIONS
    console.log('\n[3/11] Capturing Transactions Page...');
    await navigateTo('/transactions');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_transactions.png') });

    // Open View Receipt modal
    const viewButtons = await page.$$('button');
    for (const btn of viewButtons) {
      const text = await page.evaluate(el => el.innerText, btn);
      if (text.includes('View Receipt')) {
        console.log('Clicking View Receipt modal...');
        await btn.click();
        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03b_transaction_receipt_modal.png') });
        const closeBtn = await page.$('.receipt-overlay button.no-print');
        if (closeBtn) await closeBtn.click();
        await new Promise(r => setTimeout(r, 500));
        break;
      }
    }

    // 4. FITMENT SEARCH
    console.log('\n[4/11] Capturing Fitment Search Page...');
    await navigateTo('/compatibility-search');
    const selects = await page.$$('select');
    if (selects.length >= 3) {
      // 1. Select Yamaha
      await selects[0].select('Yamaha');
      await new Promise(r => setTimeout(r, 600));

      // 2. Select Aerox 155
      const updatedSelects = await page.$$('select');
      const modelOptions = await page.evaluate(el => Array.from(el.options).map(o => o.value).filter(Boolean), updatedSelects[1]);
      if (modelOptions.length > 0) {
        await updatedSelects[1].select(modelOptions[0]);
        await new Promise(r => setTimeout(r, 600));

        // 3. Select Version
        const updatedSelects2 = await page.$$('select');
        const verOptions = await page.evaluate(el => Array.from(el.options).map(o => o.value).filter(Boolean), updatedSelects2[2]);
        if (verOptions.length > 0) {
          await updatedSelects2[2].select(verOptions[0]);
          await new Promise(r => setTimeout(r, 600));

          // 4. Click Check Compatibility
          const searchBtn = await page.$('button.btn-primary');
          if (searchBtn) {
            await searchBtn.click();
            await new Promise(r => setTimeout(r, 1200));
          }
        }
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_fitment_search.png') });

    // 5. STOCK RECEIVE
    console.log('\n[5/11] Capturing Stock Receive Page...');
    await navigateTo('/stock-receive');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_stock_receive.png') });

    // 6. SUPPLIERS
    console.log('\n[6/11] Capturing Suppliers Page...');
    await navigateTo('/suppliers');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_suppliers.png') });

    // 7. INVENTORY
    console.log('\n[7/11] Capturing Inventory Page...');
    await navigateTo('/inventory');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_inventory.png') });

    // 8. PRODUCT DIRECTORY
    console.log('\n[8/11] Capturing Product Directory Page...');
    await navigateTo('/products');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_product_directory.png') });

    // 9. DISCREPANCY AUDIT (ADJUSTMENTS REPORT)
    console.log('\n[9/11] Capturing Discrepancy Audit Page...');
    await navigateTo('/reports/adjustments');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_discrepancy_audit.png') });

    // 10. COMPATIBILITY RULES
    console.log('\n[10/11] Capturing Compatibility Rules Page...');
    await navigateTo('/manage-compatibility');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_compatibility_rules.png') });

    // 11. MANAGE USERS
    console.log('\n[11/11] Capturing Manage Users Page...');
    await navigateTo('/users');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_manage_users.png') });

    console.log('\nAll 11 modules successfully captured with live authentication!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    await browser.close();
  }
}

captureAllModules();
