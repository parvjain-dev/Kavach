// Scam Radar: turns individual reports into community-level early warning.
// A report joins a campaign when it is semantically close to recent reports
// (embedding cosine similarity) AND/OR the same scam family.
import { randomUUID } from 'node:crypto';
import { cosine, embedTexts } from './embed.js';

const WINDOW_MS = 24 * 3600 * 1000;
const T = {
  gemini: { base: 0.80, strong: 0.94 },
  local: { base: 0.42, strong: 0.78 },
};
export const ALERT_AT = 3;

export function sanitizeSnippet(t = '') {
  return t.replace(/\s+/g, ' ').replace(/\b\d{6,}\b/g, '••••••').replace(/(https?:\/\/[^\s/]+)\S*/gi, '$1/…').slice(0, 170);
}

export async function ingest(store, { text, scamType, label, familyId, tactics = [], seed = false, ts = Date.now(), vector, embedder }) {
  if (!vector) {
    const e = await embedTexts([`${label}. ${text}`]);
    vector = e.vectors[0]; embedder = e.embedder;
  }
  const th = embedder === 'local-hash' ? T.local : T.gemini;
  const recent = (await store.listRadarItems(ts - WINDOW_MS, 150)).filter((i) => i.embedder === embedder && i.ts <= ts + 1000);

  // A report joins an existing group only when it is the same kind of scam and
  // clearly similar, or near-identical text. Groups are never merged together,
  // so one odd message cannot glue two different campaigns into one.
  const sameKind = (i) => scamType !== 'none' && i.scamType === scamType;
  const neighbors = recent
    .map((i) => ({ i, s: cosine(vector, i.embedding) }))
    .filter(({ i, s }) => (sameKind(i) && s >= th.base) || s >= th.strong)
    .map(({ i }) => i);

  const item = { id: randomUUID(), ts, embedding: vector, embedder, scamType, label, familyId, seed, snippet: sanitizeSnippet(text), tactics: tactics.slice(0, 3), campaignId: null };

  let campaignId = null;
  if (neighbors.length) {
    const votes = {};
    for (const n of neighbors) if (n.campaignId) votes[n.campaignId] = (votes[n.campaignId] || 0) + 1;
    campaignId = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    if (!campaignId) campaignId = randomUUID().slice(0, 12);
    // Only adopt neighbours that are not already in another campaign.
    for (const n of neighbors) if (!n.campaignId) { n.campaignId = campaignId; await store.updateRadarItem(n.id, { campaignId }); }
    item.campaignId = campaignId;
  }
  await store.addRadarItem(item);
  if (!campaignId) return { campaign: null, item };

  const members = [...recent.filter((i) => i.campaignId === campaignId), item];
  const sorted = [...members].sort((a, b) => a.ts - b.ts);
  const hourAgo = ts - 3600 * 1000;
  const tacticCount = {};
  members.forEach((m) => (m.tactics || []).forEach((t) => (tacticCount[t] = (tacticCount[t] || 0) + 1)));
  const existing = await store.getCampaign(campaignId);
  const campaign = {
    id: campaignId,
    label: existing?.label || label,
    scamType,
    count: members.length,
    lastHour: members.filter((m) => m.ts >= hourAgo).length,
    familyCount: new Set(members.map((m) => m.familyId)).size,
    firstSeen: sorted[0].ts,
    lastSeen: ts,
    sample: sorted[0].snippet,
    tactics: Object.entries(tacticCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
    alert: members.length >= ALERT_AT,
    severity: members.length >= 6 ? 'high' : members.length >= ALERT_AT ? 'medium' : 'low',
    seed: existing ? !!existing.seed : members.every((m) => m.seed),
  };
  await store.upsertCampaign(campaign);
  return { campaign, item };
}
