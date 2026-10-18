import express from 'express';
import { randomUUID, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, bus } from './src/store.js';
import { analyze, LANGUAGES, getAI, currentModel } from './src/gemini.js';
import { ingest } from './src/radar.js';
import { seedCommunity, seedFamily } from './src/seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DEV = process.env.USE_MEMORY_STORE === '1';
const store = await createStore();

let adminAuth = null;
if (!DEV) {
  const { getAuth } = await import('firebase-admin/auth');
  adminAuth = getAuth();
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '14mb' }));

// ---------- helpers
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const bad = (res, code, msg) => res.status(code).json({ error: msg });
const CODE_RE = /^[A-Z2-9]{6}$/;
const cleanCode = (c) => { const x = String(c || '').toUpperCase().trim(); return CODE_RE.test(x) ? x : ''; };

async function guardianUid(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!tok) return null;
  if (DEV && tok.startsWith('dev:')) return tok;
  try { return (await adminAuth.verifyIdToken(tok)).uid; } catch { return null; }
}
const needGuardian = async (req, res, next) => {
  const uid = await guardianUid(req);
  if (!uid) return bad(res, 401, 'Please sign in again.');
  req.uid = uid;
  next();
};

// naive per-IP rate limit (Cloud Run instances are small; this is a demo guard, not a WAF)
const hits = new Map();
function rate(limit, windowMs) {
  return (req, res, next) => {
    const k = `${req.ip}:${req.path}`;
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) return bad(res, 429, 'Too many checks. Please wait a minute and try again.');
    arr.push(now); hits.set(k, arr);
    next();
  };
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

// tiny result cache: same input + language = same answer, instantly (keeps demos deterministic)
const cache = new Map();
const keyOf = (o) => JSON.stringify([o.text, o.image?.data?.length, o.image?.data?.slice(0, 64), o.audio?.data?.length, o.audio?.data?.slice(0, 64), o.language]);

// ---------- public config for the browser
app.get('/firebase-config.js', (_req, res) => {
  const cfg = process.env.FIREBASE_API_KEY && !DEV ? {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    appId: process.env.FIREBASE_APP_ID,
  } : null;
  res.type('js').set('Cache-Control', 'no-store').send(`window.KAVACH=${JSON.stringify({ firebase: cfg, dev: DEV, languages: LANGUAGES })};`);
});

const health = async (req, res) => {
  const out = { ok: true, store: store.kind, gemini_key: !!getAI(), firebase_web_config: !!process.env.FIREBASE_API_KEY, dev: DEV, model: currentModel() };
  if (req.query.deep) {
    // Deep check used after deploy: one real Gemini call + one Firestore read/write.
    const a = await analyze({ text: 'URGENT: your account is blocked. Share the OTP now and click http://bank-verify.xyz', language: 'en' });
    out.gemini_selftest = { engine: a.engine, model: a.model, verdict: a.verdict, ms: a.latencyMs, note: a.note };
    try { await store.listCampaigns(1); out.store_selftest = 'ok'; } catch (e) { out.store_selftest = 'FAILED: ' + String(e.message).slice(0, 200); out.ok = false; }
    if (a.engine !== 'gemini') out.ok = false;
  }
  res.status(out.ok ? 200 : 500).json(out);
};
app.get('/api/health', health);
app.get('/healthz', health);

// ---------- family
app.get('/api/me', needGuardian, async (req, res) => {
  const family = await store.getFamilyByGuardian(req.uid);
  res.json({ family });
});

app.post('/api/families', needGuardian, async (req, res) => {
  const existing = await store.getFamilyByGuardian(req.uid);
  const b = req.body || {};
  const clean = (s, n) => String(s || '').trim().slice(0, n);
  if (existing) {
    const patch = {};
    if (b.parentName) patch.parentName = clean(b.parentName, 40);
    if (b.parentPhone !== undefined) patch.parentPhone = clean(b.parentPhone, 20);
    if (LANGUAGES[b.language]) patch.language = b.language;
    return res.json({ family: Object.keys(patch).length ? await store.updateFamily(existing.code, patch) : existing });
  }
  let code;
  for (let i = 0; i < 8; i++) { code = newCode(); if (!(await store.getFamily(code))) break; }
  const family = {
    code, guardianUid: req.uid, guardianName: clean(b.guardianName, 40) || 'Guardian',
    parentName: clean(b.parentName, 40) || 'Papa', parentPhone: clean(b.parentPhone, 20),
    language: LANGUAGES[b.language] ? b.language : 'hi', blocklist: [], seeded: false, createdAt: Date.now(),
  };
  await store.createFamily(family);
  res.json({ family });
});

