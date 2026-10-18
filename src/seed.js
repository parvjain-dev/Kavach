// Demo seed: realistic scam traffic from OTHER families (community radar) and a
// few earlier reports for this family, so the dashboard looks alive at once.
import { randomUUID } from 'node:crypto';
import { analyze } from './gemini.js';
import { embedTexts } from './embed.js';
import { ingest } from './radar.js';
import { runRules } from './rules.js';

const KYC = [
  'SBI ALERT: Your YONO account KYC has expired. Update now to avoid permanent block: http://sbi-kyc-verify.xyz/update',
  'Dear customer, your SBI account will be blocked today as KYC is pending. Click http://yono-sbi-update.top/kyc and update immediately.',
  'State Bank: KYC not updated. Account suspended within 24 hrs. Verify PAN & Aadhaar at http://sbikyc-secure.icu/login',
  'URGENT: SBI Net Banking will be deactivated tonight. Complete e-KYC https://sbi-ekyc-portal.cfd/verify',
  'Your SBI account is blocked due to incomplete KYC. Call 9876501234 or visit http://kyc-sbi-online.xyz to unblock.',
  'SBI Yono: Last chance! Update KYC today else account closed. Link: http://bit.ly/sbi-kyc-now',
];
const ARREST = [
  'This is Mumbai Cyber Crime. A parcel booked in your Aadhaar has drugs. You are under digital arrest. Stay on video call and tell no one.',
  'CBI officer speaking. Your number is linked to money laundering case. Arrest warrant issued. Do not disconnect the call, pay security deposit to clear.',
  'FedEx customs: illegal passport found in your parcel. Connecting you to Narcotics Bureau officer on WhatsApp video. Do not inform your family.',
];
const REFUND = [
  'Your electricity refund of Rs 2,340 is ready. Approve the collect request on your UPI app and enter PIN to receive money.',
  'Cashback Rs 4,999 pending. Scan this QR code and enter your UPI PIN to receive the amount.',
];

const FAMILY_ITEMS = [
  { ageMin: 190, text: 'Dear customer your SBI KYC is expired, account will be blocked in 24 hours. Update at http://sbi-kyc-update.xyz/login', handled: true },
  { ageMin: 1340, text: 'Rs 1,250.00 debited from A/c XX4821 on 17-Oct-26 at BIGBASKET. If not you, call the number on the back of your card. Never share OTP.', handled: true },
  { ageMin: 75, text: 'Hello sir, this is Inspector Rao from CBI. A parcel in your name contains illegal items. You are under digital arrest. Do not disconnect this call and do not tell your family or bank.', handled: false },
];

export async function seedCommunity(store, { includeFamily } = {}) {
  const now = Date.now();
  const items = [
    ...KYC.map((text, i) => ({ text, ageMin: 52 - i * 8, scamType: 'kyc_expiry', label: 'Fake KYC-expiry SMS', tactics: ['fear', 'urgency', 'trust'] })),
    ...ARREST.map((text, i) => ({ text, ageMin: 40 - i * 12, scamType: 'digital_arrest', label: 'Digital-arrest impersonation', tactics: ['authority', 'fear', 'isolation'] })),
    ...REFUND.map((text, i) => ({ text, ageMin: 30 - i * 9, scamType: 'upi_collect', label: 'UPI collect / refund trick', tactics: ['greed', 'trust'] })),
  ];
  const { vectors, embedder } = await embedTexts(items.map((i) => `${i.label}. ${i.text}`));
  // oldest first so campaigns form naturally
  const order = items.map((it, idx) => ({ it, idx })).sort((a, b) => b.it.ageMin - a.it.ageMin);
  let n = 0;
  for (const { it, idx } of order) {
    await ingest(store, { text: it.text, scamType: it.scamType, label: it.label, familyId: `seed-${(n++ % 9) + 1}`, tactics: it.tactics, seed: true, ts: now - it.ageMin * 60000, vector: vectors[idx], embedder });
  }
  return items.length;
}

export async function seedFamily(store, family) {
  const now = Date.now();
  const out = [];
  for (const f of FAMILY_ITEMS) {
    const a = await analyze({ text: f.text, language: family.language || 'en' });
    const ts = now - f.ageMin * 60000;
    const report = {
      id: randomUUID(), familyId: family.code, guardianUid: family.guardianUid, parentName: family.parentName,
      createdAt: ts, inputKind: 'text', language: family.language || 'en', preview: f.text.slice(0, 400), analysis: a,
      handled: f.handled, source: 'seed', campaignId: null, campaignCount: 0,
    };
    if (a.verdict !== 'SAFE') {
      const { campaign } = await ingest(store, { text: a.extracted_text || f.text, scamType: a.scam_type, label: a.campaign_label, familyId: family.code, tactics: a.tactics.map((t) => t.id), seed: true, ts });
      if (campaign) { report.campaignId = campaign.id; report.campaignCount = campaign.count; }
    }
    await store.addReport(report);
    out.push(report.id);
  }
  return out;
}
