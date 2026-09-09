'use strict';

const CC_BY_4_DEED = /^https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/deed\.[a-z-]+$/i;

function licenseDeedUrls(html) {
  const urls = [];
  for (const tag of String(html).matchAll(/<(?:a|link)\b[^>]*>/gi)) {
    const href = tag[0].match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
    if (href && CC_BY_4_DEED.test(href[2])) urls.push(href[2]);
  }
  return urls;
}

function normalizeLicenseDeedForParity(url) {
  return CC_BY_4_DEED.test(url || '')
    ? 'https://creativecommons.org/licenses/by/4.0/deed.<locale>'
    : url;
}

function localizeLicenseDeeds(html, localeUrl) {
  if (!CC_BY_4_DEED.test(localeUrl || '')) {
    throw new Error('localeUrl must be an exact CC BY 4.0 localized deed URL');
  }
  return String(html).replace(/<(?:a|link)\b[^>]*>/gi, (tag) => tag.replace(
    /\bhref\s*=\s*(["'])(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/deed\.[a-z-]+)\1/i,
    (attribute, quote) => attribute.replace(/https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/deed\.[a-z-]+/i, localeUrl),
  ));
}

module.exports = { licenseDeedUrls, localizeLicenseDeeds, normalizeLicenseDeedForParity };