app.get('/api/families/:code/public', async (req, res) => {
  const f = cleanCode(req.params.code) && (await store.getFamily(cleanCode(req.params.code)));
  if (!f) return bad(res, 404, 'Family code not found. Check the 6 letters with your family.');
  res.json({ parentName: f.parentName, guardianName: f.guardianName, language: f.language });
});

app.post('/api/families/:code/block', needGuardian, async (req, res) => {
  const f = cleanCode(req.params.code) && (await store.getFamily(cleanCode(req.params.code)));
  if (!f || f.guardianUid !== req.uid) return bad(res, 403, 'Not your family.');
  const v = String(req.body?.value || '').trim().slice(0, 200);
  if (!v) return bad(res, 400, 'Nothing to block.');
  const blocklist = [...new Set([...(f.blocklist || []), v])].slice(-100);
  await store.updateFamily(f.code, { blocklist });
  res.json({ blocklist });
});

// ---------- the main event: analyze
app.post('/api/analyze', rate(20, 60_000), async (req, res) => {
  try {
    const b = req.body || {};
    const rawCode = String(b.code || '').trim();
    const code = cleanCode(rawCode);
    if (rawCode && !code) return bad(res, 404, 'Family code not found. It has 6 letters and numbers.');
    const text = String(b.text || '').trim().slice(0, 6000);
    const image = b.image?.data ? { mime: String(b.image.mime || 'image/jpeg'), data: String(b.image.data) } : null;
    const audio = b.audio?.data ? { mime: String(b.audio.mime || 'audio/wav'), data: String(b.audio.data) } : null;
    if (!text && !image && !audio) return bad(res, 400, 'Paste a message, add a photo, or record a voice note.');
    if (image && image.data.length > 8_000_000) return bad(res, 413, 'That photo is too large. Try a smaller one.');
    if (audio && audio.data.length > 9_000_000) return bad(res, 413, 'That recording is too long. Keep it under one minute.');

    let family = null;
    if (code) {
      family = await store.getFamily(code);
      if (!family) return bad(res, 404, 'Family code not found.');
    }
    const language = LANGUAGES[b.language] ? b.language : family?.language || 'en';

    const ck = keyOf({ text, image, audio, language });
    let analysis = cache.get(ck);
    const cached = !!analysis;
    if (!analysis) {
      analysis = await analyze({ text, image, audio, language });
      if (analysis.engine === 'gemini') { cache.set(ck, analysis); if (cache.size > 300) cache.delete(cache.keys().next().value); }
    }

    const kind = audio ? 'audio' : image ? 'image' : 'text';
    const report = {
      id: randomUUID(), familyId: family?.code || 'anon', guardianUid: family?.guardianUid || null,
      parentName: family?.parentName || 'Someone', createdAt: Date.now(), inputKind: kind, language,
      preview: (analysis.extracted_text || text).slice(0, 400), analysis, handled: analysis.verdict === 'SAFE',
      source: 'live', campaignId: null, campaignCount: 0, blocked: false,
    };

    let campaign = null;
    if (analysis.verdict !== 'SAFE') {
      try {
        ({ campaign } = await ingest(store, { text: analysis.extracted_text || text, scamType: analysis.scam_type, label: analysis.campaign_label, familyId: family?.code || 'anon', tactics: analysis.tactics.map((t) => t.id) }));
        if (campaign) { report.campaignId = campaign.id; report.campaignCount = campaign.count; report.campaignLabel = campaign.label; }
      } catch (e) { console.warn('[radar] ingest failed:', e.message); }
    }
    if (family) await store.addReport(report);
    res.json({ id: report.id, analysis, campaign: campaign && { id: campaign.id, label: campaign.label, count: campaign.count, alert: campaign.alert }, cached, guardianNotified: !!family });
  } catch (e) {
    console.error('[analyze]', e);
    bad(res, 500, 'Something went wrong while checking. Please try again.');
  }
});

