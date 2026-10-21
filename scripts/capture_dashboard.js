const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_PATH = path.join(__dirname, '..', 'screenshots', 'dashboard_top_1_to_5_fixed.png');

// DEV-ONLY SAFETY GUARD: Ensure capture scripts never point to a remote/production URL
const targetUrl = process.env.BASE_URL || 'http://localhost:5173';
const parsedUrl = new URL(targetUrl);
if (parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
  console.error('================================================================');
  console.error('⛔ REFUSAL: capture_dashboard.js is a local dev-only visual capture script.');
  console.error(`Target host "${parsedUrl.hostname}" is not localhost / 127.0.0.1.`);
  console.error('This script hardcodes local dev credentials and must never point at production.');
  console.error('================================================================');
  process.exit(1);
}

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  try {
    console.log('Logging in to dashboard...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
    await page.type('input[placeholder="Username"]', 'admin');
    await page.type('input[placeholder="Password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 10000 });
    
    // Wait for Dashboard data to load
    await new Promise(r => setTimeout(r, 2500));
    await page.screenshot({ path: SCREENSHOT_PATH });
    console.log('Screenshot saved to: ' + SCREENSHOT_PATH);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
}

capture();
