'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

// Everything the tool writes lives here (WhatsApp session, sent log, scraper binary, results).
const DATA = process.env.M2W_DATA || path.join(os.homedir(), '.maps2whatsapp');
fs.mkdirSync(DATA, { recursive: true });

// Full RFC-4180 style parser: handles quoted commas, escaped quotes and newlines inside quotes.
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...rest] = rows;
  if (!h) return [];
  return rest.filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

function toCsv(rows, fields) {
  const esc = v => { v = String(v ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return [fields.join(','), ...rows.map(r => fields.map(f => esc(r[f])).join(','))].join('\n') + '\n';
}

// "+92 300 1234567" → "923001234567"; "0300-1234567" with cc "92" → "923001234567".
function normalizePhone(raw, cc = '92') {
  const s = String(raw || '').trim(), d = s.replace(/\D/g, '');
  if (!d) return '';
  if (s.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return cc + d.slice(1);
  if (d.startsWith(cc)) return d;
  return cc + d;
}

// Google Maps titles carry taglines: "YS Painters - Exterior & Interior" → "YS Painters".
const cleanName = t => String(t || '').split(/ [-|–—:] /)[0].replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim();

function render(template, lead) {
  return template.replace(/\{(name|category|address|location|business|currency)\}/g, (_, k) => lead[k] ?? '');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { DATA, parseCsv, toCsv, normalizePhone, cleanName, render, sleep };
