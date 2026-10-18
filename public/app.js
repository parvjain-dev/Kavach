import { LANGS, t } from './i18n.js';
import { shrinkImage, toWav16k, blobToBase64, createRecorder, speak, stopSpeaking } from './media.js';

const K = window.KAVACH || { firebase: null, dev: true };
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const TACTIC_EN = { urgency: 'Urgency', authority: 'Fake authority', fear: 'Fear', greed: 'Greed', secrecy: 'Secrecy', trust: 'Abusing trust', isolation: 'Isolation' };
const VERDICT_EN = { SCAM: 'Scam', SUSPICIOUS: 'Suspicious', SAFE: 'Safe' };
const KIND_EN = { text: 'message', image: 'screenshot', audio: 'voice note' };
const ICON = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  ear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
};

// ------------------------------------------------------------------ api + auth
async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const tok = await Auth.token();
    if (!tok) throw new Error('Please sign in first.');
    headers.Authorization = `Bearer ${tok}`;
  }
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const Auth = {
  user: null, fb: null, auth: null, db: null, ready: null,
  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      if (K.firebase) {
        this.fb = await import('./firebase.bundle.js');
        const a = this.fb.initializeApp(K.firebase);
        this.auth = this.fb.getAuth(a);
        this.db = this.fb.getFirestore(a);
        let live = false;
        await new Promise((res) => this.fb.onAuthStateChanged(this.auth, (u) => { this.user = u; res(); if (live) route(); }));
        live = true;
      } else {
        const uid = store.get('kavach_dev_uid');
        this.user = uid ? { uid, displayName: 'Guest' } : null;
      }
    })();
    return this.ready;
  },
  async token() {
    await this.init();
    if (this.fb) return this.auth.currentUser ? this.auth.currentUser.getIdToken() : null;
    return this.user?.uid || null;
  },
  async google() {
    await this.init();
    if (!this.fb) return this.guest();
    const p = new this.fb.GoogleAuthProvider();
    try { await this.fb.signInWithPopup(this.auth, p); } catch (e) {
      if (e.code === 'auth/popup-blocked') throw new Error('Your browser blocked the sign-in window. Allow pop-ups for this site, or continue as guest.');
      if (e.code === 'auth/unauthorized-domain') throw new Error('This web address is not authorized for Google sign-in yet. Add it in Firebase > Authentication > Settings > Authorized domains, or continue as guest.');
      if (e.code === 'auth/operation-not-allowed') throw new Error('Google sign-in is not turned on in Firebase yet. Continue as guest, or enable it in Authentication > Sign-in method.');
      throw e;
    }
  },
  async guest() {
    await this.init();
    if (this.fb) { await this.fb.signInAnonymously(this.auth); return; }
    const uid = 'dev:' + Math.random().toString(36).slice(2, 10);
    store.set('kavach_dev_uid', uid);
    this.user = { uid, displayName: 'Guest' };
    route();
  },
  async out() {
    if (this.fb) await this.fb.signOut(this.auth);
    else { store.set('kavach_dev_uid', ''); this.user = null; }
    G.unsub?.(); G.family = null; G.reports = []; G.campaigns = [];
    route();
  },
};

// ------------------------------------------------------------------ small utils
function toast(msg, cls = '') {
  const el = $('#toast');
  el.textContent = msg; el.className = `toast ${cls}`; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4500);
}
function ago(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}
function beep() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 660; g.gain.value = 0.06;
    o.connect(g); g.connect(c.destination); o.start(); o.frequency.setValueAtTime(880, c.currentTime + 0.12); o.stop(c.currentTime + 0.3);
  } catch { /* no audio */ }
}

