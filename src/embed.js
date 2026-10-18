// Embeddings for Scam Radar. Gemini embeddings when available; a deterministic
// local hashing embedder as a safety net so the radar never goes dark.
import { getAI } from './gemini.js';

const DIM = 256;

export function normalizeForEmbedding(text = '') {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, ' URL ')
    .replace(/\b\d[\d,.\-]{3,}\b/g, ' NUM ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

function unit(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function localEmbed(text) {
  const t = normalizeForEmbedding(text);
  const v = new Array(DIM).fill(0);
  const bump = (s, w) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    v[Math.abs(h) % DIM] += (h & 1 ? 1 : -1) * w;
  };
  for (const w of t.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) bump('w:' + w, 1);
  for (let i = 0; i < t.length - 2; i++) bump('t:' + t.slice(i, i + 3), 0.35);
  return unit(v);
}

export const cosine = (a, b) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};

export async function embedTexts(texts) {
  const ai = getAI();
  const model = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  if (ai) {
    try {
      const res = await Promise.race([
        ai.models.embedContent({
          model,
          contents: texts.map(normalizeForEmbedding),
          config: { taskType: 'SEMANTIC_SIMILARITY', outputDimensionality: DIM },
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('embed timeout')), 9000)),
      ]);
      const vectors = res.embeddings.map((e) => unit(e.values));
      if (vectors.length === texts.length) return { vectors, embedder: `${model}@${DIM}` };
    } catch (e) {
      console.warn('[embed] Gemini embeddings unavailable, using local fallback:', String(e.message || e).slice(0, 160));
    }
  }
  return { vectors: texts.map(localEmbed), embedder: 'local-hash' };
}
