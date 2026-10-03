#!/usr/bin/env node
'use strict';
// maps2whatsapp — one local web page: find businesses → draft message with local AI → scan QR → send.
const http = require('http'), fs = require('fs'), path = require('path'), { exec } = require('child_process');
const { scrape } = require('./lib/scraper'), llm = require('./lib/llm'), { WhatsApp } = require('./lib/whatsapp');
const { toCsv, render, sleep } = require('./lib/util');

const PORT = Number(process.env.PORT || 3210);
const wa = new WhatsApp();
const clients = new Set();               // SSE listeners
let lastLeads = [], job = null;          // last search results, current send job

const emit = (event, data) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(msg); };
wa.on('qr', qr => emit('qr', { qr })); wa.on('status', s => emit('wa', s));
const log = line => emit('log', { line, ts: Date.now() });

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b ? JSON.parse(b) : {})); });

const cachedRates = {
  USD: 277.1,
  GBP: 366.0,
  EUR: 312.3,
  KWD: 898.0,
  BHD: 737.0,
  OMR: 720.7,
  AED: 75.5,
  SAR: 73.9,
  QAR: 76.1,
  CAD: 194.7,
  AUD: 192.0,
  CHF: 325.0,
  SGD: 216.4,
  NZD: 170.2,
  PKR: 1.0,
  ts: Date.now()
};

async function updateRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      const pkr = data.rates?.PKR;
      if (pkr) {
        for (const c of Object.keys(cachedRates)) {
          if (c === 'PKR' || c === 'ts') continue;
          if (data.rates && data.rates[c]) {
            cachedRates[c] = Number((pkr / data.rates[c]).toFixed(1));
          }
        }
        cachedRates.ts = Date.now();
      }
    }
  } catch (e) {}
}
updateRates();
setInterval(updateRates, 3600000);

async function sendJob({ leads, template, limit = 15, minGap = 45, maxGap = 120, currency = '$' }) {
  const done = wa.sentSet(); let n = 0, sent = 0;
  const todo = leads.filter(l => l.phone && !done.has(l.phone)).slice(0, limit);
  emit('progress', { total: todo.length, done: 0, sent: 0, running: true });
  for (const l of todo) { // ponytail: per-lead AI message (l.message) wins over the template
    if (job?.stop) break;
    let r; try { r = await wa.send(l.phone, l.message || render(template, { currency, ...l }), l.name); } catch (e) { r = { ok: false, reason: e.message }; }
    n++; if (r.ok) sent++;
    emit('progress', { total: todo.length, done: n, sent, running: true, last: { name: l.name, phone: l.phone, ...r } });
    if (r.ok && n < todo.length && !job?.stop) { // ponytail: human-like gap; WhatsApp bans burst senders
      const gap = minGap + Math.random() * Math.max(0, maxGap - minGap);
      emit('log', { line: `Waiting ${Math.round(gap)} s before the next message…`, ts: Date.now() });
      for (let t = 0; t < gap && !job?.stop; t += 1) await sleep(1000);
    }
  }
  emit('progress', { total: todo.length, done: n, sent, running: false, stopped: !!job?.stop });
  job = null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(__dirname, 'public/index.html'))); }
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      clients.add(res); req.on('close', () => clients.delete(res));
      res.write(`event: wa\ndata: ${JSON.stringify(wa.status())}\n\n`);
      if (wa.qr) res.write(`event: qr\ndata: ${JSON.stringify({ qr: wa.qr })}\n\n`);
      return;
    }
    if (url.pathname === '/api/health') return json(res, 200, { ollama: await llm.models(), wa: wa.status(), sending: !!job, notOnWa: Array.from(wa.notOnWaSet()), rates: cachedRates });
    if (url.pathname === '/api/rates') return json(res, 200, { rates: cachedRates });
    if (req.method === 'POST' && url.pathname === '/api/scrape') {
      const b = await body(req);
      if (!b.business || !b.location) return json(res, 400, { error: 'business and location are required' });
      lastLeads = await scrape({ ...b, log });
      return json(res, 200, { leads: lastLeads, notOnWa: Array.from(wa.notOnWaSet()) });
    }
    if (url.pathname === '/api/export.csv') {
      const f = url.searchParams.get('filter');
      const notOnWa = wa.notOnWaSet();
      let out = lastLeads;
      if (f === 'no-website') out = lastLeads.filter(l => !l.website || !l.website.trim());
      else if (f === 'has-website') out = lastLeads.filter(l => !!(l.website && l.website.trim()));
      else if (f === 'on-wa') out = lastLeads.filter(l => l.phone && !notOnWa.has(l.phone));
      else if (f === 'no-web-on-wa') out = lastLeads.filter(l => (!l.website || !l.website.trim()) && l.phone && !notOnWa.has(l.phone));
      else if (f === 'not-on-wa') out = lastLeads.filter(l => l.phone && notOnWa.has(l.phone));
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="leads.csv"' });
      return res.end(toCsv(out, ['name', 'phone', 'emails', 'website', 'category', 'address', 'review_rating', 'review_count']));
    }
    if (req.method === 'POST' && url.pathname === '/api/wa/check') {
      if (wa.state !== 'connected') return json(res, 400, { error: 'Please connect WhatsApp in step 3 first' });
      const b = await body(req);
      if (!b.phones || !Array.isArray(b.phones)) return json(res, 400, { error: 'phones array required' });
      try {
        const results = await wa.checkNumbers(b.phones);
        return json(res, 200, { results, notOnWa: Array.from(wa.notOnWaSet()) });
      } catch (e) {
        return json(res, 500, { error: e.message });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/draft') {
      const b = await body(req);
      try { return json(res, 200, { template: await llm.draft(b), fallback: false }); }
      catch (e) { return json(res, 200, { template: llm.fallback(b), fallback: true, error: e.message }); }
    }
    if (req.method === 'POST' && url.pathname === '/api/personalise') { // one Ollama call per lead; results stream over SSE
      const b = await body(req); const out = [];
      for (const [i, lead] of b.leads.entries()) {
        let message, error; try { message = await llm.personalise({ ...b, lead }); } catch (e) { error = e.message; message = render(b.template, lead); }
        out.push({ phone: lead.phone, message, error });
        emit('personalised', { i, total: b.leads.length, phone: lead.phone, name: lead.name, message, error });
      }
      return json(res, 200, { messages: out });
    }
    if (req.method === 'POST' && url.pathname === '/api/wa/connect') { wa.connect().catch(e => emit('wa', { ...wa.status(), note: e.message })); return json(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/wa/logout') { await wa.logout(); return json(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/send') {
      if (job) return json(res, 409, { error: 'a send is already running' });
      if (wa.state !== 'connected') return json(res, 400, { error: 'connect WhatsApp first' });
      const b = await body(req);
      if (!b.template?.includes('{name}') && !b.leads.every(l => l.message)) return json(res, 400, { error: 'template must contain {name}' });
      job = { stop: false }; sendJob(b).catch(e => { log('Send failed: ' + e.message); job = null; });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/send/stop') { if (job) job.stop = true; return json(res, 200, { ok: true }); }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: e.message }); }
});

server.listen(PORT, '127.0.0.1', () => {
  const u = `http://localhost:${PORT}`;
  console.log(`\n  maps2whatsapp running → ${u}\n  (Ctrl+C to stop)\n`);
  if (!process.env.NO_OPEN) exec({ win32: `start "" "${u}"`, darwin: `open "${u}"` }[process.platform] || `xdg-open "${u}"`, () => {});
});
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 20000);
