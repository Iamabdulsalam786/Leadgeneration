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

async function draft({ business, location, offer, sender, model, lang = 'English', country = '', currency = '' }) {
  const countryContext = country ? `Target Country: ${country}${currency ? ` (Currency: ${currency})` : ''}
Market Tone & Etiquette:
${/UK|United Kingdom|England|Britain/i.test(country) ? '- UK Business tone: polite, respectful, understated, no pushy hype. Use British spelling.' : ''}
${/US|USA|United States|America/i.test(country) ? '- US Business tone: direct, punchy, value/ROI-oriented, concise.' : ''}
${/UAE|Dubai|Emirates|Saudi|Arabia|Qatar|Kuwait|Bahrain|Oman/i.test(country) ? '- Gulf/Middle East tone: courteous, professional, clear value proposition.' : ''}
${/Australia|Canada|NZ|New Zealand/i.test(country) ? '- Friendly, genuine, collaborative tone.' : ''}
` : '';

  const prompt = `You write short WhatsApp outreach messages for a freelancer or small business owner.
Sender: ${sender || 'a local freelancer'}
What the sender offers: ${offer}
Target: ${business} businesses in ${location}
Language: ${lang}
${countryContext}
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

// Rewrite the approved template for ONE specific business, using what Google Maps knows about it.
async function personalise({ template, lead, business, location, offer, sender, model, lang = 'English', country = '', currency = '' }) {
  const facts = [
    `Business name: ${lead.name}`,
    lead.category && `Category: ${lead.category}`,
    lead.review_rating && `Google rating: ${lead.review_rating}${+lead.review_count ? ` from ${lead.review_count} reviews` : ''}`,
    lead.website ? `Has a website: ${lead.website}` : 'Has NO website listed on Google Maps',
    lead.address && `Address: ${lead.address}`,
  ].filter(Boolean).join('\n');
  const prompt = `You personalise WhatsApp outreach messages for a freelancer or small business owner.
Sender: ${sender || 'a local freelancer'}
What the sender offers: ${offer}
Target market: ${business} businesses in ${location}
${country ? `Country: ${country}` : ''}
Language: ${lang}

Approved base message (keep its tone, length, offer and opt-out line):
"""
${template.replace(/\{name\}/g, lead.name)}
"""

Facts about THIS business:
${facts}

Rewrite the base message for this specific business. Rules:
- Address them by the exact business name given above. Never invent a person's name or any fact not in the list.
- Mention ONE concrete, relevant fact from the list in a natural way (that they have no website, their area, their speciality). Only mention the Google rating if it is 4.5 or higher.
- Same length as the base (40–70 words). Plain text, no emojis, no links, no markdown, no quotation marks.
- Keep the one-line opt-out at the end.
Output only the message text.`;
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST', signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.7 } }),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  return (await r.json()).response.trim().replace(/^["“]|["”]$/g, '').trim();
}

module.exports = { models, draft, personalise, fallback, OLLAMA };