// highlight the manipulative phrases inside the received text
function slipHTML(text, hl = []) {
  const low = text.toLowerCase();
  const ranges = [];
  for (const h of hl) {
    const i = low.indexOf(String(h.quote || '').toLowerCase());
    if (i >= 0 && h.quote) ranges.push([i, i + h.quote.length, h.tactic]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const [s, e, tac] of ranges) {
    if (s < pos) continue;
    out += esc(text.slice(pos, s)) + `<mark class="t-${esc(tac)}">${esc(text.slice(s, e))}</mark>`;
    pos = e;
  }
  return out + esc(text.slice(pos));
}
const stampWord = (lang, v) => { const L = t(lang, 'stampLocal'); return v === 'SCAM' ? L[0] : v === 'SUSPICIOUS' ? L[1] : L[2]; };
const stampEn = { SCAM: 'SCAM', SUSPICIOUS: 'CAREFUL', SAFE: 'LOOKS SAFE' };

// ------------------------------------------------------------------ shared: verdict slip
function resultHTML(data, lang, { forGuardian = false, who = '' } = {}) {
  const a = data.analysis;
  const label = forGuardian ? 'Read from the item' : a.inputKind === 'image' ? t(lang, 'readPhoto') : t(lang, 'received');
  const stamp = lang === 'en' || forGuardian
    ? `${esc(stampEn[a.verdict])}`
    : `${esc(stampWord(lang, a.verdict))}<small>${esc(stampEn[a.verdict])}</small>`;
  return `
  <div class="slipwrap">
    <div class="stamp ${a.verdict} slam" aria-label="${esc(VERDICT_EN[a.verdict])}">${stamp}</div>
    <div class="slip">
      <div class="label">${esc(label)}</div>
      <p class="msg">${slipHTML(a.extracted_text || '(nothing readable)', a.highlights)}</p>
    </div>
  </div>
  <div class="head">
    <h2>${esc(a.headline)}</h2>
    <p class="why">${esc(a.explanation)}</p>
    <div class="meter" aria-label="Risk ${a.risk_score} of 100"><div class="bar"><i style="left:${a.risk_score}%"></i></div><div class="nums"><span>0</span><span>${a.risk_score}/100</span><span>100</span></div></div>
  </div>
  ${a.tactics.length ? `<section><h3>${esc(forGuardian ? 'Manipulation tactics' : t(lang, 'tricks'))}</h3><ul class="tricks">${a.tactics.map((x) => `<li><span class="sw t-${esc(x.id)}"></span><span><b>${esc(forGuardian ? TACTIC_EN[x.id] || x.id : x.label)}</b>${x.why ? ` — ${esc(x.why)}` : ''}</span></li>`).join('')}</ul></section>` : ''}
  <div class="cols two">
    <section><h3>${esc(forGuardian ? `What Kavach told ${who || 'them'}` : t(lang, 'todo'))}</h3><ul class="todo">${a.what_to_do_next.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
    ${a.do_not.length ? `<section><h3>${esc(forGuardian ? 'Warnings given' : t(lang, 'dont'))}</h3><ul class="todo no">${a.do_not.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
  </div>`;
}

// ------------------------------------------------------------------ landing
const DEMO_SMS = 'SBI ALERT: Your YONO KYC has expired. Update immediately to avoid your account being blocked within 24 hours: http://sbi-kyc-verify.xyz/update';
function renderLanding() {
  const demo = { verdict: 'SCAM', risk_score: 96, extracted_text: DEMO_SMS, highlights: [
    { quote: 'KYC has expired', tactic: 'fear' }, { quote: 'immediately', tactic: 'urgency' }, { quote: 'blocked within 24 hours', tactic: 'fear' }, { quote: 'http://sbi-kyc-verify.xyz/update', tactic: 'trust' }] };
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1>Check it with Kavach before you reply, click or pay.</h1>
      <p class="lede">Forward a suspicious SMS, screenshot or voice note. Kavach tells you in your own language if it is a scam, names the trick being played on you, and alerts your family.</p>
      <div class="doors">
        <a class="btn primary big" href="#/check">${ICON.shield}<span>I got a strange message or call<small>Check it in Hindi, Kannada, Tamil and more</small></span></a>
        <a class="btn big" href="#/guardian"><span>I look after a parent or grandparent<small>Live alerts, one-tap actions and Scam Radar</small></span></a>
      </div>
    </div>
    <div class="slipwrap" aria-label="Example of a checked message">
      <div class="stamp SCAM slam">SCAM</div>
      <div class="slip"><div class="label">Example: what an SMS looks like to Kavach</div><p class="msg">${slipHTML(demo.extracted_text, demo.highlights)}</p></div>
      <ul class="tricks" style="margin-top:16px">
        <li><span class="sw t-fear"></span><span><b>Fear.</b> Your account will be blocked.</span></li>
        <li><span class="sw t-urgency"></span><span><b>Urgency.</b> Do it now, within 24 hours.</span></li>
        <li><span class="sw t-trust"></span><span><b>Abusing trust.</b> A look-alike bank link.</span></li>
      </ul>
    </div>
  </section>
  <section class="how" aria-label="How Kavach works">
    <div><h3>1. Show it</h3><p>Paste the text, upload a screenshot, or record the call. No app to install.</p></div>
    <div><h3>2. Understand it</h3><p>Gemini names the manipulation tactic and explains it in simple words, in seven Indian languages, with a read-aloud button.</p></div>
    <div><h3>3. Protect the family</h3><p>The guardian's dashboard lights up live. Scam Radar warns when the same scam is hitting many families.</p></div>
  </section>`;
}

// ------------------------------------------------------------------ parent: check
const C = { lang: store.get('kavach_lang', 'en'), code: store.get('kavach_code', ''), parentName: '', text: '', image: null, audio: null, rec: null, recSecs: 0, busy: false, result: null, error: '' };

async function renderCheck(qs) {
  if (qs.get('code')) { C.code = qs.get('code').toUpperCase(); store.set('kavach_code', C.code); }
  if (qs.get('lang')) C.lang = qs.get('lang');
  if (C.code && !C.parentName) {
    try { const f = await api(`/api/families/${C.code}/public`); C.parentName = f.parentName; C.guardianName = f.guardianName; if (!qs.get('lang') && !store.get('kavach_lang')) C.lang = f.language; }
    catch { C.code = ''; store.set('kavach_code', ''); }
  }
  drawCheck();
}

function drawCheck() {
  const L = C.lang;
  const keepText = $('#msg-in')?.value;
  if (keepText !== undefined) C.text = keepText;
  app.innerHTML = `
  <div class="check">
    <div class="langs" role="group" aria-label="Language">${LANGS.map(([c, n]) => `<button type="button" data-lang="${c}" aria-pressed="${c === L}">${esc(n)}</button>`).join('')}</div>
    <h1 style="max-width:20ch;font-size:clamp(1.8rem,5.5vw,2.6rem)">${esc(t(L, 'title'))}</h1>
    <p class="lede muted">${esc(t(L, 'sub'))}</p>
    <div class="fam-row">
      ${C.parentName ? `<span class="note ok">${esc(t(L, 'checkingFor', { name: C.parentName }))}</span>` : ''}
      <label class="small muted" for="code-in">${esc(t(L, 'family'))}</label>
      <input id="code-in" value="${esc(C.code)}" maxlength="6" autocomplete="off" inputmode="text" aria-describedby="code-hint">
      <span id="code-hint" class="small muted">${esc(t(L, 'familyHint'))}</span>
    </div>
    <div class="inputs">
      <textarea id="msg-in" class="msg-in" placeholder="${esc(t(L, 'paste'))}" aria-label="${esc(t(L, 'paste'))}">${esc(C.text)}</textarea>
      <div class="pickers">
        <label class="btn" for="img-in">${ICON.cam}<span>${esc(t(L, 'photo'))}</span></label>
        <input id="img-in" type="file" accept="image/*" class="sr">
        ${C.rec ? `<button class="btn danger" id="rec-btn" type="button"><span class="rec-dot"></span><span>${esc(t(L, 'stop'))} (${C.recSecs}s)</span></button>`
                : `<button class="btn" id="rec-btn" type="button">${ICON.mic}<span>${esc(t(L, 'voice'))}</span></button>`}
      </div>
      ${C.rec ? `<p class="muted small" role="status">${esc(t(L, 'recording'))}</p>` : `<label class="small muted" for="aud-in" style="cursor:pointer;text-decoration:underline">${esc(t(L, 'audioFile'))}</label><input id="aud-in" type="file" accept="audio/*,video/mp4" class="sr">`}
      ${C.image ? `<div class="attach"><img src="${C.image.preview}" alt=""><span class="grow">${esc(t(L, 'photo'))}</span><button class="btn small" data-drop="image" type="button">${esc(t(L, 'remove'))}</button></div>` : ''}
      ${C.audio ? `<div class="attach"><span class="grow"><b>${esc(t(L, 'voice'))}</b><br><audio controls src="${C.audio.url}" style="max-width:100%"></audio></span><button class="btn small" data-drop="audio" type="button">${esc(t(L, 'remove'))}</button></div>` : ''}
    </div>
    ${C.error ? `<p class="err" role="alert">${esc(C.error)}</p>` : ''}
    <button class="btn primary big" id="go" type="button" ${C.busy ? 'disabled' : ''}>${C.busy ? `<span class="spin"></span><span>${esc(t(L, 'checking'))}</span>` : `${ICON.shield}<span>${esc(t(L, 'check'))}</span>`}</button>
    <div id="result" class="result" aria-live="polite"></div>
  </div>`;
  bindCheck();
  if (C.result && !C.busy) drawResult();
}

function bindCheck() {
  const L = C.lang;
  app.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { C.lang = b.dataset.lang; store.set('kavach_lang', C.lang); stopSpeaking(); C.result = null; drawCheck(); }));
  $('#code-in').addEventListener('change', async (e) => {
    C.code = e.target.value.trim().toUpperCase(); store.set('kavach_code', C.code); C.parentName = '';
    if (C.code.length === 6) { try { const f = await api(`/api/families/${C.code}/public`); C.parentName = f.parentName; C.guardianName = f.guardianName; C.error = ''; } catch (err) { C.error = err.message; C.code = ''; } }
    drawCheck();
  });
  $('#img-in').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { C.image = await shrinkImage(f); C.error = ''; } catch { C.error = 'That photo could not be opened. Try another.'; }
    drawCheck();
  });
  $('#aud-in')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    await setAudio(f);
  });
  app.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', () => { C[b.dataset.drop] = null; drawCheck(); }));
  $('#rec-btn').addEventListener('click', async () => {
    if (C.rec) { C.rec.stop(); return; }
    C.text = $('#msg-in').value;
    try {
      C.rec = createRecorder({
        onTick: (s) => { C.recSecs = s; const b = $('#rec-btn span:last-child'); if (b) b.textContent = `${t(L, 'stop')} (${s}s)`; },
        onStop: async (blob, auto) => { C.rec = null; C.recSecs = 0; if (auto) toast(t(L, 'tooLong')); await setAudio(blob); },
      });
      await C.rec.start();
      drawCheck();
    } catch { C.rec = null; C.error = t(L, 'micDenied'); drawCheck(); }
  });
  $('#go').addEventListener('click', submitCheck);
}

