#!/usr/bin/env node
/** Structural and editorial checks for generated tutorial chapters. */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SITE_ROOT = (process.env.SITE_ROOT || '').replace(/^[./]+|[/]+$/g, '');
const CONTENT_ROOT = SITE_ROOT ? path.join(ROOT, SITE_ROOT) : ROOT;
const sourceLockPath = path.join(ROOT, 'docs', 'research', 'source-lock.json');
let sourceLock;
try {
  sourceLock = JSON.parse(fs.readFileSync(sourceLockPath, 'utf8'));
} catch (error) {
  console.error(`✗ source lock 不是有效 JSON：${error.message}`);
  process.exit(1);
}
const SOURCE_SCOPES = new Map((Array.isArray(sourceLock.sources) ? sourceLock.sources : [])
  .filter((source) => source && typeof source.exactCommitUrl === 'string' && source.exactCommitUrl.startsWith('https://'))
  .map((source) => [source.exactCommitUrl, new Set(
    (Array.isArray(source.allowedChapterNumbers) ? source.allowedChapterNumbers : [])
      .filter(Number.isInteger),
  )]));
const cfg = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'chapters.json'), 'utf8'));
const chapters = Array.isArray(cfg.chapters) ? cfg.chapters : [];
const listed = new Set(chapters.map((chapter) => chapter.file));
const listedPaths = new Set([...listed].map((file) => path.resolve(CONTENT_ROOT, file)));
const chaptersByPath = new Map(chapters.map((chapter) => [path.resolve(CONTENT_ROOT, chapter.file), chapter]));
const chapterNumbersByPath = new Map(chapters.map((chapter) => [
  path.resolve(CONTENT_ROOT, chapter.file),
  Number(chapter.num),
]));
const args = process.argv.slice(2);
const fixtureArg = args.find((arg) => arg.startsWith('--fixture='));
const fixtureSizeCheck = args.includes('--check-size');
const localeEq = args.find((arg) => arg.startsWith('--locale='));
const localeAt = args.indexOf('--locale');
const locale = (localeEq && localeEq.slice('--locale='.length)) || (localeAt >= 0 && args[localeAt + 1])
  || cfg.site.lang || (SITE_ROOT || 'zh-TW');
const positional = args.filter((arg, index) => !arg.startsWith('--') && !(localeAt >= 0 && index === localeAt + 1));
const enforceSourceLock = !fixtureArg;
const MIN_AUTHORED_BYTES = 15 * 1024;
const localeRulesPath = path.join(ROOT, 'data', `content-rules.${locale}.json`);
const contentRulesPath = fs.existsSync(localeRulesPath) ? localeRulesPath : path.join(ROOT, 'data', 'content-rules.json');
let contentRules = null;
try {
  contentRules = JSON.parse(fs.readFileSync(contentRulesPath, 'utf8'));
} catch (error) {
  console.error(`✗ content rules (${locale}) 不是有效 JSON：${error.message}`);
  process.exit(1);
}

function resolveFiles() {
  if (fixtureArg) return [fixtureArg.slice('--fixture='.length)];
  if (positional.length) return positional;
  return [...listed];
}
function countDirectListItems(body) {
  let listDepth = 0;
  let count = 0;
  for (const match of String(body).matchAll(/<(\/?)\s*(ol|ul|li)\b[^>]*>/gi)) {
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    if ((tag === 'ol' || tag === 'ul') && !closing) listDepth += 1;
    else if ((tag === 'ol' || tag === 'ul') && closing) listDepth = Math.max(0, listDepth - 1);
    else if (tag === 'li' && !closing && listDepth === 1) count += 1;
  }
  return count;
}

