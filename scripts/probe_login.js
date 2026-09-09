const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const HA_URL = process.env.HA_URL || 'http://homeassistant.local:8123';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(HA_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.log(`retry ${i + 1}: ${e.message.split('\n')[0]}`);
      await page.waitForTimeout(2000);
    }
  }
  if (lastErr) throw lastErr;
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());
  const html = await page.evaluate(() => {
    function scan(root, out = [], depth = 0) {
      if (depth > 6) return out;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let n;
      while ((n = walker.nextNode())) {
        const tag = n.tagName.toLowerCase();
        if (['input', 'button', 'mwc-button', 'ha-auth-flow', 'ha-form', 'form', 'ha-auth-form'].includes(tag)) {
          out.push({
            tag,
            id: n.id,
            name: n.getAttribute('name'),
            type: n.getAttribute('type'),
            text: (n.textContent || '').trim().slice(0, 40),
            placeholder: n.getAttribute('placeholder'),
          });
        }
        if (n.shadowRoot) scan(n.shadowRoot, out, depth + 1);
      }
      return out;
    }
    return scan(document);
  });
  console.log('ELEMENTS:');
  html.forEach((e) => console.log(' ', JSON.stringify(e)));
  await page.screenshot({ path: path.join(ROOT, 'scripts', 'probe_login.png'), fullPage: true });
  console.log('Screenshot: ' + path.join(ROOT, 'scripts', 'probe_login.png'));
  await browser.close();
})();
