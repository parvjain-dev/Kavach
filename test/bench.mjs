// Benchmark Kavach on a labelled set of 43 messages (27 scams, 16 genuine).
//   node test/bench.mjs                    -> rules-engine safety net only (offline)
//   node test/bench.mjs https://YOUR-URL   -> the deployed service (Gemini + guardrails)
import fs from 'node:fs';
import { runRules, verdictFromScore } from '../src/rules.js';
const data = JSON.parse(fs.readFileSync(new URL('./dataset.json', import.meta.url)));
const base = process.argv[2]?.replace(/\/$/, '');
const rows = [];
for (const d of data) {
  const t0 = Date.now();
  let verdict, engine = 'rules', type = '';
  if (base) {
    const r = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: d.text, language: 'en' }) });
    const j = await r.json();
    if (!r.ok) { console.error('request failed', r.status, j); process.exit(1); }
    verdict = j.analysis.verdict; engine = j.analysis.engine; type = j.analysis.scam_type;
    await new Promise((s) => setTimeout(s, 3200)); // stay under the 20/min rate limit
  } else {
    const r = runRules(d.text); verdict = verdictFromScore(r.score); type = r.scamType;
  }
  rows.push({ ...d, verdict, engine, predType: type, ms: Date.now() - t0 });
}
const scams = rows.filter((r) => r.label === 'SCAM'), safes = rows.filter((r) => r.label === 'SAFE');
const flagged = scams.filter((r) => r.verdict !== 'SAFE').length;
const hardScam = scams.filter((r) => r.verdict === 'SCAM').length;
const falseAlarm = safes.filter((r) => r.verdict !== 'SAFE').length;
const typed = scams.filter((r) => r.predType === r.type).length;
const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))];
const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;
const out = `# Kavach benchmark

Mode: ${base ? `deployed service (${base}), engines seen: ${[...new Set(rows.map((r) => r.engine))].join(', ')}` : 'rules-engine safety net only (offline, no Gemini)'}
Test set: ${rows.length} messages (${scams.length} scams across 14 scam families in English, Hindi and Kannada; ${safes.length} genuine messages incl. bank debit alerts, OTP notices, delivery and family chat)

| Metric | Result |
|---|---|
| Scams flagged (SCAM or SUSPICIOUS) | ${flagged}/${scams.length} (${pct(flagged, scams.length)}) |
| Scams given the strongest verdict (SCAM) | ${hardScam}/${scams.length} (${pct(hardScam, scams.length)}) |
| Genuine messages wrongly flagged | ${falseAlarm}/${safes.length} (${pct(falseAlarm, safes.length)}) |
| Scam family identified correctly | ${typed}/${scams.length} (${pct(typed, scams.length)}) |
| Latency p50 / p95 | ${p(0.5)} ms / ${p(0.95)} ms |

## Misses and false alarms
${rows.filter((r) => (r.label === 'SCAM' && r.verdict === 'SAFE') || (r.label === 'SAFE' && r.verdict !== 'SAFE')).map((r) => `- [${r.label} -> ${r.verdict}] ${r.text.slice(0, 110)}`).join('\n') || '- none'}
`;
fs.writeFileSync(new URL('../docs/benchmark.md', import.meta.url), out);
console.log(out);