// ---------- guardian actions
app.post('/api/reports/:id/handled', needGuardian, async (req, res) => {
  const r = await store.getReport(req.params.id);
  if (!r || r.guardianUid !== req.uid) return bad(res, 403, 'Not your report.');
  res.json({ report: await store.updateReport(r.id, { handled: req.body?.handled !== false }) });
});

app.post('/api/reports/:id/block', needGuardian, async (req, res) => {
  const r = await store.getReport(req.params.id);
  if (!r || r.guardianUid !== req.uid) return bad(res, 403, 'Not your report.');
  const f = await store.getFamily(r.familyId);
  const ind = r.analysis?.indicators || {};
  const values = [...(ind.phones || []), ...(ind.urls || []), ...(ind.upi_ids || [])];
  if (!values.length) return bad(res, 400, 'No phone number, link or UPI ID found to block.');
  await store.updateFamily(f.code, { blocklist: [...new Set([...(f.blocklist || []), ...values])].slice(-100) });
  await store.updateReport(r.id, { blocked: true, handled: true });
  res.json({ blocked: values });
});

// ---------- demo helpers
const seeding = new Set();
app.post('/api/demo/seed', needGuardian, rate(6, 60_000), async (req, res) => {
  const f = await store.getFamilyByGuardian(req.uid);
  if (!f) return bad(res, 400, 'Create your family first.');
  if (f.seeded) return res.json({ seeded: false, message: 'Demo data already loaded.' });
  if (seeding.has(f.code)) return res.json({ seeded: false, message: 'Demo data is loading. Give it a few seconds.' });
  seeding.add(f.code);
  try {
    const campaigns = await store.listCampaigns(50);
    let n = 0;
    if (!campaigns.some((c) => c.seed)) n = await seedCommunity(store);
    await seedFamily(store, f);
    await store.updateFamily(f.code, { seeded: true });
    res.json({ seeded: true, communityReports: n });
  } catch (e) {
    console.error('[seed]', e);
    bad(res, 500, 'Could not load demo data. Press the button again.');
  } finally { seeding.delete(f.code); }
});

app.post('/api/demo/reset', needGuardian, rate(6, 60_000), async (req, res) => {
  const f = await store.getFamilyByGuardian(req.uid);
  if (!f) return bad(res, 400, 'Create your family first.');
  await store.deleteReportsByFamily(f.code);
  await store.deleteSeedRadar();
  await store.updateFamily(f.code, { seeded: false, blocklist: [] });
  res.json({ ok: true });
});

// ---------- dev-only live stream (stands in for Firestore listeners when running without a cloud account)
if (DEV) {
  app.get('/api/dev/stream', async (req, res) => {
    const uid = String(req.query.uid || '');
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }).flushHeaders();
    const push = async () => {
      const reports = uid ? await store.listReportsByGuardian(uid) : [];
      const campaigns = await store.listCampaigns(20);
      res.write(`data: ${JSON.stringify({ reports, campaigns })}\n\n`);
    };
    const h = () => push().catch(() => {});
    bus.on(`reports:${uid}`, h); bus.on('campaigns', h);
    req.on('close', () => { bus.off(`reports:${uid}`, h); bus.off('campaigns', h); });
    h();
  });
}

// JSON error responses (malformed body, body too large)
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return bad(res, 413, 'That file is too large. Try a smaller photo or a shorter recording.');
  if (err.type === 'entity.parse.failed') return bad(res, 400, 'Bad request.');
  console.error('[error]', err);
  bad(res, 500, 'Something went wrong. Please try again.');
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m', extensions: ['html'] }));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Kavach listening on :${PORT} (store=${store.kind}, gemini=${!!getAI()}, dev=${DEV})`));
