#!/usr/bin/env node
/** Shared static-link resolver used by build_nav.js and check_links.js. */
'use strict';

const fs = require('fs');
const path = require('path');

const SAFE_IGNORED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'data:']);

function extractAttributes(html) {
  return [...String(html).matchAll(/\b(href|src)\s*=\s*(["'])([\s\S]*?)\2/gi)].map((match) => ({
    attribute: match[1].toLowerCase(),
    raw: match[3].trim(),
  }));
}

function extractIds(html) {
  return new Set([...String(html).matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]));
}

function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function resolveInternalLink(root, sourceFile, raw, basePrefix = '/') {
  if (!raw) return { ignored: true };
  if (raw.startsWith('//')) return { ignored: true };

  const scheme = raw.match(/^([A-Za-z][A-Za-z0-9+.-]*:)/);
  if (scheme) {
    const normalized = scheme[1].toLowerCase();
    if (SAFE_IGNORED_SCHEMES.has(normalized)) return { ignored: true };
    return { error: `不允許的 URL scheme ${scheme[1]}` };
  }

  const hashAt = raw.indexOf('#');
  const fragment = hashAt >= 0 ? raw.slice(hashAt + 1) : '';
  const beforeHash = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const queryAt = beforeHash.indexOf('?');
  let pathname = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return { error: `URL path 含無效 percent encoding → ${raw}` };
  }

  let target;
  if (!pathname) {
    target = path.resolve(root, sourceFile);
  } else if (pathname.startsWith('/')) {
    let rootRelative = pathname;
    const normalizedPrefix = basePrefix && basePrefix !== '/' ? `/${basePrefix.replace(/^\/+|\/+$/g, '')}/` : '/';
    if (normalizedPrefix !== '/' && rootRelative.startsWith(normalizedPrefix)) {
      rootRelative = rootRelative.slice(normalizedPrefix.length - 1);
    }
    target = path.resolve(root, `.${rootRelative}`);
  } else {
    target = path.resolve(root, path.dirname(sourceFile), pathname);
  }

  if (!isInside(root, target)) return { error: `連結穿越網站根目錄 → ${raw}` };
  if (pathname.endsWith('/')) target = path.join(target, 'index.html');
  const relative = path.relative(root, target).split(path.sep).join('/');
  return { target, relative: relative || path.basename(sourceFile), fragment };
}

function validateHtmlLinks({ root, files, basePrefix = '/', readFile = null }) {
  const errors = [];
  const cache = new Map();
  const reader = readFile || ((relative) => fs.readFileSync(path.join(root, relative), 'utf8'));

  function load(relative) {
    if (!cache.has(relative)) {
      try { cache.set(relative, reader(relative)); } catch { cache.set(relative, null); }
    }
    return cache.get(relative);
  }

  for (const file of files) {
    const html = load(file);
    if (html === null) {
      errors.push(`${file}: 檔案不存在`);
      continue;
    }
    for (const { raw } of extractAttributes(html)) {
      const resolved = resolveInternalLink(root, file, raw, basePrefix);
      if (resolved.ignored) continue;
      if (resolved.error) {
        errors.push(`${file}: ${resolved.error}`);
        continue;
      }
      const targetHtml = load(resolved.relative);
      if (targetHtml === null) {
        errors.push(`${file}: 連結指向不存在的檔案 → ${raw}`);
        continue;
      }
      if (resolved.fragment) {
        let decodedFragment;
        try { decodedFragment = decodeURIComponent(resolved.fragment); } catch { decodedFragment = resolved.fragment; }
        if (!extractIds(targetHtml).has(decodedFragment)) {
          errors.push(`${file}: 連結 ${raw} 的 fragment 在 ${resolved.relative} 沒有對應 id`);
        }
      }
    }
  }
  return errors;
}

module.exports = {
  extractAttributes,
  extractIds,
  isInside,
  resolveInternalLink,
  validateHtmlLinks,
};
