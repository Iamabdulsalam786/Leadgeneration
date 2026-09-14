# maps2whatsapp — Plan

## Goal
A freelancer types a business type + city, gets a list of businesses with phone numbers, drafts one good message
with a local AI, scans a WhatsApp QR once, and the tool sends personalised messages safely. Install must be
"Node + `npm install`" on Windows/macOS/Linux; use must need zero reading.

## Decisions (and why)

| Decision | Alternatives considered | Why this one |
|---|---|---|
| gosom standalone **binary**, auto-downloaded | Docker image (what Kamil's skill uses); own Playwright scraper | Docker is a real barrier on Windows; own scraper is fragile. Binaries exist for all 3 OSes; **fast mode needs no browser** and already returns phones in international format. |
| **Fast mode default**, deep mode opt-in | Always deep (emails) | Fast = 1–10 s, no Chromium download. Emails are rarely needed for WhatsApp outreach. |
| **Ollama** for drafting, template fallback | Claude API, llama.cpp bindings | Ollama is a one-click installer on all OSes with an HTTP API; no key, no cost; user asked for local. Fallback keeps the tool usable with no LLM. |
| **Baileys** (WhatsApp Web protocol) | Meta Cloud API, whatsapp-web.js | Free, no business verification, already proven in Kamil's `whatsapp-send`. whatsapp-web.js needs a full Chromium. |
| **Single local web page** (Node `http`, SSE, vanilla JS) | CLI wizard; Electron; React app | QR in a browser is far friendlier than in a Windows terminal; no build step; 3 deps total. |
| Country code field, default 92 | Auto-detect from location | Maps usually returns `+92…` already; the field only rescues local-format numbers. Auto-detect = a country table for a rare case. |
| Dedupe by phone across runs (`sent.jsonl`) | Per-run only | Same business appears under many keywords; double-messaging is the fastest way to get reported. |
| Cap default 15/run, 45–120 s gaps, `{name}` mandatory, confirm dialog | Hard daily cap | Warn and default well; the user owns the risk on their own number. |

## Architecture

```
browser (public/index.html)
   │ fetch JSON          │ EventSource /api/events (qr, wa status, log, progress)
   ▼                     ▼
server.js  ── lib/scraper.js ── gms binary (~/.maps2whatsapp/bin) ── Google Maps
           ── lib/llm.js     ── Ollama :11434
           ── lib/whatsapp.js── Baileys ── WhatsApp Web  (session: ~/.maps2whatsapp/whatsapp-auth)
           ── lib/util.js    (csv, phone, render)
```

## Phases

**v0.1 — shipped (2026-09-14)**
- [x] Scrape: business + location → geocode (Nominatim) → gosom fast mode → lean leads, deduped, phones normalised
- [x] Draft: Ollama prompt with rules (40–70 words, `{name}`, opt-out, no links); fallback template
- [x] Personalise: one Ollama call per selected lead rewrites the base using Maps facts (no-website, rating ≥4.5, area); streamed over SSE, editable per lead, falls back to template on error. ~6 s/lead on llama3.2 CPU.
- [x] WhatsApp: QR over SSE, auto-reconnect after pairing (515), send with presence + gap, skip non-WhatsApp, sent log
- [x] UI: 4-step single page, table with selection, live preview, progress bar, live log, CSV export
- [x] Zero-git install: GitHub ZIP + `start.bat` / `start.sh` launchers (check Node, install once, start)
- [x] `npm test` self-checks; end-to-end verified: 17 camera shops in Islamabad in 11 s, llama3.2 draft, QR emitted

**v0.2 — next**
- [ ] Multiple business types per search (one query per line) and "load more"
- [ ] CSV import (bring your own list) and per-row custom `message` column
- [ ] Follow-up sequence: second message after N days to non-repliers (needs reply detection)
- [ ] Reply inbox tab: show incoming replies from contacted numbers; auto-mark "no" as opted out
- [ ] Roman Urdu / Urdu drafting presets; use review snippets (deep mode) in personalisation
- [ ] `npx maps2whatsapp` publish to npm; packaged `.exe`/`.app` via `pkg` or Bun compile for non-developers

**v0.3 — later**
- [ ] Proxies field for large scrapes; grid scraping for whole cities
- [ ] Multiple WhatsApp numbers with rotation
- [ ] Simple CRM: status per lead (contacted / replied / interested / customer)

## Risks
- **WhatsApp bans** — mitigated by defaults + warnings; cannot be eliminated. Recommend a secondary SIM for volume.
- **Baileys breakage** — WhatsApp changes the protocol; pin the version, expect occasional updates.
- **Google blocks** — fast mode is light; deep mode and high depth can trigger temporary IP blocks. Proxies in v0.3.
- **macOS arm64** — gosom ships amd64 only; runs under Rosetta. Document; test when a Mac is available.
- **Nominatim** rate limit (1 req/s) — one geocode per search, fine.

## Verification checklist per release
`npm test` passes · fresh clone + `npm install` + `npm start` opens the page on Linux and Windows · a search returns
leads with `+` phones · Draft works with Ollama on and off · QR renders and connects · a 2-message send to own
numbers succeeds with the gap · second run skips the already-sent numbers.
