# Kavach (कवच): a family scam shield

Built for the Google Cloud **AI Builder Cup**, theme **BFSI: Intelligent Risk, Fraud & Financial Experiences**.

Elderly and first-time digital users lose money to UPI collect tricks, fake KYC messages, "digital arrest" calls and look-alike bank links. Kavach lets them show anything suspicious (pasted SMS, screenshot or voice note) and get a verdict in their own language in seconds. It names the psychological trick being used, highlights the manipulative phrases, and alerts a family guardian live. When the same scam hits many families, Scam Radar raises a community alert.

## What it does

- **Verdict stamp.** `SCAM`, `CAREFUL` or `LOOKS SAFE`, with the dangerous phrases underlined inside the original message.
- **Names the tactic.** Urgency, fake authority, fear, greed, secrecy, abused trust, isolation. Each with a one-line explanation in simple words.
- **Seven languages.** English, Hindi, Kannada, Tamil, Telugu, Marathi, Bengali. Read-aloud button using the phone's own voice.
- **Text, screenshot or voice note.** Gemini transcribes audio and reads screenshots.
- **Family Guardian loop.** The guardian's dashboard updates the instant the parent checks something (Firestore listeners). Call, mark handled, or block the sender.
- **Scam Radar.** Every flagged report is embedded and matched against the last 24 hours across all families. Similar reports form a campaign ("Fake KYC-expiry SMS: 14 reports from 9 families, 12 in the last hour").
- **Safety net.** A deterministic rule engine can raise a verdict but never lower one, and answers on its own if Gemini is unreachable. Text inside a message that tries to instruct the AI is treated as a scam signal.

## How it uses the required technology

| Tech | Role |
|---|---|
| **Gemini** | Multimodal analysis (text, image, audio in) returning structured JSON: verdict, scam family, tactics, exact highlighted quotes, multilingual explanation, English guardian summary. `gemini-embedding-001` embeddings power Scam Radar. Model chain falls back across Flash versions. |
| **Cloud Run** | One Node/Express service serves the static app and the API (`/api/analyze`, family, radar, guardian actions). |
| **Firestore** | `families`, `reports`, `campaigns`, `radar_items`. Browsers subscribe with `onSnapshot` for live updates. Security rules: a guardian reads only their own family's reports. |
| **Firebase** | Authentication (Google or guest) for guardians, Hosting in front of Cloud Run, Firestore security rules. |

## Architecture

See `docs/diagrams/architecture.png` and `docs/diagrams/flow.png`.

```
Parent phone ──► Cloud Run /api/analyze ──► Gemini (multimodal JSON) ─┐
                      │                                                ├─► merge ─► Firestore ─► Guardian dashboard (live)
                      └──► Safety-net rules ───────────────────────────┘             └─► Scam Radar campaigns
```

## Run locally (no cloud account needed)

```bash
npm install
npm run dev            # in-memory store, rule engine; add GEMINI_API_KEY to use Gemini
# open http://localhost:8080
```

With `GEMINI_API_KEY` set, local runs use real Gemini. Without it the safety-net rules answer.

## Deploy (Cloud Shell, about 15 minutes)

1. Create a Google Cloud project with billing enabled, then add it in the Firebase console.
2. Firebase console: **Authentication** > enable **Google** and **Anonymous**. **Firestore** > create database (Native mode, `asia-south1`). **Project settings** > add a Web app and copy the config.
3. Get a Gemini API key at <https://aistudio.google.com/apikey>.
4. In Cloud Shell: `git clone <this repo> && cd kavach`, then `cp env.example .env.deploy` and fill in the values.
5. `bash deploy.sh`. It enables APIs, deploys to Cloud Run and runs a deep health check against Gemini and Firestore.
6. `bash deploy-firebase.sh`. It deploys the Firestore security rules (required) and Firebase Hosting (optional).
7. Firebase console > Authentication > Settings > **Authorized domains** > add the `*.run.app` host that `deploy.sh` printed.

Verify any time: `GET /api/health?deep=1` makes one real Gemini call and one Firestore read.

## Benchmark

`node test/bench.mjs [deployed-url]` runs 43 labelled messages (27 scams, 16 genuine) and writes `docs/benchmark.md`. See that file for the latest numbers. The dataset is written by the team, so treat the figures as a regression check, not an independent accuracy claim.

## Project layout

```
server.js            Express app, API routes, Firebase config endpoint
src/gemini.js        Prompt, JSON schema, model chain, verdict merge
src/rules.js         Safety-net rules, indicators, fallback copy
src/radar.js         Campaign clustering
src/embed.js         Gemini embeddings + local fallback
src/store.js         Firestore store + in-memory store for local dev
src/seed.js          Demo data
public/              App (vanilla JS, self-hosted fonts, bundled Firebase SDK)
firestore.rules      Security rules
deploy.sh            Cloud Run deploy
```

## Privacy and limits

- Messages are sent to the Gemini API for analysis. Radar stores an embedding plus a sanitized snippet, never the family code or name.
- Kavach is a decision aid, not a guarantee. It always points people to the national cyber-crime helpline **1930** and cybercrime.gov.in.
- Forwarding from SMS or WhatsApp is simulated by paste or upload. A production version would use an Android share-target and a WhatsApp Business bot.
