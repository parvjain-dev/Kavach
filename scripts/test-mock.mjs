// End-to-end test against a local MOCK server (no keys, no network).
import { spawn } from 'node:child_process';

const PORT = 18080;
const base = `http://localhost:${PORT}`;
const server = spawn('node', ['server.js'], { env: { ...process.env, MOCK: '1', PORT: String(PORT), RADAR_THRESHOLD: '0.9', RADAR_THRESHOLD_LOW: '0.3' }, stdio: ['ignore', 'pipe', 'inherit'] });
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const j = async (path, opts = {}) => {
  const r = await fetch(base + path, { ...opts, headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 40; i++) { try { await fetch(base + '/api/health'); break; } catch { await wait(150); } }
  const health = await j('/api/health');
  ok(health.data.ok && health.data.mock, 'health endpoint answers in mock mode');

  const demo = await j('/api/demo/start', { method: 'POST' });
  ok(demo.data.family?.code === 'KV-DEMO', 'demo family created');
  const st0 = await j('/api/state/KV-DEMO');
  ok(st0.data.reports.length === 2, `demo feed has 2 seeded reports (got ${st0.data.reports.length})`);
  const kyc0 = st0.data.campaigns.find((c) => c.scamType === 'KYC_UPDATE');
  const arrest0 = st0.data.campaigns.find((c) => c.scamType === 'DIGITAL_ARREST');
  ok(kyc0?.count === 4, `seeded KYC wave has 4 reports (got ${kyc0?.count})`);
  ok(arrest0?.count === 3, `seeded digital-arrest wave has 3 reports (got ${arrest0?.count})`);
  ok(!st0.data.campaigns.some((c) => c.scamType === 'UTILITY_BILL_THREAT' || c.scamType === 'JOB_OR_TASK_SCAM'), 'single reports do not become campaigns');

  // live SSE: open stream, then analyze, expect a reports event containing the new item
  const events = [];
  const ac = new AbortController();
  const sse = fetch(base + '/api/stream/KV-DEMO', { signal: ac.signal }).then(async (r) => {
    const reader = r.body.getReader(); const dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; events.push(dec.decode(value)); }
  }).catch(() => {});
  await wait(400);

  const kycText = 'Dear customer, your SBI YONO account will be BLOCKED today. Complete KYC immediately: http://sbi-kyc-update.top/login . Ignore = permanent suspension. -SBI Team';
  const a1 = await j('/api/analyze', { method: 'POST', body: { familyCode: 'KV-DEMO', lang: 'hi', text: kycText } });
  ok(a1.status === 200 && a1.data.report.verdict === 'SCAM', 'KYC message is a SCAM');
  ok(a1.data.report.scamType === 'KYC_UPDATE', 'classified as KYC_UPDATE');
  ok(a1.data.report.campaign?.count === 5, `joins the existing wave: count 5 (got ${a1.data.report.campaign?.count})`);
  ok(a1.data.report.campaign?.familyCount === 5, `wave spans 5 families (got ${a1.data.report.campaign?.familyCount})`);

  const a2 = await j('/api/analyze', { method: 'POST', body: { familyCode: 'KV-DEMO', lang: 'hi', text: 'This is Inspector Verma from CBI. A parcel in your name at Mumbai customs contains illegal items. You are under digital arrest. Transfer Rs 85,000 to the RBI safe account.' } });
  ok(a2.data.report.scamType === 'DIGITAL_ARREST' && a2.data.report.campaign?.count === 4, `digital arrest joins its wave (count ${a2.data.report.campaign?.count})`);

  const a3 = await j('/api/analyze', { method: 'POST', body: { familyCode: 'KV-DEMO', lang: 'hi', text: 'Hi Amma, I reached Pune safely. Will call after dinner. - Rohan' } });
  ok(a3.data.report.verdict === 'SAFE' && !a3.data.report.campaign, 'family message is SAFE and not added to radar');

  await wait(500);
  const sseText = events.join('');
  ok(sseText.includes('event: reports') && sseText.includes('event: campaigns'), 'SSE stream delivered reports and campaigns events');
  ok(sseText.includes(a1.data.report.id), 'SSE stream pushed the newly analysed report live');
  ac.abort(); await sse;

  const patch = await j(`/api/report/KV-DEMO/${a1.data.report.id}`, { method: 'PATCH', body: { status: 'handled' } });
  ok(patch.status === 200, 'mark handled works');
  const st1 = await j('/api/state/KV-DEMO');
  ok(st1.data.reports.find((r) => r.id === a1.data.report.id)?.status === 'handled', 'handled status persisted');

  // real family flow
  const fam = await j('/api/family', { method: 'POST', body: { guardianName: 'Asha', parentName: 'Ramesh', parentPhone: '+91 98765-43210', lang: 'kn' } });
  ok(/^KV-[A-Z0-9]{4}$/.test(fam.data.family?.code), `family code generated (${fam.data.family?.code})`);
  const got = await j(`/api/family/${fam.data.family.code.toLowerCase()}`);
  ok(got.status === 200 && got.data.family.parentPhone === '+919876543210', 'join lookup works (case-insensitive), phone sanitised');
  const b1 = await j('/api/analyze', { method: 'POST', body: { familyCode: fam.data.family.code, text: 'You won Rs 25 lakh in KBC lucky draw. Pay Rs 4,999 processing fee on UPI today.' } });
  ok(b1.data.report.verdict === 'SCAM' && b1.data.report.lang === 'kn', 'new family inherits language, lottery flagged');

  // validation + safety
  ok((await j('/api/analyze', { method: 'POST', body: { familyCode: 'KV-NOPE', text: 'hi' } })).status === 404, 'unknown family rejected');
  ok((await j('/api/analyze', { method: 'POST', body: { familyCode: 'KV-DEMO' } })).status === 400, 'empty submission rejected');
  ok((await j('/api/family', { method: 'POST', body: { guardianName: '', parentName: '' } })).status === 400, 'family needs names');
  const html = await (await fetch(base + '/')).text();
  ok(html.includes('id="app"'), 'static frontend served');

  // reset
  const reset = await j('/api/demo/reset', { method: 'POST' });
  const st2 = await j('/api/state/KV-DEMO');
  ok(reset.status === 200 && st2.data.reports.length === 2 && st2.data.campaigns.find((c) => c.scamType === 'KYC_UPDATE')?.count === 4, 'demo reset restores the starting state');
} catch (e) {
  console.error('TEST CRASH', e);
  failures++;
} finally {
  server.kill();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
