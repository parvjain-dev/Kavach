// Deterministic guardrail layer. Runs on every message, even when Gemini is
// slow or unavailable. Gemini does the understanding; these rules make sure
// the obvious scams can never be marked "safe".

export const TACTICS = ['urgency', 'authority', 'fear', 'greed', 'secrecy', 'trust', 'isolation'];

// Each rule: id, regex (matched against the message), tactic, weight, scamType
const R = (id, re, tactic, weight, scamType) => ({ id, re, tactic, weight, scamType });

export const RULES = [
  // --- KYC / account block
  R('kyc', /\b(re-?kyc|e-?kyc|kyc)\b[^.\n]{0,60}\b(expir\w*|update\w*|pending|incomplete|verify|verification|suspend\w*|block\w*)/i, 'fear', 38, 'kyc_expiry'),
  R('kyc-hi', /(केवाईसी|के\.?वाई\.?सी)/i, 'fear', 38, 'kyc_expiry'),
  R('blocked', /\b(account|a\/c|card|upi|wallet|sim)\b[^.\n]{0,40}\b(block\w*|suspend\w*|deactivat\w*|freez\w*|clos\w*|disconnect\w*)/i, 'fear', 32, 'fake_bank_link'),
  R('blocked-hi', /(खाता|अकाउंट|कार्ड)[^.\n]{0,30}(बंद|ब्लॉक|सस्पेंड)/i, 'fear', 32, 'fake_bank_link'),
  // --- urgency
  R('urgent', /\b(immediately|urgent(ly)?|right now|today only|within \d+ ?(hours?|hrs?|minutes?|mins?)|last chance|final notice|expires? (today|tonight|soon)|act now|asap)\b/i, 'urgency', 20, null),
  R('urgent-hi', /(तुरंत|अभी|आज ही|24 घंटे|अंतिम चेतावनी|जल्दी)/i, 'urgency', 20, null),
  // --- sensitive info requests
  R('otp', /\b(otp|one[- ]time (password|pin)|upi ?pin|cvv|card number|atm pin|net ?banking password|mpin|aadhaar number|pan number)\b[^.\n]{0,50}\b(share|send|tell|give|enter|provide|confirm|forward)/i, 'trust', 55, 'phishing_other'),
  R('otp2', /\b(share|send|tell|give|enter|provide|confirm|forward)\b[^.\n]{0,40}\b(otp|upi ?pin|cvv|atm pin|mpin)\b/i, 'trust', 55, 'phishing_other'),
  R('otp-hi', /(ओटीपी|पिन|सीवीवी)[^.\n]{0,30}(बताएं|बताइए|भेजें|शेयर)/i, 'trust', 55, 'phishing_other'),
  // --- UPI collect
  R('collect', /\b(collect request|request money|approve (the )?(request|payment)|enter (your )?(upi )?pin to (receive|get)|to receive (money|payment|cashback|refund)[^.\n]{0,30}pin)/i, 'trust', 50, 'upi_collect'),
  // --- digital arrest / authority
  R('digital-arrest', /\b(digital arrest|arrest warrant|money laundering|narcotics|drugs? (found|in) (your )?(parcel|courier)|fedex|customs (officer|department)|cbi|ed officer|enforcement directorate|cyber ?crime (branch|police)|supreme court|ncb|trai|your (aadhaar|sim|number) (is|has been|will be) (linked|misused|used|blocked))\b/i, 'authority', 48, 'digital_arrest'),
  R('digital-arrest-hi', /(डिजिटल अरेस्ट|गिरफ्तार|वारंट|सीबीआई|कस्टम|नारकोटिक्स|मनी लॉन्ड्रिंग)/i, 'authority', 48, 'digital_arrest'),
  R('stay-on-call', /\b(stay on (the )?(call|line|video)|do not (disconnect|hang up|cut)|don'?t (disconnect|hang up|cut)|video call (with|to) (us|officer)|you are under (surveillance|investigation))/i, 'isolation', 40, 'digital_arrest'),
  R('secret', /\b(do not|don'?t|never) (tell|inform|share with|discuss with)[^.\n]{0,30}(anyone|family|bank|police|friends?)|keep (this|it) (confidential|secret)/i, 'secrecy', 35, null),
  R('secret-hi', /(किसी को (मत|न) बताएं|गोपनीय)/i, 'secrecy', 35, null),
  // --- links
  R('short-link', /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|tiny\.cc|wa\.me\/\+?\d{10,})\b/i, 'trust', 28, null),
  R('apk', /\b[\w-]+\.apk\b|install (the )?(app|apk)|download (the )?(app|apk)[^.\n]{0,30}(link|below)/i, 'trust', 45, 'loan_app'),
  R('remote-app', /\b(anydesk|teamviewer|quick ?support|rustdesk|airdroid)\b/i, 'trust', 55, 'tech_support'),
  R('odd-link', /https?:\/\/[^\s]*\.(xyz|top|icu|vip|click|live|online|site|cfd|sbs|buzz|shop|work|cc|club)\b[^\s]*/i, 'trust', 25, null),
  R('bank-lookalike', /https?:\/\/[^\s/]*(sbi|hdfc|icici|axis|paytm|phonepe|gpay|kotak|pnb|bob|npci|uidai|incometax|epfo|irctc)[^\s/]*\.(?!(co\.in|com|in|bank\.in|gov\.in|net\.in)(\/|\s|$))[a-z]+/i, 'trust', 38, null),
  R('bank-hyphen', /https?:\/\/[^\s/]*(sbi|hdfc|icici|axis|paytm|kotak|pnb|npci|uidai|incometax)[^\s/]*-[^\s/]*\.[a-z]+/i, 'trust', 38, null),
  // --- greed
  R('prize', /\b(you (have )?won|lottery|lucky (draw|winner)|congratulations[^.\n]{0,30}(won|selected|winner)|claim (your )?(prize|reward|gift|cashback)|kbc|free (gift|iphone|recharge)|reward points? (expire|expiring))/i, 'greed', 40, 'lottery_prize'),
  R('prize-hi', /(लॉटरी|इनाम जीत|आपने जीता|ईनाम)/i, 'greed', 40, 'lottery_prize'),
  R('invest', /\b(guaranteed (returns?|profit)|double your (money|investment)|\d{2,3}% (daily|weekly|monthly) (returns?|profit)|stock tips?|vip (group|trading)|crypto (investment|trading) (group|opportunity)|ipo allotment (group|tips))/i, 'greed', 42, 'investment'),
  R('job', /\b(work from home|part[- ]time (job|work)|earn (rs\.?|₹|inr)? ?\d[\d,]*[^.\n]{0,15}(per|a|\/) ?(day|hour)|like (and|&) (subscribe|share) (to )?earn|task[- ]based (job|earning)|registration fee|joining fee)/i, 'greed', 40, 'job_offer'),
  // --- parcel / bills
  R('parcel', /\b(parcel|courier|package|consignment)\b[^.\n]{0,60}\b(held|seized|stuck|detained|returned|customs|undelivered|incomplete address|pay[^.\n]{0,20}(fee|charge))/i, 'fear', 36, 'parcel_customs'),
  R('electricity', /\b(electricity|power|bijli|current) (bill|connection)[^.\n]{0,60}\b(disconnect\w*|cut|overdue|unpaid|tonight|9[: ]?30)/i, 'fear', 42, 'electricity_bill'),
  R('electricity-hi', /(बिजली)[^.\n]{0,40}(कट|बिल|कनेक्शन)/i, 'fear', 38, 'electricity_bill'),
  // --- relative in need
  R('relative', /\b(new number[^.\n]{0,40}(save|this is)|lost my phone|(i am|i'm|im) in (an )?(accident|hospital|police station|trouble)|need (money|cash|₹|rs\.?) ?\d*[^.\n]{0,15}(urgent|asap|now|today)|send (me )?(money|₹|rs\.?)[^.\n]{0,20}(urgent|immediately|now))/i, 'trust', 36, 'relative_in_need'),
  R('relative-hi', /(मैं मुसीबत में|दुर्घटना|पैसे भेज|अस्पताल में हूं)/i, 'trust', 36, 'relative_in_need'),
  // --- generic
  R('refund', /\b(refund|cashback|reversal)\b[^.\n]{0,50}\b(click|link|pin|otp|verify|scan|qr)/i, 'greed', 36, 'upi_collect'),
  R('qr', /\bscan (this |the )?(qr|code)\b[^.\n]{0,50}(receive|get|refund|claim)/i, 'greed', 40, 'upi_collect'),
  R('click', /\b(click|tap|open|visit)\b[^.\n]{0,25}\b(link|below|here|url)\b/i, 'trust', 12, null),
  R('pay-fee', /\b(processing|clearance|registration|release|insurance|gst|tax|handling) (fee|charge|amount)[^.\n]{0,40}(pay|send|transfer|deposit)/i, 'greed', 36, null),
];

const SAFE_HINTS = [
  /\b(otp)\b[^.\n]{0,50}\b(do not share|don'?t share|never share|not share with anyone)/i,
  /\b(debited|credited)\b[^.\n]{0,60}\b(a\/c|account|ac)\b/i,
];

const SPECIFIC = new Set(['kyc_expiry', 'digital_arrest', 'upi_collect', 'electricity_bill', 'parcel_customs', 'lottery_prize', 'investment', 'job_offer', 'tech_support', 'relative_in_need']);

const PROTECT = /\b(do not|don'?t|never|not)\s+(to\s+)?(share|send|tell|give|disclose|reveal|forward)\b[^.\n]{0,40}/gi;
const KYC_DONE = /\bkyc\b[^.\n]{0,40}\b(complete(d)?|successful(ly)?|done|approved|verified successfully)\b/i;

export function runRules(original = '') {
  // blank out protective advice in the text we scan (same length, so highlights still line up)
  const text = original.replace(PROTECT, (m) => ' '.repeat(m.length));
  const hits = [];
  const highlights = [];
  const scamVotes = {};
  let score = 0;
  for (const r of RULES) {
    if ((r.id === 'kyc' || r.id === 'kyc-hi') && KYC_DONE.test(text)) continue;
    const m = text.match(r.re);
    if (!m) continue;
    hits.push(r.id);
    score += r.weight;
    if (r.scamType) scamVotes[r.scamType] = (scamVotes[r.scamType] || 0) + r.weight + (SPECIFIC.has(r.scamType) ? 25 : 0);
    highlights.push({ quote: m[0].trim().slice(0, 120), tactic: r.tactic });
  }
  // OTP-safety notices ("never share OTP") are protective, not predatory
  if (SAFE_HINTS.some((re) => re.test(text)) && hits.length <= 1) score = Math.max(0, score - 40);
  // Several different signals together are far worse than one alone.
  const tactics = [...new Set(highlights.map((h) => h.tactic))];
  if (tactics.length >= 3) score += 12;
  score = Math.min(100, score);
  let scamType = Object.entries(scamVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
  if (scamType === 'none' && score >= 30 && hits.some((h) => /link|lookalike|hyphen/.test(h))) scamType = 'fake_bank_link';
  return { score, hits, tactics, highlights: dedupeHighlights(highlights), scamType };
}

function dedupeHighlights(list) {
  const seen = new Set();
  return list.filter((h) => {
    const k = h.quote.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function extractIndicators(text = '') {
  const phones = [...new Set((text.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g) || []).map((s) => s.replace(/[\s-]/g, '')))];
  const urls = [...new Set(text.match(/\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b[a-z0-9-]+\.(?:xyz|top|icu|vip|click|cfd|sbs|buzz|cc|club)\/?[^\s]*/gi) || [])];
  const upi = [...new Set(text.match(/\b[a-z0-9._-]{2,}@(?:ok(?:sbi|hdfcbank|icici|axis)|ybl|ibl|axl|paytm|apl|upi|sbi|oksbi|icici|hdfcbank|fbl|barodampay|postbank|ikwik|airtel|jio|pingpay|freecharge|axisbank)\b/gi) || [])];
  return { phones, urls, upi_ids: upi };
}

export const verdictFromScore = (s) => (s >= 65 ? 'SCAM' : s >= 30 ? 'SUSPICIOUS' : 'SAFE');

export const SCAM_LABELS = {
  kyc_expiry: 'Fake KYC-expiry message',
  upi_collect: 'UPI collect / refund trick',
  digital_arrest: 'Digital-arrest impersonation',
  fake_bank_link: 'Fake bank / account-block link',
  lottery_prize: 'Lottery / prize scam',
  parcel_customs: 'Parcel / customs fee scam',
  job_offer: 'Fake job / task earning offer',
  investment: 'Guaranteed-returns investment scam',
  loan_app: 'Malicious loan / APK app',
  tech_support: 'Remote-access tech-support scam',
  electricity_bill: 'Electricity disconnection scam',
  relative_in_need: 'Relative-in-need impersonation',
  phishing_other: 'Credential phishing',
  none: 'No known scam pattern',
};

// Short fallback copy (used only when Gemini is unreachable).
const FALLBACK = {
  en: {
    SCAM: ['This is a scam. Do not reply.', 'This message uses pressure and fear to make you act without thinking. Real banks and officials never ask for OTP, PIN or money like this.'],
    SUSPICIOUS: ['Be careful. This looks suspicious.', 'Some parts of this message look like a trick. Do not click, pay or share anything until your family checks it.'],
    SAFE: ['This looks normal.', 'We did not find signs of a scam. Still, never share your OTP or PIN with anyone.'],
    next: ['Do not click any link or call any number in the message.', 'Show this to your family member now.', 'If money was lost, call 1930 immediately (cyber crime helpline).'],
    dont: ['Do not share OTP, PIN or card number.', 'Do not install any app they ask for.', 'Do not stay on the call or video call.'],
  },
  hi: {
    SCAM: ['यह धोखाधड़ी है। जवाब न दें।', 'यह संदेश डर और जल्दबाज़ी से आपसे काम करवाना चाहता है। असली बैंक या अधिकारी कभी OTP, पिन या पैसे ऐसे नहीं माँगते।'],
    SUSPICIOUS: ['सावधान रहें। यह संदिग्ध लगता है।', 'इस संदेश में कुछ बातें धोखे जैसी हैं। परिवार से पूछे बिना न लिंक खोलें, न पैसे भेजें, न कुछ बताएं।'],
    SAFE: ['यह सामान्य लगता है।', 'हमें धोखाधड़ी के संकेत नहीं मिले। फिर भी OTP या पिन किसी को न बताएं।'],
    next: ['संदेश में दिए लिंक पर क्लिक न करें, न ही नंबर पर फ़ोन करें।', 'अभी यह अपने परिवार के सदस्य को दिखाएं।', 'अगर पैसे कट गए हों तो तुरंत 1930 पर फ़ोन करें।'],
    dont: ['OTP, पिन या कार्ड नंबर किसी को न बताएं।', 'वे जो ऐप कहें, उसे इंस्टॉल न करें।', 'कॉल या वीडियो कॉल पर न रुकें।'],
  },
  kn: {
    SCAM: ['ಇದು ವಂಚನೆ. ಉತ್ತರಿಸಬೇಡಿ.', 'ಈ ಸಂದೇಶ ಭಯ ಮತ್ತು ಆತುರ ಹುಟ್ಟಿಸಿ ನಿಮ್ಮಿಂದ ಕೆಲಸ ಮಾಡಿಸಲು ನೋಡುತ್ತಿದೆ. ನಿಜವಾದ ಬ್ಯಾಂಕ್ ಅಥವಾ ಅಧಿಕಾರಿಗಳು OTP, ಪಿನ್ ಅಥವಾ ಹಣ ಹೀಗೆ ಕೇಳುವುದಿಲ್ಲ.'],
    SUSPICIOUS: ['ಎಚ್ಚರಿಕೆ. ಇದು ಅನುಮಾನಾಸ್ಪದವಾಗಿದೆ.', 'ಈ ಸಂದೇಶದ ಕೆಲವು ಭಾಗಗಳು ಮೋಸದಂತೆ ಕಾಣುತ್ತವೆ. ಕುಟುಂಬದವರು ನೋಡುವವರೆಗೆ ಲಿಂಕ್ ತೆರೆಯಬೇಡಿ, ಹಣ ಕಳುಹಿಸಬೇಡಿ.'],
    SAFE: ['ಇದು ಸಾಮಾನ್ಯವಾಗಿ ಕಾಣುತ್ತದೆ.', 'ವಂಚನೆಯ ಲಕ್ಷಣಗಳು ಕಂಡುಬರಲಿಲ್ಲ. ಆದರೂ OTP ಅಥವಾ ಪಿನ್ ಯಾರಿಗೂ ಹೇಳಬೇಡಿ.'],
    next: ['ಸಂದೇಶದಲ್ಲಿರುವ ಲಿಂಕ್ ಒತ್ತಬೇಡಿ, ನಂಬರ್‌ಗೆ ಕರೆ ಮಾಡಬೇಡಿ.', 'ಈಗಲೇ ಇದನ್ನು ಕುಟುಂಬದವರಿಗೆ ತೋರಿಸಿ.', 'ಹಣ ಹೋಗಿದ್ದರೆ ತಕ್ಷಣ 1930 ಗೆ ಕರೆ ಮಾಡಿ.'],
    dont: ['OTP, ಪಿನ್ ಅಥವಾ ಕಾರ್ಡ್ ಸಂಖ್ಯೆ ಹೇಳಬೇಡಿ.', 'ಅವರು ಹೇಳುವ ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಬೇಡಿ.', 'ಕರೆ ಅಥವಾ ವೀಡಿಯೊ ಕರೆಯಲ್ಲಿ ಇರಬೇಡಿ.'],
  },
};

export function fallbackCopy(lang, verdict) {
  const f = FALLBACK[lang] || FALLBACK.en;
  return { headline: f[verdict][0], explanation: f[verdict][1], what_to_do_next: f.next, do_not: f.dont, localized: !!FALLBACK[lang] };
}

export const TACTIC_COPY = {
  en: { urgency: 'Urgency', authority: 'Fake authority', fear: 'Fear', greed: 'Greed', secrecy: 'Secrecy', trust: 'Abusing trust', isolation: 'Isolation' },
  hi: { urgency: 'जल्दबाज़ी', authority: 'झूठा अधिकारी', fear: 'डर', greed: 'लालच', secrecy: 'गोपनीयता का दबाव', trust: 'भरोसे का दुरुपयोग', isolation: 'अकेला करना' },
  kn: { urgency: 'ಆತುರ', authority: 'ನಕಲಿ ಅಧಿಕಾರ', fear: 'ಭಯ', greed: 'ಆಸೆ', secrecy: 'ರಹಸ್ಯದ ಒತ್ತಡ', trust: 'ನಂಬಿಕೆಯ ದುರ್ಬಳಕೆ', isolation: 'ಒಂಟಿಯಾಗಿಸುವುದು' },
};
export const tacticName = (lang, t) => (TACTIC_COPY[lang] || TACTIC_COPY.en)[t] || t;
