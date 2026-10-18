// Minimal stand-in for the Gemini REST API so the request/response handling can be tested offline.
import http from 'node:http';
const PORT = Number(process.env.MOCK_PORT || 9911);
const canned = (text) => ({
  verdict: 'SCAM', risk_score: 94, scam_type: 'kyc_expiry', campaign_label: 'Fake KYC-expiry SMS',
  guardian_summary: 'A fake KYC-expiry SMS trying to steal bank login details. Tell Papa not to click the link.',
  claims_to_be: 'SBI bank', extracted_text: text || 'Your SBI KYC has expired. Update immediately: http://sbi-kyc.xyz',
  headline: 'यह धोखा है, जवाब न दें', explanation: 'यह संदेश आपको डराकर लिंक खुलवाना चाहता है। बैंक कभी ऐसे लिंक नहीं भेजता।',
  tactics: [{ id: 'fear', why: 'खाता बंद होने का डर दिखाया गया है।' }, { id: 'urgency', why: 'जल्दी करने का दबाव है।' }],
  highlights: [{ quote: 'KYC has expired', tactic: 'fear' }, { quote: 'THIS TEXT IS NOT IN THE MESSAGE', tactic: 'fear' }, { quote: 'immediately', tactic: 'urgency' }],
  what_to_do_next: ['लिंक पर क्लिक न करें।', 'बैंक की शाखा में पूछें।'], do_not: ['OTP न बताएं।'],
  indicators: { phones: [], urls: ['http://sbi-kyc.xyz'], upi_ids: [] },
});
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c));
  req.on('end', () => {
    const j = (() => { try { return JSON.parse(b); } catch { return {}; } })();
    console.log(req.method, req.url.split('?')[0]);
    res.setHeader('Content-Type', 'application/json');
    if (/embed/i.test(req.url)) {
      const n = (j.requests || [j]).length || 1;
      const vec = () => Array.from({ length: 256 }, (_, i) => Math.sin(i * 1.3) + (Math.random() - 0.5) * 0.05);
      return res.end(JSON.stringify({ embeddings: Array.from({ length: n }, () => ({ values: vec() })) }));
    }
    if (/models\/gemini-3\.8-flash/.test(req.url) && process.env.MOCK_404) { res.statusCode = 404; return res.end(JSON.stringify({ error: { code: 404, message: 'model not found', status: 'NOT_FOUND' } })); }
    const text = j.contents?.[0]?.parts?.find((p) => p.text?.includes('"""'))?.text?.split('"""')[1]?.trim();
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(canned(text)) }] }, finishReason: 'STOP' }] }));
  });
}).listen(PORT, () => console.log('mock gemini on', PORT));