async function setAudio(blob) {
  try {
    const wav = await toWav16k(blob).catch(() => null);
    const use = wav || blob;
    C.audio = { mime: wav ? 'audio/wav' : blob.type || 'audio/webm', data: await blobToBase64(use), url: URL.createObjectURL(use) };
    C.error = '';
  } catch { C.error = 'That recording could not be read. Try again.'; }
  drawCheck();
}

async function submitCheck() {
  const L = C.lang;
  C.text = $('#msg-in').value.trim();
  if (!C.text && !C.image && !C.audio) { C.error = t(L, 'needInput'); return drawCheck(); }
  C.error = ''; C.busy = true; C.result = null; drawCheck();
  try {
    const data = await api('/api/analyze', { method: 'POST', body: { code: C.code, language: L, text: C.text, image: C.image && { mime: C.image.mime, data: C.image.data }, audio: C.audio && { mime: C.audio.mime, data: C.audio.data } } });
    data.analysis.inputKind = C.audio ? 'audio' : C.image ? 'image' : 'text';
    C.result = data;
  } catch (e) { C.error = e.message; }
  C.busy = false; drawCheck();
  $('#result')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function drawResult() {
  const L = C.lang, d = C.result, a = d.analysis;
  const box = $('#result');
  const notes = [];
  if (d.guardianNotified && C.code) notes.push(`<div class="note ok">${ICON.shield}<span>${esc(t(L, 'alerted', { name: C.guardianName || 'Family' }))}</span></div>`);
  if (d.campaign?.count >= 2) notes.push(`<div class="note alert"><span>${esc(t(L, 'similar', { n: d.campaign.count - 1 }))}</span></div>`);
  if (a.verdict !== 'SAFE') notes.push(`<div class="helpline">${esc(t(L, 'lost'))}</div>`);
  box.innerHTML = `${resultHTML(d, L)}${notes.join('')}
    <div class="actions"><button class="btn" id="listen" type="button">${ICON.ear}<span>${esc(t(L, 'listen'))}</span></button><button class="btn" id="again" type="button">${esc(t(L, 'again'))}</button></div>`;
  $('#listen').addEventListener('click', (e) => {
    const btn = e.currentTarget; const bcp = LANGS.find((x) => x[0] === L)[2];
    const txt = [a.headline, a.explanation, ...a.what_to_do_next].join('. ');
    if (!speak(txt, bcp, () => (btn.disabled = false))) toast('This phone has no voice for this language. Ask someone to read it to you.');
  });
  $('#again').addEventListener('click', () => { C.text = ''; C.image = null; C.audio = null; C.result = null; stopSpeaking(); drawCheck(); scrollTo({ top: 0 }); });
}

// ------------------------------------------------------------------ guardian
const G = { family: null, reports: [], campaigns: [], seen: null, open: new Set(), unsub: null, split: store.get('kavach_split') === '1', loading: false, error: '' };

async function renderGuardian() {
  await Auth.init();
  if (!K.firebase && !K.dev) { app.innerHTML = '<div class="gate panel"><h1 style="font-size:1.6rem">Firebase is not configured</h1><p class="err">The server is missing FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID and FIREBASE_APP_ID. Set them on the Cloud Run service and reload.</p></div>'; return; }
  if (!Auth.user) return drawGate();
  if (!G.family) {
    app.innerHTML = '<p class="muted">Loading your family…</p>';
    try { G.family = (await api('/api/me', { auth: true })).family; } catch (e) { G.error = e.message; }
  }
  if (!G.family) return drawSetup();
  drawDash();
  startLive();
}

function drawGate() {
  app.innerHTML = `
  <div class="gate panel">
    <h1 style="font-size:2rem">Protect your family</h1>
    <p class="muted">Sign in to get live alerts whenever your parent checks something suspicious, and to see Scam Radar.</p>
    ${G.error ? `<p class="err">${esc(G.error)}</p>` : ''}
    <div class="doors">
      <button class="btn primary big" id="g-google" type="button">Continue with Google</button>
      <button class="btn big" id="g-guest" type="button"><span>Continue as guest<small>Instant demo, no account needed</small></span></button>
    </div>
  </div>`;
  const run = (fn) => async () => { try { G.error = ''; await fn(); route(); } catch (e) { G.error = /popup-closed|cancelled-popup/.test(e.code || e.message) ? 'Sign-in was cancelled.' : e.code === 'auth/operation-not-allowed' ? 'Guest sign-in is not turned on in Firebase yet: Authentication > Sign-in method > enable Anonymous.' : e.message; drawGate(); } };
  $('#g-google').addEventListener('click', run(() => Auth.google()));
  $('#g-guest').addEventListener('click', run(() => Auth.guest()));
}

function drawSetup() {
  app.innerHTML = `
  <div class="gate panel">
    <h1 style="font-size:2rem">Set up your family</h1>
    <p class="muted">Who are you protecting? You get a 6-letter code to give them.</p>
    ${G.error ? `<p class="err">${esc(G.error)}</p>` : ''}
    <form class="form" id="setup">
      <label>Your name<input name="guardianName" value="${esc(Auth.user.displayName?.split(' ')[0] || '')}" placeholder="Arjun" required maxlength="40"></label>
      <label>Their name<input name="parentName" placeholder="Papa, Amma, Ajji…" required maxlength="40"></label>
      <label>Their phone (for the Call button)<input name="parentPhone" inputmode="tel" placeholder="+91 98xxxxxxxx" maxlength="20"></label>
      <label>Their language<select name="language">${LANGS.map(([c, n]) => `<option value="${c}" ${c === 'hi' ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <button class="btn primary big" type="submit">Create family</button>
    </form>
  </div>`;
  $('#setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    try { G.family = (await api('/api/families', { method: 'POST', auth: true, body: b })).family; G.error = ''; route(); }
    catch (err) { G.error = err.message; drawSetup(); }
  });
}

function drawDash() {
  const f = G.family;
  const link = `${location.origin}/#/check?code=${f.code}`;
  app.innerHTML = `
  <div class="code-bar">
    <div><div class="small" style="opacity:.8">Family code for ${esc(f.parentName)}</div><div class="code" aria-label="Family code ${esc(f.code.split('').join(' '))}">${esc(f.code)}</div></div>
    <div class="actions">
      <button class="btn small" id="copy" type="button">Copy ${esc(f.parentName)}'s link</button>
      <button class="btn small solid" id="split" type="button">${G.split ? 'Hide' : 'Show'} ${esc(f.parentName)}'s phone</button>
    </div>
  </div>
  <div class="toolbar">
    <button class="btn small" id="seed" type="button">Load demo data</button>
    <button class="btn small" id="reset" type="button">Reset demo</button>
    <span class="spacer"></span>
    <button class="btn small" id="out" type="button">Sign out</button>
  </div>
  <div class="dash ${G.split ? 'split' : ''}">
    <section class="feedcol" aria-label="Live feed"><h2>Live feed</h2><div id="feed" class="feed" aria-live="polite"></div></section>
    <aside class="radar" aria-label="Scam Radar"><h2><span class="sweep"></span>Scam Radar</h2><p class="small muted">Similar reports from all Kavach families in the last 24 hours.</p><div id="radar"></div></aside>
    ${G.split ? `<div class="phone"><iframe title="${esc(f.parentName)}'s phone" src="/?embed=1#/check?code=${esc(f.code)}&embed=1"></iframe></div>` : ''}
  </div>`;
  $('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); toast('Link copied. Send it to ' + f.parentName + ' on WhatsApp.'); } catch { prompt('Copy this link', link); } });
  $('#split').addEventListener('click', () => { G.split = !G.split; store.set('kavach_split', G.split ? '1' : '0'); drawDash(); });
  $('#out').addEventListener('click', () => Auth.out());
  $('#seed').addEventListener('click', async (e) => { e.target.disabled = true; try { const r = await api('/api/demo/seed', { method: 'POST', auth: true }); toast(r.seeded ? 'Demo data loaded.' : r.message); } catch (err) { toast(err.message); } e.target.disabled = false; });
  $('#reset').addEventListener('click', async () => { if (!confirm('Clear this family\'s feed and the demo radar data?')) return; try { await api('/api/demo/reset', { method: 'POST', auth: true }); G.seen = null; toast('Demo reset.'); } catch (err) { toast(err.message); } });
  renderFeed(); renderRadar();
}

function renderFeed() {
  const box = $('#feed'); if (!box) return;
  const f = G.family;
  if (!G.reports.length) { box.innerHTML = `<div class="feed-empty"><b>Nothing checked yet.</b><br>Send ${esc(f.parentName)} the link, or press Load demo data.</div>`; return; }
  box.innerHTML = G.reports.map((r) => {
    const a = r.analysis, fresh = G.fresh?.has(r.id);
    const ind = a.indicators || {};
    const canBlock = !r.blocked && (ind.phones?.length || ind.urls?.length || ind.upi_ids?.length);
    const call = f.parentPhone ? `<a class="btn small" href="tel:${esc(f.parentPhone.replace(/[^+\d]/g, ''))}">Call ${esc(f.parentName)}</a>` : '';
    return `<article class="card ${a.verdict} ${fresh ? 'fresh' : ''} ${r.handled ? 'done' : ''}" data-id="${esc(r.id)}">
      <div class="row"><span><span class="tag">${esc(VERDICT_EN[a.verdict])}</span> <span class="who">${esc(r.parentName)} checked a ${esc(KIND_EN[r.inputKind] || 'message')}</span></span><span class="when">${ago(r.createdAt)}</span></div>
      <p class="sum">${esc(a.guardian_summary || a.headline)}</p>
      <div class="chips">
        ${a.verdict !== 'SAFE' ? `<span class="chip">${esc(a.campaign_label)}</span>` : ''}
        ${a.tactics.map((x) => `<span class="chip"><span class="sw t-${esc(x.id)}"></span>${esc(TACTIC_EN[x.id] || x.id)}</span>`).join('')}
        ${r.campaignCount >= 3 ? `<span class="chip" style="border-color:var(--scam);color:var(--scam)">${r.campaignCount} similar reports</span>` : ''}
        ${a.guardrail ? '<span class="chip" title="Rule-based safety net raised the verdict">Safety net</span>' : ''}
      </div>
      <p class="prev">${esc(r.preview)}</p>
      <div class="actions">
        ${a.verdict !== 'SAFE' && !r.handled ? call : ''}
        ${a.verdict !== 'SAFE' && !r.handled ? `<button class="btn small" data-act="handled" type="button">Mark handled</button>` : ''}
        ${a.verdict !== 'SAFE' && canBlock ? `<button class="btn small danger" data-act="block" type="button">Block sender</button>` : ''}
        ${r.blocked ? '<span class="chip">Blocked</span>' : r.handled && a.verdict !== 'SAFE' ? '<span class="chip">Handled</span>' : ''}
      </div>
      <details ${G.open.has(r.id) ? 'open' : ''} data-id="${esc(r.id)}"><summary>See exactly what ${esc(r.parentName)} saw</summary>
        <div class="result" style="margin-top:12px">${resultHTML({ analysis: a }, a.language || 'en', { forGuardian: true, who: r.parentName }).replace('slam', '')}</div>
      </details>
    </article>`;
  }).join('');
  box.querySelectorAll('details').forEach((d) => d.addEventListener('toggle', () => (d.open ? G.open.add(d.dataset.id) : G.open.delete(d.dataset.id))));
  box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('.card').dataset.id; b.disabled = true;
    try {
      if (b.dataset.act === 'handled') await api(`/api/reports/${id}/handled`, { method: 'POST', auth: true });
      else { const r = await api(`/api/reports/${id}/block`, { method: 'POST', auth: true }); toast(`Blocked ${r.blocked.length} sender detail(s) for ${f.parentName}.`); }
    } catch (e) { toast(e.message); b.disabled = false; }
  }));
}

