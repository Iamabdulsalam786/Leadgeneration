'use strict';
// Google Maps → leads, via the open-source gosom/google-maps-scraper standalone binary.
// Fast mode (default) needs NO browser: ~1–3 s per query, returns name/phone/website/rating.
// Deep mode adds emails by visiting each website; the binary downloads a Chromium on first deep run.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { pipeline } = require('stream/promises'), { Readable } = require('stream');
const { DATA, parseCsv, normalizePhone, cleanName } = require('./util');

const VERSION = '1.18.0';
const ASSET = { linux: 'linux-amd64', darwin: 'darwin-amd64', win32: 'windows-amd64.exe' }[process.platform];
const BIN = path.join(DATA, 'bin', `gms-${VERSION}${process.platform === 'win32' ? '.exe' : ''}`);
const URL_ = `https://github.com/gosom/google-maps-scraper/releases/download/v${VERSION}/google_maps_scraper-${VERSION}-${ASSET}`;
const LEAD = ['title', 'phone', 'emails', 'website', 'category', 'address', 'review_rating', 'review_count'];

async function ensureBinary(log = () => {}) {
  if (fs.existsSync(BIN)) return BIN;
  if (!ASSET) throw new Error(`unsupported platform ${process.platform}`);
  fs.mkdirSync(path.dirname(BIN), { recursive: true });
  log(`Downloading Google Maps scraper v${VERSION} (~70 MB, one time)…`);
  const res = await fetch(URL_, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const tmp = BIN + '.part';
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  fs.renameSync(tmp, BIN);
  if (process.platform !== 'win32') fs.chmodSync(BIN, 0o755);
  log('Scraper ready.');
  return BIN;
}

// Free geocoding via OpenStreetMap Nominatim (≈1 req/s policy, descriptive UA required).
async function geocode(place) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`;
  const res = await fetch(u, { headers: { 'User-Agent': 'maps2whatsapp/0.1 (https://github.com/oyekamal/maps2whatsapp)' } });
  const [hit] = await res.json();
  if (!hit) throw new Error(`could not find "${place}" on the map — try "City, Country"`);
  return { lat: hit.lat, lon: hit.lon, label: hit.display_name };
}

async function scrape({ business, location, depth = 2, deep = false, cc = '92', log = () => {} }) {
  const bin = await ensureBinary(log);
  const geo = await geocode(location);
  log(`Location: ${geo.label}`);
  const run = path.join(DATA, 'runs', String(Date.now()));
  fs.mkdirSync(run, { recursive: true });
  const input = path.join(run, 'queries.txt'), out = path.join(run, 'results.csv');
  fs.writeFileSync(input, `${business} in ${location}\n`);
  const args = ['-input', input, '-results', out, '-depth', String(depth), '-geo', `${geo.lat},${geo.lon}`,
    '-exit-on-inactivity', '1m', '-c', '2'];
  args.push(deep ? '-email' : '-fast-mode');
  log(`Searching Google Maps for "${business} in ${location}" (${deep ? 'deep, with emails' : 'fast'})…`);
  await new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const tail = [];
    const onData = d => String(d).split('\n').forEach(l => {
      if (!l.trim()) return; tail.push(l); if (tail.length > 20) tail.shift();
      const m = /"message":"([^"]+)"/.exec(l); if (m && !/scrapemate/.test(m[1])) log(m[1]);
    });
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('close', code => code === 0 || fs.existsSync(out) ? resolve() : reject(new Error(`scraper exited ${code}\n${tail.join('\n')}`)));
  });
  if (!fs.existsSync(out)) return [];
  const rows = parseCsv(fs.readFileSync(out, 'utf8'));
  const seen = new Set(), leads = [];
  for (const r of rows) {
    const phone = normalizePhone(r.phone, cc);
    const key = phone || r.title;
    if (!r.title || seen.has(key)) continue; // ponytail: dedupe by phone (same owner, two listings)
    seen.add(key);
    const lead = Object.fromEntries(LEAD.map(k => [k, r[k] ?? '']));
    leads.push({ ...lead, name: cleanName(r.title), phone, business, location,
      review_rating: r.review_rating ? Number(r.review_rating).toFixed(1) : '' });
  }
  log(`Found ${leads.length} businesses, ${leads.filter(l => l.phone).length} with a phone number.`);
  return leads;
}

module.exports = { scrape, ensureBinary, geocode };
