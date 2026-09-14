'use strict';
// Local LLM via Ollama (http://localhost:11434). Falls back to a plain template when Ollama is off.
const OLLAMA = process.env.OLLAMA_HOST || 'http://localhost:11434';

async function models() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return (await r.json()).models.map(m => m.name).filter(n => !n.includes('-cloud'));
  } catch { return []; }
}

function fallback({ sender, offer, business }) {
  return `Hi {name}, this is ${sender || 'a local freelancer'}. I ${offer || 'help businesses like yours grow'}` +
    ` and thought it could be useful for a ${business || 'business'} like yours. Happy to share details if you're interested.` +
    `\n\nIf this isn't relevant, just reply "no" and I won't message again.`;
}

async function draft({ business, location, offer, sender, model, lang = 'English' }) {
  const prompt = `You write short WhatsApp outreach messages for a freelancer or small business owner.
Sender: ${sender || 'a local freelancer'}
What the sender offers: ${offer}
Target: ${business} businesses in ${location}
Language: ${lang}

Write ONE message template. Rules:
- Start with "Hi {name}," and keep the literal placeholder {name} — it is replaced with each business name.
- 40–70 words. Warm, plain, like a real person typing on a phone. No emojis, no links, no hashtags, no markdown, no subject line, no quotation marks around the message.
- Say specifically how the offer helps a ${business} business.
- End with a one-line easy opt-out such as: If not relevant, just reply no and I won't message again.
Output only the message text.`;
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST', signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.7 } }),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  let text = (await r.json()).response.trim().replace(/^["“]|["”]$/g, '').trim();
  if (!text.includes('{name}')) text = 'Hi {name},\n\n' + text.replace(/^hi\b[^,\n]*,?\s*/i, '');
  return text;
}

module.exports = { models, draft, fallback, OLLAMA };
