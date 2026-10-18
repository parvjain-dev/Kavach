// Browser-side media helpers: shrink photos, record/convert audio to 16 kHz mono WAV
// (WAV is the format Gemini accepts most reliably, whatever the phone records).

export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function shrinkImage(file, max = 1400, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    return { mime: 'image/jpeg', data: await blobToBase64(blob), preview: c.toDataURL('image/jpeg', 0.5) };
  } finally { URL.revokeObjectURL(url); }
}

function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

export async function toWav16k(blob) {
  const ab = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await new Promise((res, rej) => ctx.decodeAudioData(ab.slice(0), res, rej));
    const dur = Math.min(decoded.duration, 75);
    const off = new OfflineAudioContext(1, Math.ceil(dur * 16000), 16000);
    const src = off.createBufferSource();
    src.buffer = decoded; src.connect(off.destination); src.start();
    const rendered = await off.startRendering();
    return encodeWav(rendered.getChannelData(0), 16000);
  } finally { ctx.close?.(); }
}

export function createRecorder({ onTick, onStop, maxMs = 60000 }) {
  let rec, chunks = [], stream, timer, started = 0, tick;
  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      rec = new MediaRecorder(stream);
      chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        clearTimeout(timer); clearInterval(tick);
        stream.getTracks().forEach((t) => t.stop());
        onStop(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), Date.now() - started >= maxMs - 200);
      };
      started = Date.now();
      rec.start();
      tick = setInterval(() => onTick?.(Math.floor((Date.now() - started) / 1000)), 250);
      timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), maxMs);
    },
    stop() { if (rec && rec.state !== 'inactive') rec.stop(); },
  };
}

// Text-to-speech via the browser (free, offline). Returns false if no voice for the language.
export function speak(text, bcp47, onEnd) {
  if (!('speechSynthesis' in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = bcp47; u.rate = 0.9;
  const voices = synth.getVoices();
  const v = voices.find((x) => x.lang === bcp47) || voices.find((x) => x.lang.startsWith(bcp47.slice(0, 2)));
  if (voices.length && !v) return false;
  if (v) u.voice = v;
  u.onend = u.onerror = () => onEnd?.();
  synth.speak(u);
  return true;
}
export const stopSpeaking = () => 'speechSynthesis' in window && window.speechSynthesis.cancel();
