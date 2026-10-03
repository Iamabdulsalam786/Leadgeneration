'use strict';
// Your own WhatsApp number over the WhatsApp Web protocol (Baileys). Free — no Meta Business API.
const fs = require('fs'), path = require('path'), EventEmitter = require('events');
const { DATA, sleep } = require('./util');

const AUTH = path.join(DATA, 'whatsapp-auth'), SENT = path.join(DATA, 'sent.jsonl');

class WhatsApp extends EventEmitter {
  constructor() { super(); this.sock = null; this.state = 'disconnected'; this.user = null; this.qr = null; this._retries = 0; }

  async connect() {
    if (this.sock && this.state !== 'disconnected') return;
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
    const pino = require('pino');
    const { state, saveCreds } = await useMultiFileAuthState(AUTH);
    const { version } = await fetchLatestBaileysVersion();
    this.state = 'connecting'; this.emit('status', this.status());
    const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false, browser: ['maps2whatsapp', 'Chrome', '1.0'] });
    this.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async u => {
      if (u.qr) { this.qr = await require('qrcode').toDataURL(u.qr, { width: 320 }); this.emit('qr', this.qr); }
      if (u.connection === 'open') { this.state = 'connected'; this.qr = null; this._retries = 0; this.user = sock.user?.id?.split(':')[0]; this.emit('status', this.status()); }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        this.sock = null; this.state = 'disconnected'; this.qr = null;
        if (code === DisconnectReason.loggedOut) { fs.rmSync(AUTH, { recursive: true, force: true }); this.user = null; this.emit('status', { ...this.status(), note: 'Logged out on the phone — scan again.' }); return; }
        // ponytail: Baileys always closes once right after a fresh QR pairing (515 restartRequired) — reconnect quietly.
        if (this._retries++ < 5) { this.emit('status', { ...this.status(), note: `Reconnecting (${code})…` }); await sleep(1500); this.connect().catch(e => this.emit('status', { ...this.status(), note: e.message })); }
        else this.emit('status', { ...this.status(), note: `Connection closed (${code}). Click Connect to retry.` });
      }
    });
  }

  status() { return { state: this.state, user: this.user, sentToday: this.sentToday() }; }

  async logout() { try { await this.sock?.logout(); } catch {} fs.rmSync(AUTH, { recursive: true, force: true }); this.sock = null; this.user = null; this.state = 'disconnected'; this.emit('status', this.status()); }

  sentSet() { return new Set(fs.existsSync(SENT) ? fs.readFileSync(SENT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).phone) : []); }
  sentToday() { const d = new Date().toISOString().slice(0, 10); return fs.existsSync(SENT) ? fs.readFileSync(SENT, 'utf8').split('\n').filter(l => l.includes(`"ts":"${d}`) && !l.includes('"skipped"')).length : 0; }

  notOnWaSet() {
    if (!fs.existsSync(SENT)) return new Set();
    const set = new Set();
    for (const l of fs.readFileSync(SENT, 'utf8').split('\n')) {
      if (l.includes('"skipped":"not on whatsapp"')) {
        try { const d = JSON.parse(l); if (d.phone) set.add(d.phone); } catch {}
      }
    }
    return set;
  }

  async checkNumbers(phones) {
    if (this.state !== 'connected' || !this.sock) throw new Error('WhatsApp not connected');
    const results = {};
    for (let i = 0; i < phones.length; i += 20) {
      const batch = phones.slice(i, i + 20);
      const jids = batch.map(p => `${p}@s.whatsapp.net`);
      try {
        const hits = await this.sock.onWhatsApp(...jids);
        const hitSet = new Set((hits || []).filter(h => h.exists).map(h => String(h.jid || '').split('@')[0].replace(/\D/g, '')));
        for (const p of batch) {
          const clean = String(p).replace(/\D/g, '');
          const exists = hitSet.has(clean);
          results[p] = exists;
          if (!exists) {
            fs.appendFileSync(SENT, JSON.stringify({ phone: p, name: '', ts: new Date().toISOString(), skipped: 'not on whatsapp' }) + '\n');
          }
        }
      } catch (e) {
        for (const p of batch) {
          try {
            const [r] = await this.sock.onWhatsApp(`${p}@s.whatsapp.net`);
            const exists = !!r?.exists;
            results[p] = exists;
            if (!exists) {
              fs.appendFileSync(SENT, JSON.stringify({ phone: p, name: '', ts: new Date().toISOString(), skipped: 'not on whatsapp' }) + '\n');
            }
          } catch {
            results[p] = null;
          }
        }
      }
    }
    return results;
  }

  async send(phone, text, name = '') {
    if (this.state !== 'connected') throw new Error('WhatsApp not connected');
    const jid = `${phone}@s.whatsapp.net`;
    const [r] = await this.sock.onWhatsApp(jid);
    if (!r?.exists) { fs.appendFileSync(SENT, JSON.stringify({ phone, name, ts: new Date().toISOString(), skipped: 'not on whatsapp' }) + '\n'); return { ok: false, reason: 'not on WhatsApp' }; }
    await this.sock.sendPresenceUpdate('composing', jid); await sleep(1500 + Math.random() * 2500);
    await this.sock.sendMessage(jid, { text });
    fs.appendFileSync(SENT, JSON.stringify({ phone, name, ts: new Date().toISOString(), text: text.slice(0, 80) }) + '\n');
    return { ok: true };
  }
}

module.exports = { WhatsApp };
