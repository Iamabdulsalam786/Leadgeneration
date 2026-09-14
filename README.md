# maps2whatsapp — find local businesses on Google Maps and message them on WhatsApp

**Free lead generation + WhatsApp outreach tool for freelancers and small agencies.** Type a business type
(*painters*, *construction companies*, *camera shops*, *dentists*…) and a city. maps2whatsapp scrapes Google Maps
for their names and phone numbers, drafts a personalised message with a **local AI model** (Ollama, runs on your
laptop, no API key), lets you edit it, then sends it from **your own WhatsApp number** after you scan a QR code.

No Meta Business API. No Docker. No cloud. No subscription. Works on **Windows, macOS and Linux**.

![maps2whatsapp screenshot — search results, AI-drafted message, WhatsApp QR](docs/screenshot.png)

```
Business type + City  →  Google Maps leads (name, phone, rating, website)
                      →  AI-drafted base message  →  AI rewrites it for EACH business (rating, no website, area…)
                      →  Scan QR with WhatsApp  →  sent one by one with human-like gaps
```

---

## Why

Finding clients as a freelancer means the same loop every week: search Google Maps, copy phone numbers into a
sheet, write the same intro 40 times, paste it into WhatsApp. maps2whatsapp is that loop as one local web page.

- **Google Maps scraper** — powered by the open-source [gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) binary, auto-downloaded on first run. Fast mode needs no browser and returns ~20–100 businesses in seconds.
- **WhatsApp bulk sender from your own number** — uses the WhatsApp Web protocol ([Baileys](https://github.com/WhiskeySockets/Baileys)). Scan a QR code like WhatsApp Web. Free.
- **Local LLM message drafting, per business** — [Ollama](https://ollama.com) + `llama3.2` (2 GB) writes a warm 40–70 word base message, then **rewrites it for every selected business** using its name, category, rating, website and area ("since you don't have a website yet…"). Every message is editable before it goes out. Your data never leaves your machine. Works without Ollama too (plain template with `{name}`).
- **Safety built in** — random 45–120 s gaps, typing indicator, skips numbers not on WhatsApp, never messages the same number twice, per-run cap, daily counter, mandatory `{name}` placeholder, confirm dialog showing the exact first message.
- **One page, four steps.** No accounts, no config files.

## Quick start (3 commands)

Requirements: [Node.js 18+](https://nodejs.org) (that's it). Optional: [Ollama](https://ollama.com) for AI drafts.

```bash
git clone https://github.com/oyekamal/maps2whatsapp
cd maps2whatsapp && npm install
npm start          # opens http://localhost:3210 in your browser
```

Windows: run the same three lines in PowerShell or Command Prompt.

Optional local AI (one time):

```bash
ollama pull llama3.2     # or any model: qwen2.5, gemma3, mistral, phi4…
```

## How to use

1. **Find businesses** — enter e.g. `painters` and `Lahore, Pakistan`, pick how many (~20 to ~100), click *Search*. Results appear in a table with a checkbox per business. Untick anyone you don't want. *Download CSV* keeps the list.
2. **Write your message** — fill in who you are and what you offer, click *Draft with AI*. Edit the text freely. `{name}` becomes each business's name; `{category}` and `{location}` also work. Then click *Personalise each message with AI*: the local model writes a unique version for every selected business (5–20 s each) and lists them all for editing. Whatever you see there is exactly what gets sent.
3. **Connect WhatsApp** — click *Connect*, scan the QR code with WhatsApp → *Linked devices* → *Link a device*. The session is saved, so you scan once.
4. **Send** — set the cap (default 15) and gaps (default 45–120 s), click *Send to selected*, confirm. Watch the live log. *Stop* at any time.

Replies arrive on your phone as normal WhatsApp chats.

## Staying out of WhatsApp jail

WhatsApp bans personal numbers that blast cold messages. The defaults are conservative on purpose; keep them.

| Rule | Why |
|---|---|
| ≤ 15–20 **new** contacts per day per number | Burst sending is the #1 ban signal |
| Keep the random 45–120 s gap | Looks like a person, not a script |
| No links in the first message | Links from unknown numbers get reported |
| Always keep the opt-out line | Fewer "block/report" taps → healthier number |
| Personalise (`{name}`, real offer) | Reports drop sharply when the message is clearly for *them* |
| Use a secondary number for volume | Never risk your main number |

maps2whatsapp logs every send to `~/.maps2whatsapp/sent.jsonl` and skips those numbers forever.

## Use cases

Web developers, painters and contractors, photographers and videographers, digital marketing freelancers,
accountants, printing shops, software houses, HVAC and solar installers, real-estate agents, wedding planners,
tuition centres — anyone whose clients are **local businesses with a Google Maps listing**.

## FAQ

**Is it really free?** Yes. Google Maps scraping, WhatsApp sending and the AI all run locally. No API keys, no per-message fees.

**Do I need Docker or a Google API key?** No. The scraper is a single binary downloaded automatically (~70 MB). Fast mode uses no browser at all.

**What does "Also find emails" do?** Deep mode visits each business website to pull email addresses. Slower, and the scraper downloads a Chromium once for it.

**Will I get banned?** Not if you follow the table above. The tool cannot make cold outreach risk-free; it just removes the ways people usually get banned.

**Which countries?** Any. Set the country code field for numbers Google Maps lists without a `+` prefix (default `92`, Pakistan).

**Which AI models work?** Anything Ollama serves. `llama3.2` (2 GB) is a good default; `qwen2.5:7b` writes better Urdu/Roman Urdu.

**Where is my data?** `~/.maps2whatsapp/` — WhatsApp session, sent log, scraper binary, search results. Delete the folder to reset everything.

## Legal and ethics

Scraping Google Maps is against Google's Terms of Service; keep volume modest and treat results as leads to verify,
not a dataset to resell. Phone numbers are personal data — comply with your local laws (GDPR, PECA, TCPA, etc.),
message businesses, not individuals, and honour every "no". This tool is for legitimate B2B outreach, not spam.

## Architecture

```
server.js          Node http server + Server-Sent Events (no framework)
lib/scraper.js     downloads gosom binary, geocodes via OpenStreetMap, runs a query, returns lean leads
lib/llm.js         Ollama /api/generate with a template fallback
lib/whatsapp.js    Baileys socket: QR → connect → send with dedupe + daily counter
lib/util.js        CSV parser, phone normalisation, template rendering
public/index.html  the whole UI, vanilla JS
test.js            npm test — parser / phone / template checks
```

Dependencies: `@whiskeysockets/baileys`, `qrcode`, `pino`. Nothing else.

## Roadmap

See [PLAN.md](PLAN.md). Next up: follow-up sequences, reply inbox, CSV import, multiple queries per search.

## Credits

[gosom/google-maps-scraper](https://github.com/gosom/google-maps-scraper) (MIT) · [Baileys](https://github.com/WhiskeySockets/Baileys) (MIT) · [Ollama](https://ollama.com) · OpenStreetMap Nominatim for geocoding.

## License

MIT © Muhammad Kamal

---

*Keywords: google maps scraper, whatsapp bulk sender, whatsapp marketing tool, local business leads, lead generation for freelancers, b2b cold outreach, whatsapp automation without api, ollama, local llm, open source lead scraper, small business marketing pakistan.*
