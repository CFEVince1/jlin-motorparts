const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DASHBOARD_KPIS = path.join(__dirname, '..', 'screenshots', 'admin_dashboard_net_profit_kpis.png');
const ADD_EXPENSE_MODAL = path.join(__dirname, '..', 'screenshots', 'admin_dashboard_add_expense_modal.png');
const DASHBOARD_AFTER_EXPENSE = path.join(__dirname, '..', 'screenshots', 'admin_dashboard_after_expense_added.png');
const REPORTS_KPIS = path.join(__dirname, '..', 'screenshots', 'admin_reports_net_profit_kpis.png');

async function testDashboardNetProfit() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  try {
    // 1. Login as admin
    console.log('Logging in as admin...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await page.type('input[placeholder="Username"]', 'admin');
    await page.type('input[placeholder="Password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    
    // Wait for Dashboard to load
    await new Promise(r => setTimeout(r, 2000));
    console.log('Capturing Admin Dashboard Upper Financial KPI cards...');
    await page.screenshot({ path: DASHBOARD_KPIS });
    console.log('Saved: ' + DASHBOARD_KPIS);

    // 2. Click "+ Add Expense"
    console.log('Clicking "+ Add Expense" button...');
    const buttons = await page.$$('button');
    let addExpBtn = null;
    for (const b of buttons) {
      const text = await (await b.getProperty('innerText')).jsonValue();
      if (text.includes('+ Add Expense')) {
        addExpBtn = b;
        break;
      }
    }
    if (addExpBtn) {
      await addExpBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({ path: ADD_EXPENSE_MODAL });
      console.log('Saved: ' + ADD_EXPENSE_MODAL);

      // Fill in demo expense
      console.log('Filling demo expense form...');
      const inputs = await page.$$('input.input-premium');
      // Inputs: title, amount, referenceNo
      for (const input of inputs) {
        const placeholder = await (await input.getProperty('placeholder')).jsonValue();
        if (placeholder.includes('e.g. Plastic rolls')) {
          await input.type('Packaging plastic wrap & tape');
        } else if (placeholder === '0.00') {
          await input.type('200');
        } else if (placeholder.includes('Optional reference')) {
          await input.type('DEMO-WRAP-001');
        }
      }

      // Submit
      const submitButtons = await page.$$('button[type="submit"]');
      if (submitButtons.length > 0) {
        await submitButtons[0].click();
        await new Promise(r => setTimeout(r, 1500));
        await page.screenshot({ path: DASHBOARD_AFTER_EXPENSE });
        console.log('Saved: ' + DASHBOARD_AFTER_EXPENSE);
      }
    }

    // 3. Navigate to /reports
    console.log('Navigating to /reports...');
    await page.evaluate(() => {
      window.history.pushState({}, '', '/reports');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: REPORTS_KPIS });
    console.log('Saved: ' + REPORTS_KPIS);

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await browser.close();
  }
}

testDashboardNetProfit();
