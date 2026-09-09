#!/usr/bin/env node
'use strict';

/**
 * Local browser acceptance matrix for the public static site.
 *
 * Usage:
 *   npm ci
 *   npx playwright install chromium
 *   npm run responsive
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_ROOT = (process.env.SITE_ROOT || '').replace(/^[./]+|[/]+$/g, '');
if (SITE_ROOT && (!/^[A-Za-z0-9_-]+$/.test(SITE_ROOT) || !fs.existsSync(path.join(ROOT, SITE_ROOT)))) {
  throw new Error(`Invalid SITE_ROOT: ${process.env.SITE_ROOT}`);
}
const CONTENT_ROOT = SITE_ROOT ? path.join(ROOT, SITE_ROOT) : ROOT;
const CHAPTERS = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'chapters.json'), 'utf8'));
const pagePath = (file) => SITE_ROOT ? `${SITE_ROOT}/${file}` : file;
const PUBLIC_HTML = [
  pagePath('index.html'),
  pagePath(CHAPTERS.hub.catalog),
  ...CHAPTERS.chapters.map((chapter) => pagePath(chapter.file)),
  ...CHAPTERS.hub.pages.map(pagePath),
  ...(!SITE_ROOT ? ['404.html'] : []),
];
const VIEWPORTS = [
  { name: 'desktop', width: 1200, height: 900 },
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-320', width: 320, height: 720 },
];
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const SCREENSHOT_DIR = path.join(ARTIFACTS_DIR, 'responsive', SITE_ROOT || 'root');
const REPORT_PATH = path.join(ARTIFACTS_DIR, `responsive-report${SITE_ROOT ? `.${SITE_ROOT}` : ''}.json`);
const EXPECTED_PAGE_COUNT = SITE_ROOT ? 27 : 28;
const EXPECTED_LANGUAGE = CHAPTERS.site.htmlLang || CHAPTERS.site.lang || (SITE_ROOT || 'zh-Hant-TW');

function chapterFileByNumber(chapters, number) {
  const expected = String(number);
  const chapter = chapters.find((candidate) => new RegExp(`^0*${expected}$`).test(String(candidate.num).trim()));
  return chapter ? chapter.file : null;
}

const chapter17Name = chapterFileByNumber(CHAPTERS.chapters, 17);
const CHAPTER_17_FILE = chapter17Name ? pagePath(chapter17Name) : null;
const TARGET_SELECTOR = [
  'a.nav-link',
  'a.button',
  'button',
  '.sidebar .brand',
  '.sidebar .hub-link',
  '.sidebar ol li > a',
  '.sidebar .toc-in-chapter a',
  '.pager a:not(.disabled)',
].join(',');
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function publicPathFor(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded === '/') return 'index.html';
  if (SITE_ROOT && decoded === `/${SITE_ROOT}/`) return `${SITE_ROOT}/index.html`;
  const relative = decoded.replace(/^\/+/, '');
  if (relative.includes('\0') || relative.split('/').includes('..')) return null;
  if (PUBLIC_HTML.includes(relative)) return relative;
  if (relative.startsWith('assets/') || ['favicon.svg', 'robots.txt', 'sitemap.xml'].includes(relative)) {
    return relative;
  }
  return null;
}

function sendFile(response, file, status) {
  const extension = path.extname(file).toLowerCase();
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': MIME[extension] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  if (response.req.method === 'HEAD') {
    response.end();
    return;
  }
  fs.createReadStream(file).pipe(response);
}

function startServer() {
  const notFoundFile = path.join(ROOT, '404.html');
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method Not Allowed');
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    const relative = publicPathFor(url.pathname);
    const file = relative ? path.resolve(ROOT, relative) : null;
    const insideRoot = file && (file === ROOT || file.startsWith(`${ROOT}${path.sep}`));
    if (insideRoot && fs.existsSync(file) && fs.statSync(file).isFile()) {
      sendFile(response, file, 200);
      return;
    }
    sendFile(response, notFoundFile, 404);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function pathForPage(file) {
  if (file === 'index.html') return '/';
  if (SITE_ROOT && file === `${SITE_ROOT}/index.html`) return `/${SITE_ROOT}/`;
  return `/${file}`;
}

function screenshotName(file, viewportName, chapter17File = CHAPTER_17_FILE) {
  if (file === 'index.html' && viewportName === 'desktop') return 'index-desktop.png';
  if (file === 'index.html' && viewportName === 'mobile-320') return 'index-320.png';
  if (chapter17File && file === chapter17File && viewportName === 'mobile-360') return 'ch17-360.png';
  if (file === 'prompts.html' && viewportName === 'mobile-360') return 'prompts-360.png';
  return null;
}

function reportScreenshotPaths(records) {
  return records.map((record) => record.screenshot).filter(Boolean);
}

async function inspectPage(page) {
  return page.evaluate((targetSelector) => {
    function selectorFor(element) {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        if (current.classList.length) {
          part += [...current.classList].slice(0, 3).map((name) => `.${CSS.escape(name)}`).join('');
        }
        const parent = current.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((sibling) => sibling.tagName === current.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    }

    const root = document.documentElement;
    const styleLink = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find((link) => new URL(link.href, location.href).pathname.endsWith('/assets/css/style.css'));
    const siteSheet = [...document.styleSheets]
      .find((sheet) => sheet.href && new URL(sheet.href, location.href).pathname.endsWith('/assets/css/style.css'));
    let siteRuleCount = -1;
    try {
      siteRuleCount = siteSheet ? siteSheet.cssRules.length : -1;
    } catch {
      siteRuleCount = -1;
    }
    const mdiLink = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find((link) => /@mdi\/font@[^/]+\/css\/materialdesignicons\.min\.css/.test(link.href));
    const h1 = document.querySelector('h1');
    const bodyStyle = getComputedStyle(document.body);
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const customStyle = getComputedStyle(root);

    const overflows = [];
    if (root.scrollWidth > root.clientWidth + 1) {
      for (const element of document.querySelectorAll('body *')) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const style = getComputedStyle(element);
        const extendsViewport = rect.right > root.clientWidth + 1 || rect.left < -1;
        const spillsContent = element.scrollWidth > element.clientWidth + 1 && !['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX);
        if (!extendsViewport && !spillsContent) continue;
        overflows.push({
          selector: selectorFor(element),
          text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          rect: {
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
          },
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: style.overflowX,
        });
        if (overflows.length >= 20) break;
      }
    }

    const undersizedTargets = [];
    for (const element of document.querySelectorAll(targetSelector)) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
      if (rect.width + 0.5 < 44 || rect.height + 0.5 < 44) {
        undersizedTargets.push({
          selector: selectorFor(element),
          label: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        });
      }
    }

    return {
      title: document.title,
      language: document.documentElement.lang,
      heading: h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : '',
      css: {
        linkPresent: Boolean(styleLink),
        sheetPresent: Boolean(siteSheet),
        ruleCount: siteRuleCount,
      },
      mdiLinkPresent: Boolean(mdiLink),
      styles: {
        bodyFontFamily: bodyStyle.fontFamily,
        headingFontFamily: h1Style ? h1Style.fontFamily : '',
        fontBodyVariable: customStyle.getPropertyValue('--font-body').trim(),
        fontDisplayVariable: customStyle.getPropertyValue('--font-display').trim(),
      },
      dimensions: {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
      },
      overflows,
      checkedTargets: [...document.querySelectorAll(targetSelector)].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }).length,
      undersizedTargets,
    };
  }, TARGET_SELECTOR);
}

function assertionFailures(record) {
  const failures = [];
  if (record.status !== 200) failures.push(`HTML response was ${record.status}, expected 200`);
  if (!record.cssResponse200) failures.push('assets/css/style.css did not return HTTP 200');
  if (!record.dom.css.linkPresent || !record.dom.css.sheetPresent || record.dom.css.ruleCount <= 0) {
    failures.push('site stylesheet was not present and parsed');
  }
  if (!record.dom.mdiLinkPresent) failures.push('pinned Material Design Icons stylesheet link is missing');
  if (!record.dom.heading) failures.push('page has no h1');
  if (record.dom.language !== EXPECTED_LANGUAGE) {
    failures.push(`document language was ${record.dom.language || '(empty)'}, expected ${EXPECTED_LANGUAGE}`);
  }
  if (!record.dom.styles.bodyFontFamily.includes('Outfit') || !record.dom.styles.fontBodyVariable.includes('Outfit')) {
    failures.push('body font declarations do not include Outfit');
  }
  if (!record.dom.styles.headingFontFamily.includes('Poppins') || !record.dom.styles.fontDisplayVariable.includes('Poppins')) {
    failures.push('heading font declarations do not include Poppins');
  }
  if (record.pageErrors.length) failures.push(`${record.pageErrors.length} pageerror event(s)`);
  if (record.siteConsoleErrors.length) failures.push(`${record.siteConsoleErrors.length} site console error(s)`);
  if (record.dom.dimensions.scrollWidth > record.dom.dimensions.clientWidth + 1) {
    failures.push(`document overflows horizontally (${record.dom.dimensions.scrollWidth} > ${record.dom.dimensions.clientWidth} + 1)`);
  }
  if (record.dom.undersizedTargets.length) failures.push(`${record.dom.undersizedTargets.length} marked target(s) smaller than 44×44px`);
  return failures;
}

async function validatePage(browser, baseUrl, file, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  const pageErrors = [];
  const siteConsoleErrors = [];
  const ignoredThirdPartyConsoleErrors = [];
  const externalRequestFailures = [];
  let cssResponse200 = false;

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    let host = '';
    try {
      host = location.url ? new URL(location.url).hostname : '';
    } catch {
      host = '';
    }
    const entry = { text: message.text().slice(0, 300), source: location.url ? host || 'local' : 'inline' };
    if (host && host !== '127.0.0.1' && host !== 'localhost') ignoredThirdPartyConsoleErrors.push(entry);
    else siteConsoleErrors.push(entry);
  });
  page.on('requestfailed', (request) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url());
    } catch {
      return;
    }
    if (!['127.0.0.1', 'localhost'].includes(requestUrl.hostname)) {
      externalRequestFailures.push({
        host: requestUrl.hostname,
        resourceType: request.resourceType(),
        error: request.failure() ? request.failure().errorText : 'unknown',
      });
    }
  });
  page.on('response', (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.hostname === '127.0.0.1' && responseUrl.pathname === '/assets/css/style.css' && response.status() === 200) {
      cssResponse200 = true;
    }
  });

  const response = await page.goto(`${baseUrl}${pathForPage(file)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(150);
  const dom = await inspectPage(page);
  const name = screenshotName(file, viewport.name);
  let screenshot = null;
  if (name) {
    const screenshotPath = path.join(SCREENSHOT_DIR, name);
    await page.screenshot({ path: screenshotPath, fullPage: file === 'index.html' });
    screenshot = path.relative(ROOT, screenshotPath).split(path.sep).join('/');
  }

  const record = {
    file,
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
    status: response ? response.status() : null,
    cssResponse200,
    pageErrors,
    siteConsoleErrors,
    ignoredThirdPartyConsoleErrors,
    externalRequestFailures,
    dom,
    screenshot,
    failures: [],
  };
  record.failures = assertionFailures(record);
  await context.close();
  return record;
}

async function validateNotFound(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const requestPath = '/missing/path';
  const response = await page.goto(`${baseUrl}${requestPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  const nestedContract = await page.evaluate(() => {
    const style = document.querySelector('link[rel="stylesheet"][href="/assets/css/style.css"]');
    const localLinks = [...document.querySelectorAll('a[href]')]
      .map((link) => link.getAttribute('href'))
      .filter((href) => href && !href.startsWith('#') && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href));
    return {
      stylePath: style ? style.getAttribute('href') : null,
      localLinks,
      allLocalLinksRootRelative: localLinks.every((href) => href.startsWith('/')),
    };
  });
  const result = {
    path: requestPath,
    status: response ? response.status() : null,
    hasNodeRedBrand: /WoowTech|Node-RED/i.test(body),
    has404Message: /404|找不到這一頁/.test(body),
    rootRelativeStyle: nestedContract.stylePath === '/assets/css/style.css',
    allLocalLinksRootRelative: nestedContract.allLocalLinksRootRelative,
    failures: [],
  };
  if (result.status !== 404) result.failures.push(`response was ${result.status}, expected 404`);
  if (!result.hasNodeRedBrand) result.failures.push('Node-RED branding is missing');
  if (!result.has404Message) result.failures.push('branded 404 message is missing');
  if (!result.rootRelativeStyle) result.failures.push('nested 404 shared stylesheet is not root-relative');
  if (!result.allLocalLinksRootRelative) result.failures.push(`nested 404 local links are not root-relative: ${nestedContract.localLinks.join(', ')}`);
  await context.close();
  return result;
}

async function main() {
  const { chromium } = require('playwright');
  if (PUBLIC_HTML.length !== EXPECTED_PAGE_COUNT || new Set(PUBLIC_HTML).size !== PUBLIC_HTML.length) {
    throw new Error(`Expected ${EXPECTED_PAGE_COUNT} unique public HTML pages, found ${PUBLIC_HTML.length} (${new Set(PUBLIC_HTML).size} unique)`);
  }
  for (const file of PUBLIC_HTML) {
    if (!fs.existsSync(path.join(ROOT, file))) throw new Error(`Public page is missing: ${file}`);
  }

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const records = [];
  let notFound;
  try {
    for (const viewport of VIEWPORTS) {
      for (const file of PUBLIC_HTML) {
        const record = await validatePage(browser, baseUrl, file, viewport);
        records.push(record);
        const mark = record.failures.length ? 'FAIL' : 'PASS';
        console.log(`${mark} ${viewport.width}px ${file}${record.failures.length ? ` — ${record.failures.join('; ')}` : ''}`);
      }
    }
    notFound = SITE_ROOT ? { skipped: true, failures: [] } : await validateNotFound(browser, baseUrl);
    if (!SITE_ROOT) console.log(`${notFound.failures.length ? 'FAIL' : 'PASS'} HTTP 404 ${notFound.path}${notFound.failures.length ? ` — ${notFound.failures.join('; ')}` : ''}`);
  } finally {
    await browser.close();
    await closeServer(server);
  }

  const failedRecords = records.filter((record) => record.failures.length);
  const report = {
    generatedAt: new Date().toISOString(),
    publicPages: PUBLIC_HTML,
    viewports: VIEWPORTS,
    summary: {
      pages: PUBLIC_HTML.length,
      viewports: VIEWPORTS.length,
      matrixCases: records.length,
      passedCases: records.length - failedRecords.length,
      failedCases: failedRecords.length,
      overflowingCases: records.filter((record) => record.dom.overflows.length).length,
      undersizedTargetCases: records.filter((record) => record.dom.undersizedTargets.length).length,
      pageErrorCases: records.filter((record) => record.pageErrors.length).length,
      siteConsoleErrorCases: records.filter((record) => record.siteConsoleErrors.length).length,
      externalRequestFailureCases: records.filter((record) => record.externalRequestFailures.length).length,
    },
    notFound,
    screenshots: reportScreenshotPaths(records),
    records,
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${path.relative(ROOT, REPORT_PATH)}`);
  console.log(`Matrix: ${report.summary.passedCases}/${report.summary.matrixCases} passed; 404 ${SITE_ROOT ? 'skipped' : notFound.failures.length ? 'failed' : 'passed'}`);
  if (failedRecords.length || notFound.failures.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { chapterFileByNumber, screenshotName, reportScreenshotPaths };
