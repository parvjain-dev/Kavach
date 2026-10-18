// Run once with your real key to confirm Gemini + embeddings behave before you record the demo:
//   GEMINI_API_KEY=xxxx node scripts/test-live.mjs
import { analyze, embed, MODEL, EMBED_MODEL } from '../src/gemini.js';
import { dot, T_LOW } from '../src/radar.js';

if (!process.env.GEMINI_API_KEY) { console.error('Set GEMINI_API_KEY first.'); process.exit(1); }
console.log(`Model: ${MODEL}   Embeddings: ${EMBED_MODEL}\n`);

const samples = [
  ['KYC SMS', 'Dear customer, your SBI YONO account will be BLOCKED today. Complete KYC immediately: http://sbi-kyc-update.top/login . Ignore = permanent suspension. -SBI Team', 'SCAM', 'KYC_UPDATE'],
  ['CBI call', 'This is Inspector Verma from CBI. A parcel in your name at Mumbai customs contains illegal items. You are under digital arrest. Stay on this video call and do not tell anyone. Transfer Rs 85,000 to the RBI safe account to clear your name.', 'SCAM', 'DIGITAL_ARREST'],
  ['Lucky draw', 'Congratulations! You won Rs 25 lakh in the KBC Lucky Draw. To claim, pay Rs 4,999 processing fee on UPI today. Offer ends in 30 minutes.', 'SCAM', 'LOTTERY_OR_PRIZE'],
  ['From Rohan', 'Hi Amma, I reached Pune safely. Will call you after dinner. Take your tablets. - Rohan', 'SAFE', 'NOT_A_SCAM'],
];

let bad = 0;
const sigs = [];
for (const [name, text, wantVerdict, wantType] of samples) {
  const t0 = Date.now();
  const r = await analyze({ text, lang: 'hi' });
  const good = r.verdict === wantVerdict && r.scamType === wantType;
  if (!good) bad++;
  console.log(`${good ? 'PASS' : 'CHECK'}  ${name}: ${r.verdict}/${r.scamType} score=${r.riskScore} (${Date.now() - t0} ms)`);
  console.log(`        headline: ${r.headline}`);
  console.log(`        tricks:   ${r.tactics.map((x) => x.name).join(', ') || '-'}   [${r.tacticsEn.join(', ')}]`);
  console.log(`        signature: ${r.signature}\n`);
  sigs.push(r.signature);
}

// Does a live KYC message land near the seeded KYC wave, and away from the digital-arrest wave?
const seeds = {
  kyc: 'SMS claiming the recipient bank account will be blocked today unless KYC is updated through a link, creating urgency.',
  arrest: 'Caller posing as CBI says a parcel with illegal items is in the recipient name and demands a video call and money transfer to avoid arrest.',
};
const [eKyc, eArrest, eLive] = await embed([seeds.kyc, seeds.arrest, sigs[0]]);
const simKyc = dot(eLive, eKyc); const simArrest = dot(eLive, eArrest);
console.log(`Radar check: live KYC vs seeded KYC = ${simKyc.toFixed(3)}, vs seeded digital-arrest = ${simArrest.toFixed(3)}`);
console.log(`Embedding dims: ${eLive.length}`);
const radarOk = simKyc > simArrest && simKyc >= T_LOW;
if (!radarOk) bad++;
console.log(radarOk ? 'PASS  Radar will cluster correctly (same category and close enough).' : 'CHECK  Radar similarity is low. Lower RADAR_THRESHOLD_LOW (e.g. 0.5) in the deploy env vars.');
console.log(bad ? `\n${bad} item(s) need a look (see CHECK lines).` : '\nAll live checks passed.');
