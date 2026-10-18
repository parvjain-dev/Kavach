# Kavach benchmark

Mode: rules-engine safety net only (offline, no Gemini)
Test set: 43 messages (27 scams across 14 scam families in English, Hindi and Kannada; 16 genuine messages incl. bank debit alerts, OTP notices, delivery and family chat)

| Metric | Result |
|---|---|
| Scams flagged (SCAM or SUSPICIOUS) | 27/27 (100.0%) |
| Scams given the strongest verdict (SCAM) | 14/27 (51.9%) |
| Genuine messages wrongly flagged | 0/16 (0.0%) |
| Scam family identified correctly | 25/27 (92.6%) |
| Latency p50 / p95 | 0 ms / 7 ms |

## Misses and false alarms
- none
