#!/usr/bin/env node
/** Authored-table migrations shared by the generator and regression tests. */
'use strict';

function setScope(attributes, scope) {
  if (/\bscope\s*=\s*(["'])[^"']*\1/i.test(attributes)) {
    return attributes.replace(/\bscope\s*=\s*(["'])[^"']*\1/i, `scope="${scope}"`);
  }
  return ` scope="${scope}"${attributes}`;
}

function columnCount(table) {
  const thead = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead\s*>/i);
  if (!thead) return 0;
  const rows = [...thead[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];
  return rows.reduce((maximum, row) => {
    const count = [...row[1].matchAll(/<(?:th|td)\b([^>]*)>/gi)].reduce((total, cell) => {
      const colspan = Number((cell[1].match(/\bcolspan\s*=\s*(["'])(\d+)\1/i) || [])[2] || 1);
      return total + (Number.isInteger(colspan) && colspan > 0 ? colspan : 1);
    }, 0);
    return Math.max(maximum, count);
  }, 0);
}

function scopeBodyRows(table) {
  const columns = columnCount(table);
  return table.replace(/<tbody\b([^>]*)>([\s\S]*?)<\/tbody\s*>/gi, (tbody, tbodyAttrs, body) => {
    const rows = body.replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi, (row, rowAttrs, cells) => {
      const first = cells.match(/^(\s*(?:<!--[\s\S]*?-->\s*)*)<(td|th)\b([^>]*)>([\s\S]*?)<\/\2\s*>/i);
      if (!first) return row;
      const [, prefix, tag, attrs, contents] = first;
      const colspanMatch = attrs.match(/\bcolspan\s*=\s*(["'])(\d+)\1/i);
      const colspan = Number((colspanMatch || [])[2] || 1);
      if (tag.toLowerCase() === 'td' && colspanMatch && columns > 0 && colspan >= columns) return row;
      const replacement = `${prefix}<th${setScope(attrs, 'row')}>${contents}</th>`;
      return `<tr${rowAttrs}>${replacement}${cells.slice(first[0].length)}</tr>`;
    });
    return `<tbody${tbodyAttrs}>${rows}</tbody>`;
  });
}

function repairAndScopeTableHeaders(table) {
  const repaired = table.replace(/<th\s+scope\s*=\s*(["'])col\1ead\s*>/gi, '<thead>');
  const columnScoped = repaired.replace(/<thead\b([^>]*)>([\s\S]*?)<\/thead\s*>/gi,
    (thead, attrs, body) => `<thead${attrs}>${body.replace(/<th\b([^>]*)>/gi,
      (header, headerAttrs) => `<th${setScope(headerAttrs, 'col')}>`)}</thead>`);
  return scopeBodyRows(columnScoped);
}

module.exports = { repairAndScopeTableHeaders };