function renderRadar() {
  const box = $('#radar'); if (!box) return;
  const camps = G.campaigns.filter((c) => c.count >= 2).sort((a, b) => b.count - a.count);
  if (!camps.length) { box.innerHTML = '<p class="muted">No campaigns yet. When several families get the same kind of scam, it shows up here.</p>'; return; }
  box.innerHTML = camps.map((c) => `
    <div class="camp ${esc(c.severity)}">
      <div class="top-row"><span class="n">${c.count}</span><span class="lbl">${esc(c.label)}${Date.now() - c.lastSeen < 300000 ? '<span class="new">just now</span>' : ''}</span></div>
      <div class="meta">${c.alert ? 'Active campaign' : 'Emerging'} · ${c.familyCount} ${c.familyCount === 1 ? 'family' : 'families'} · ${c.lastHour} in the last hour · first seen ${ago(c.firstSeen)}</div>
      <div class="chips">${(c.tactics || []).map((x) => `<span class="chip"><span class="sw t-${esc(x)}"></span>${esc(TACTIC_EN[x] || x)}</span>`).join('')}</div>
      <q>${esc(c.sample)}</q>
    </div>`).join('');
}

async function startLive() {
  if (!Auth.user || G.unsub || !G.family) return;
  const uid = Auth.user.uid;
  const onReports = (list) => {
    list.sort((a, b) => b.createdAt - a.createdAt);
    const ids = new Set(list.map((r) => r.id));
    G.fresh = new Set();
    if (G.seen) {
      const added = list.filter((r) => !G.seen.has(r.id) && r.source === 'live');
      added.forEach((r) => G.fresh.add(r.id));
      const top = added.find((r) => r.analysis.verdict !== 'SAFE') || added[0];
      if (top) { toast(`${top.parentName} just checked a ${KIND_EN[top.inputKind] || 'message'}: ${VERDICT_EN[top.analysis.verdict]}`, top.analysis.verdict); if (top.analysis.verdict === 'SCAM') beep(); }
    }
    G.seen = ids; G.reports = list; renderFeed();
  };
  const onCamps = (list) => { G.campaigns = list; renderRadar(); };
  if (Auth.fb) {
    const { collection, query, where, orderBy, limit, onSnapshot } = Auth.fb;
    const u1 = onSnapshot(query(collection(Auth.db, 'reports'), where('guardianUid', '==', uid)), (s) => onReports(s.docs.map((d) => d.data())), (e) => toast('Live feed blocked: ' + e.message));
    const u2 = onSnapshot(query(collection(Auth.db, 'campaigns'), orderBy('lastSeen', 'desc'), limit(20)), (s) => onCamps(s.docs.map((d) => d.data())), () => {});
    G.unsub = () => { u1(); u2(); G.unsub = null; G.seen = null; };
  } else {
    const es = new EventSource(`/api/dev/stream?uid=${encodeURIComponent(uid)}`);
    es.onmessage = (m) => { const d = JSON.parse(m.data); onReports(d.reports); onCamps(d.campaigns); };
    G.unsub = () => { es.close(); G.unsub = null; G.seen = null; };
  }
}
setInterval(() => { if (location.hash.startsWith('#/guardian') && G.family) { renderFeed(); renderRadar(); } }, 30000);

// ------------------------------------------------------------------ router
function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, q] = h.split('?');
  const qs = new URLSearchParams(q || '');
  const embed = qs.get('embed') === '1' || new URLSearchParams(location.search).get('embed') === '1';
  document.body.classList.toggle('embed', embed);
  document.querySelectorAll('[data-nav]').forEach((a) => (a.getAttribute('data-nav') === path.slice(1) ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (path !== '/guardian' && G.unsub) G.unsub();
  if (path === '/check') renderCheck(qs);
  else if (path === '/guardian') renderGuardian();
  else renderLanding();
  if (!embed) app.focus({ preventScroll: true });
}
addEventListener('hashchange', route);
addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
Auth.init().finally(route);
