// Storage layer. Production = Firestore (firebase-admin, Application Default
// Credentials on Cloud Run). Local dev = in-memory (USE_MEMORY_STORE=1) so the
// whole app can be tested without any cloud account.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(200);

class MemoryStore {
  constructor() {
    this.kind = 'memory';
    this.families = new Map();
    this.reports = new Map();
    this.radar = new Map();
    this.campaigns = new Map();
  }
  async createFamily(f) { this.families.set(f.code, f); return f; }
  async getFamily(code) { return this.families.get(code) || null; }
  async getFamilyByGuardian(uid) { return [...this.families.values()].find((f) => f.guardianUid === uid) || null; }
  async updateFamily(code, patch) { const f = this.families.get(code); Object.assign(f, patch); return f; }

  async addReport(r) { this.reports.set(r.id, r); bus.emit(`reports:${r.guardianUid}`); return r; }
  async getReport(id) { return this.reports.get(id) || null; }
  async updateReport(id, patch) { const r = this.reports.get(id); if (!r) return null; Object.assign(r, patch); bus.emit(`reports:${r.guardianUid}`); return r; }
  async listReportsByGuardian(uid, limit = 60) {
    return [...this.reports.values()].filter((r) => r.guardianUid === uid).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  async deleteReportsByFamily(code) {
    for (const [id, r] of this.reports) if (r.familyId === code) { this.reports.delete(id); bus.emit(`reports:${r.guardianUid}`); }
  }

  async addRadarItem(i) { this.radar.set(i.id, i); return i; }
  async updateRadarItem(id, patch) { Object.assign(this.radar.get(id) || {}, patch); }
  async listRadarItems(sinceMs, limit = 150) {
    return [...this.radar.values()].filter((i) => i.ts >= sinceMs).sort((a, b) => b.ts - a.ts).slice(0, limit);
  }
  async deleteSeedRadar() {
    for (const [id, i] of this.radar) if (String(i.familyId).startsWith('seed-')) this.radar.delete(id);
    for (const [id, c] of this.campaigns) if (c.seed) this.campaigns.delete(id);
    bus.emit('campaigns');
  }

  async upsertCampaign(c) { this.campaigns.set(c.id, c); bus.emit('campaigns'); return c; }
  async getCampaign(id) { return this.campaigns.get(id) || null; }
  async listCampaigns(limit = 20) { return [...this.campaigns.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, limit); }
}

class FirestoreStore {
  constructor(db) {
    this.kind = 'firestore';
    this.db = db;
  }
  col(n) { return this.db.collection(n); }
  async createFamily(f) { await this.col('families').doc(f.code).set(f); return f; }
  async getFamily(code) { const d = await this.col('families').doc(code).get(); return d.exists ? d.data() : null; }
  async getFamilyByGuardian(uid) {
    const q = await this.col('families').where('guardianUid', '==', uid).limit(1).get();
    return q.empty ? null : q.docs[0].data();
  }
  async updateFamily(code, patch) { await this.col('families').doc(code).set(patch, { merge: true }); return this.getFamily(code); }

  async addReport(r) { await this.col('reports').doc(r.id).set(r); return r; }
  async getReport(id) { const d = await this.col('reports').doc(id).get(); return d.exists ? d.data() : null; }
  async updateReport(id, patch) { await this.col('reports').doc(id).set(patch, { merge: true }); return this.getReport(id); }
  async listReportsByGuardian(uid, limit = 60) {
    const q = await this.col('reports').where('guardianUid', '==', uid).limit(300).get();
    return q.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  async deleteReportsByFamily(code) {
    const q = await this.col('reports').where('familyId', '==', code).get();
    const batch = this.db.batch();
    q.docs.forEach((d) => batch.delete(d.ref));
    if (!q.empty) await batch.commit();
  }

  async addRadarItem(i) { await this.col('radar_items').doc(i.id).set(i); return i; }
  async updateRadarItem(id, patch) { await this.col('radar_items').doc(id).set(patch, { merge: true }); }
  async listRadarItems(sinceMs, limit = 150) {
    const q = await this.col('radar_items').where('ts', '>=', sinceMs).orderBy('ts', 'desc').limit(limit).get();
    return q.docs.map((d) => d.data());
  }
  async deleteSeedRadar() {
    const items = await this.col('radar_items').where('seed', '==', true).get();
    const camps = await this.col('campaigns').where('seed', '==', true).get();
    const batch = this.db.batch();
    items.docs.forEach((d) => batch.delete(d.ref));
    camps.docs.forEach((d) => batch.delete(d.ref));
    if (!items.empty || !camps.empty) await batch.commit();
  }

  async upsertCampaign(c) { await this.col('campaigns').doc(c.id).set(c, { merge: true }); return c; }
  async getCampaign(id) { const d = await this.col('campaigns').doc(id).get(); return d.exists ? d.data() : null; }
  async listCampaigns(limit = 20) {
    const q = await this.col('campaigns').orderBy('lastSeen', 'desc').limit(limit).get();
    return q.docs.map((d) => d.data());
  }
}

export async function createStore() {
  if (process.env.USE_MEMORY_STORE === '1') return new MemoryStore();
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || undefined });
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return new FirestoreStore(db);
}