const files = resolveFiles();
const css = fs.readFileSync(path.join(ROOT, 'assets/css/style.css'), 'utf8');
const validIcons = new Set([...css.matchAll(/section h2\[data-icon="([^"]+)"\]::before/g)].map((match) => match[1]));
const errors = [];
if (!chapters.length) errors.push('chapters.json: chapters 必須是非空陣列');
chapters.forEach((chapter, index) => {
  if (!chapter || !['authored', 'planned'].includes(chapter.status)) {
    errors.push(`chapters.json: chapters[${index}].status 必須是 authored 或 planned`);
  }
});
if (fixtureSizeCheck && !fixtureArg) errors.push('--check-size 只可搭配 repository 內的 --fixture 使用');
const emoji = /\p{Extended_Pictographic}/u;
const forbiddenTerms = Array.isArray(contentRules.forbiddenTerms) ? contentRules.forbiddenTerms : [];
if (!forbiddenTerms.length) errors.push('data/content-rules.json: forbiddenTerms 不可為空');
const compiledForbiddenTerms = [];
for (const rule of forbiddenTerms) {
  if (!rule || typeof rule.pattern !== 'string' || !rule.pattern || typeof rule.label !== 'string' || !rule.label) {
    errors.push(`${path.relative(ROOT, contentRulesPath)}: forbiddenTerms 每筆必須有 pattern 與 label`);
    continue;
  }
  try { compiledForbiddenTerms.push({ ...rule, expression: new RegExp(rule.pattern, rule.flags || '') }); } catch {
    errors.push(`${path.relative(ROOT, contentRulesPath)}: forbiddenTerms pattern 無效（${rule.label}）`);
  }
}

function checkTerminology(rel, visibleText, prose = true, localeOverride = locale) {
  const normalized = visibleText.replace(/\s+/g, ' ');
  for (const rule of compiledForbiddenTerms) {
    if (rule.expression.test(normalized)) errors.push(`${rel}: ${rule.label}`);
  }
  if (!prose) return;
  for (const match of normalized.matchAll(/Node-RED(?:\s+本身)?\s*(?:v(?:ersion)?\s*)?22\.0\.1/gi)) {
    const prefix = normalized.slice(Math.max(0, match.index - 45), match.index);
    if (!/(?:Add-on|Community App|社群附加元件)\s*[:：]?\s*$/i.test(prefix)
      && !/(?:不要|不可|禁止|錯誤)[^。.!?]{0,12}(?:稱|寫成)?[「"']?\s*$/i.test(prefix)
      && !/(?:do not|don't|must not|incorrect(?:ly)?|wrong(?:ly)?)(?:\s+\w+){0,8}\s*[“"']?\s*$/i.test(prefix)) {
      errors.push(`${rel}: Node-RED 版本誤植；22.0.1 是 Add-on 版本`);
    }
  }
  if (/(?:Node-RED\s+)?Add-on(?:\s+本身)?\s*(?:v(?:ersion)?\s*)?5\.0\.2/i.test(normalized)) {
    errors.push(`${rel}: Add-on 版本誤植；5.0.2 是 Node-RED 版本`);
  }
  const versionStatements = normalized.split(/(?:[。！？!?]\s*|\.\s+)/);
  for (const statement of versionStatements) {
    if (/Node-RED\s+(?:v(?:ersion)?\s*)?5\.0\.4/i.test(statement)
      && /(?:production|current|baseline|embedded|bundled|正式|目前|當前|現行|基線|內建|預裝)/i.test(statement)
      && !/(?:\blater\b|\bfuture\b|not\s+(?:the\s+)?(?:embedded\s+)?baseline|not\s+(?:currently\s+)?(?:embedded|bundled)|較新|後續|未來|不是[^。.!?]{0,12}基線|非[^。.!?]{0,12}基線|並非[^。.!?]{0,12}(?:內建|基線))/i.test(statement)) {
      errors.push(`${rel}: Node-RED 5.0.4 不得宣稱為目前內建基線`);
    }
  }
  const sentences = normalized.split(/(?<=[。！？.!?])\s*/);
  for (const sentence of sentences) {
    if (/Call Service/i.test(sentence) && !/(?:Action|舊版|legacy)/i.test(sentence)) {
      errors.push(`${rel}: Call Service 必須搭配 Action／舊版脈絡`);
    }
    const describesInstalledFlowFuse = /FlowFuse/i.test(sentence)
      && /(?:已安裝|預裝|作為[^。.!?]*內建|installed|bundled)/i.test(sentence)
      && !/(?:不是|並非|非)預裝|非[^。.!?]{0,20}bundled|not bundled/i.test(sentence);
    const flowFuseBoundary = /^en(?:-|$)/i.test(localeOverride)
      ? /optional/i.test(sentence) && /not bundled/i.test(sentence)
      : /選裝/.test(sentence) && /(?:非內建|不是.*內建|未綁定)/.test(sentence);
    if (describesInstalledFlowFuse && !flowFuseBoundary) {
      errors.push(`${rel}: FlowFuse 必須標示選裝且非內建／optional and not bundled`);
    }
  }
}

for (const input of files) {
  const filePath = path.resolve(CONTENT_ROOT, input);
  const rel = path.relative(CONTENT_ROOT, filePath);
  const insideRoot = rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
  if (!insideRoot) {
    errors.push(`${input}: 路徑不可離開 repository root`);
    continue;
  }
  if (!fs.existsSync(filePath)) { errors.push(`${input}: 檔案不存在`); continue; }
  const realPath = fs.realpathSync(filePath);
  const realRel = path.relative(CONTENT_ROOT, realPath);
  const realInsideRoot = realRel === '' || (!realRel.startsWith(`..${path.sep}`) && realRel !== '..' && !path.isAbsolute(realRel));
  if (!realInsideRoot) {
    errors.push(`${input}: resolved path 不可離開 repository root`);
    continue;
  }
  if (!fixtureArg && positional.length && !listedPaths.has(filePath)) {
    errors.push(`${input}: positional 模式只接受 chapters.json 列出的精確章節路徑`);
    continue;
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const chapter = chaptersByPath.get(filePath);
  const authoredRelease = Boolean(chapter && chapter.status === 'authored');
  if ((authoredRelease || (fixtureArg && fixtureSizeCheck)) && Buffer.byteLength(html, 'utf8') < MIN_AUTHORED_BYTES) {
    errors.push(`${rel}: authored/release 章節必須至少 ${MIN_AUTHORED_BYTES} UTF-8 bytes`);
  }
  if (authoredRelease || fixtureArg) {
    const tableOpenCount = (html.match(/<table\b/gi) || []).length;
    const tableCloseCount = (html.match(/<\/table\s*>/gi) || []).length;
    if (tableOpenCount !== tableCloseCount) errors.push(`${rel}: <table> opening/closing tags 必須配對`);
    if (/<th\s+scope\s*=\s*(["'])col\1ead\s*>/i.test(html)) {
      errors.push(`${rel}: 不得包含損壞的 <th scope="col"ead> token`);
    }
    for (const table of html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table\s*>/gi)) {
      const attrs = table[1];
      const body = table[2];
      const classValue = (attrs.match(/\bclass\s*=\s*(["'])([^"']*)\1/i) || [])[2] || '';
      if (!classValue.split(/\s+/).includes('data-table')) {
        errors.push(`${rel}: 每個 <table> 都必須包含 class="data-table"`);
      }
      if (/\bstyle\s*=/i.test(attrs)) errors.push(`${rel}: <table> 不得使用 inline style`);
      const before = html.slice(Math.max(0, table.index - 300), table.index);
      const wrapper = before.match(/<div\b([^>]*)>\s*$/i);
      const wrapperAttrs = wrapper ? wrapper[1] : '';
      const wrapperClass = (wrapperAttrs.match(/\bclass\s*=\s*(["'])([^"']*)\1/i) || [])[2] || '';
      if (!wrapperClass.split(/\s+/).includes('table-scroll')
        || !/\brole\s*=\s*(["'])region\1/i.test(wrapperAttrs)
        || !/\btabindex\s*=\s*(["'])0\1/i.test(wrapperAttrs)
        || !/\baria-label\s*=\s*(["'])[^"']+\1/i.test(wrapperAttrs)) {
        errors.push(`${rel}: 每個資料表必須由可聚焦且具 aria-label 的 table-scroll region 包覆`);
      }
      const theadOpenCount = (body.match(/<thead\b[^>]*>/gi) || []).length;
      const theadCloseCount = (body.match(/<\/thead\s*>/gi) || []).length;
      const thead = body.match(/<thead\b[^>]*>([\s\S]*?)<\/thead\s*>/i);
      if (theadOpenCount !== 1 || theadCloseCount !== 1 || !thead) {
        errors.push(`${rel}: 每個資料表必須包含一組配對的 <thead> 與 </thead>`);
      } else {
        const headHeaders = [...thead[1].matchAll(/<th\b([^>]*)>/gi)];
        if (!/<tr\b[^>]*>/i.test(thead[1]) || headHeaders.length === 0) {
          errors.push(`${rel}: 每個資料表的欄標題 <th> 必須位於 <thead> 的資料列內`);
        }
        for (const heading of headHeaders) {
          if (!/\bscope\s*=\s*(["'])col\1/i.test(heading[1])) {
            errors.push(`${rel}: <thead> 的每個欄標題都必須包含 scope="col"`);
          }
        }
      }

      const columnCount = thead ? [...thead[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)]
        .reduce((maximum, row) => Math.max(maximum,
          [...row[1].matchAll(/<(?:th|td)\b([^>]*)>/gi)].reduce((total, cell) => {
            const span = Number((cell[1].match(/\bcolspan\s*=\s*(["'])(\d+)\1/i) || [])[2] || 1);
            return total + (Number.isInteger(span) && span > 0 ? span : 1);
          }, 0)), 0) : 0;
      const tbodies = [...body.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/gi)];
      for (const tbody of tbodies) {
        for (const row of tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
          const cells = [...row[1].matchAll(/<(th|td)\b([^>]*)>[\s\S]*?<\/\1\s*>/gi)];
          if (!cells.length) continue;
          const first = cells[0];
          const firstSpanMatch = first[2].match(/\bcolspan\s*=\s*(["'])(\d+)\1/i);
          const firstSpan = Number((firstSpanMatch || [])[2] || 1);
          const spanningSpecialRow = first[1].toLowerCase() === 'td' && cells.length === 1 && firstSpanMatch
            && columnCount > 0 && firstSpan >= columnCount;
          if (first[1].toLowerCase() === 'td' && !spanningSpecialRow) {
            errors.push(`${rel}: <tbody> 一般資料列的第一格必須是 scope="row" 的 <th>`);
          }
          cells.forEach((cell, index) => {
            if (cell[1].toLowerCase() !== 'th') return;
            if (index !== 0 || !/\bscope\s*=\s*(["'])row\1/i.test(cell[2])) {
              errors.push(`${rel}: <tbody> 的列標題只可位於第一格且必須包含 scope="row"`);
            }
          });
        }
      }
      const knownHeaders = (thead ? (thead[1].match(/<th\b[^>]*>/gi) || []).length : 0)
        + tbodies.reduce((count, tbody) => count + (tbody[1].match(/<th\b[^>]*>/gi) || []).length, 0);
      if ((body.match(/<th\b[^>]*>/gi) || []).length !== knownHeaders) {
        errors.push(`${rel}: <th> 只可位於 <thead> 欄標題或 <tbody> 第一格列標題`);
      }
    }
    if (/\sstyle\s*=\s*(["'])/i.test(html)) errors.push(`${rel}: authored content 不得使用 inline style`);
  }
  const sections = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)];
  if (sections.length < 8 || sections.length > 12) errors.push(`${rel}: section 數量為 ${sections.length}，必須介於 8–12`);

  const ids = [];
  const byId = new Map();
  for (const section of sections) {
    const attrs = section[1];
    const body = section[2];
    const id = (attrs.match(/\bid="([A-Za-z0-9_]+)"/) || [])[1];
    const nav = (attrs.match(/\bdata-nav="([^"]+)"/) || [])[1];
    if (!id) errors.push(`${rel}: section 缺少合法 id`);
    else { ids.push(id); byId.set(id, body); }
    if (!nav) errors.push(`${rel}: section ${id || '(無 id)'} 缺少 data-nav`);
    const h2 = body.match(/<h2\b([^>]*)>/i);
    if (!h2) { errors.push(`${rel}: section ${id || '(無 id)'} 缺少 h2`); continue; }
    const icon = (h2[1].match(/\bdata-icon="([^"]+)"/) || [])[1];
    if (!icon) errors.push(`${rel}: section ${id || '(無 id)'} 的 h2 缺 data-icon`);
    else if (!validIcons.has(icon)) errors.push(`${rel}: data-icon="${icon}" 未定義於 style.css`);
  }
  [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].forEach((id) => errors.push(`${rel}: 重複 section id="${id}"`));

  const faqBody = byId.get('faq');
  if (!faqBody) {
    errors.push(`${rel}: 缺少 id="faq" section`);
  } else {
    const faqEntries = [...faqBody.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/gi)]
      .filter((entry) => {
        const className = (entry[1].match(/\bclass\s*=\s*(["'])([^"']*)\1/i) || [])[2] || '';
        return className.split(/\s+/).includes('faq');
      });
    if (faqEntries.length < 4) errors.push(`${rel}: faq section 只有 ${faqEntries.length} 則 FAQ，至少需要 4 則`);
    faqEntries.forEach((entry, index) => {
      const firstSummary = entry[2].match(/^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
      const question = firstSummary ? firstSummary[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!firstSummary || !/[?？]$/.test(question)) {
        errors.push(`${rel}: FAQ ${index + 1} 的完整問題（含問號）必須位於第一個 summary 內`);
      }
    });
  }

  const troubleshootBody = byId.get('troubleshoot');
  if (!troubleshootBody) {
    errors.push(`${rel}: 缺少 id="troubleshoot" section`);
  } else if (countDirectListItems(troubleshootBody) < 4) {
    errors.push(`${rel}: troubleshoot 只有 ${countDirectListItems(troubleshootBody)} 個頂層清單項目，至少需要 4 個`);
  }

  const stepsBody = byId.get('steps');
  if (!stepsBody) {
    errors.push(`${rel}: 缺少 id="steps" section`);
  } else {
    const ol = stepsBody.match(/<ol\b[^>]*\bclass="[^"]*\bsteps\b[^"]*"[^>]*>([\s\S]*?)<\/ol>/i);
    if (!ol) errors.push(`${rel}: steps section 必須包含 <ol class="steps">`);
    else if (countDirectListItems(ol[0]) < 4) errors.push(`${rel}: steps 只有 ${countDirectListItems(ol[0])} 個頂層步驟，至少需要 4 步`);
  }

  const sourcesBody = byId.get('sources');
  if (!sourcesBody) {
    errors.push(`${rel}: 缺少 id="sources" section`);
  } else {
    const hrefs = [...sourcesBody.matchAll(/\bhref\s*=\s*(["'])(https:\/\/[^"'\s]+)\1/gi)]
      .map((match) => match[2]);
    if (!hrefs.length) errors.push(`${rel}: sources section 至少需要一個 https 來源`);
    if (enforceSourceLock) {
      const chapterNumber = chapterNumbersByPath.get(filePath);
      const citedLockedSources = hrefs.filter((href) => SOURCE_SCOPES.has(href));
      const hasAllowedSource = Number.isInteger(chapterNumber)
        && citedLockedSources.some((href) => SOURCE_SCOPES.get(href).has(chapterNumber));
      if (!hasAllowedSource) {
        errors.push(`${rel}: sources section 至少需要一個章節範圍允許的 source lock exact commit 來源`);
      }
      if (Number.isInteger(chapterNumber)) {
        for (const href of new Set(citedLockedSources)) {
          if (!SOURCE_SCOPES.get(href).has(chapterNumber)) {
            errors.push(`${rel}: source lock exact commit 來源不允許用於第 ${chapterNumber} 章`);
          }
        }
      }
    }
  }

  const withoutExecutableText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const visibleText = withoutExecutableText.replace(/<[^>]+>/g, ' ');
  if (emoji.test(visibleText)) errors.push(`${rel}: 內容含 emoji`);
  if (contentRules.forbidPoliteYou && /您/.test(visibleText)) errors.push(`${rel}: 請使用「你」，不要使用「您」`);
  checkTerminology(rel, visibleText);
  const uriAndMetaTags = (withoutExecutableText.match(/<(?:a|area|base|form|iframe|img|link|meta|source|video)\b[^>]*>/gi) || []).join(' ');
  checkTerminology(rel, uriAndMetaTags, false);
}

// Editorial product locks apply to tracked publishable/research text, except approved comparison plans.
if (!SITE_ROOT && !fixtureArg && !positional.length) {
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  if (tracked.status !== 0) errors.push('無法取得 git tracked files 以執行 terminology scan');
  else {
    const alreadyChecked = new Set(files.map((file) => path.resolve(ROOT, file)));
    const editorialExtensions = new Set(['.html', '.md', '.json', '.xml', '.yml', '.yaml']);
    for (const trackedFile of tracked.stdout.split('\0').filter(Boolean)) {
      if (trackedFile.startsWith('docs/plans/') || trackedFile.startsWith('tests/') || trackedFile.startsWith('scripts/')
        || /^data\/content-rules(?:\.[A-Za-z0-9-]+)?\.json$/.test(trackedFile)
        || !editorialExtensions.has(path.extname(trackedFile).toLowerCase())) continue;
      const filePath = path.resolve(ROOT, trackedFile);
      if (alreadyChecked.has(filePath) || !fs.existsSync(filePath)) continue;
      const rawText = fs.readFileSync(filePath, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');
      const text = rawText.replace(/<[^>]+>/g, ' ');
      const trackedLocale = trackedFile.startsWith('en/') ? 'en' : locale;
      checkTerminology(trackedFile, text, path.extname(trackedFile).toLowerCase() !== '.json', trackedLocale);
      if (path.extname(trackedFile).toLowerCase() === '.html') {
        const uriAndMetaTags = (rawText.match(/<(?:a|area|base|form|iframe|img|link|meta|source|video)\b[^>]*>/gi) || []).join(' ');
        checkTerminology(trackedFile, uriAndMetaTags, false, trackedLocale);
      }
    }
  }
}

if (errors.length) {
  console.error(`✗ check_content 發現 ${errors.length} 個問題`);
  errors.forEach((error) => console.error(`  · ${error}`));
  process.exit(1);
}
const mode = fixtureArg ? 'fixture' : positional.length ? 'positional' : 'global';
const authoredCount = files.filter((file) => {
  const chapter = chaptersByPath.get(path.resolve(ROOT, file));
  return chapter && chapter.status === 'authored';
}).length;
console.log(`✓ check_content (${mode})：${files.length} 個檔案符合內容結構規格；${authoredCount} 個 authored 章節通過 release invariants`);
