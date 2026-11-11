# DutyLock

**Charge US import duties exactly: AI finds every tariff code US customs could apply, PayPal holds the highest duty, and the seller captures only what customs actually charges.**

Built for the PayPal AI Hackathon (2026).

## The problem

Since August 2025 the US no longer lets parcels under $800 in duty-free, and since July 2026 even postal parcels need formal duty payment. Every small seller abroad who ships to a US customer now owes duty on every order, usually under Delivered Duty Paid terms: the courier advances the duty at the border and bills the seller weeks later.

The seller has to charge the buyer at checkout, but the amount is unknowable then, because **US customs decides the tariff code, and the code decides the rate**:

| Product (demo shop) | If customs reads it as | Duty |
|---|---|---|
| Brass candle holder from Portugal, $64 | non-electrical lighting fitting of brass (9405.50.30) | 10% (EU floor under Section 301) |
| | household article of copper (7418.10.00) | 53% (3% + Section 232 copper 50%) |
| Espadrilles from Spain, $79 | rubber/plastics under 10% of the shoe's weight (6404.19.25) | 10% (EU floor) |
| | rubber/plastics 10% or more (6404.19.39) | 37.5% |
| Waxed canvas weekender from the UK, $185 | outer surface of cotton textile (4202.92.15) | 16.3% (6.3% + 10%) |
| | outer surface of leather (4202.91.90) | 14.5% (4.5% + 10%) |
| Celadon tea set from Japan, $168 | porcelain (6911.10.58) or stoneware (6912.00.45) | 12.5% either way (Japan floor) |

These are the codes Claude returned for the demo listings (saved runs in `data/precomputed/`).

Charge the low rate and the seller eats the difference. Charge a flat high rate and the buyer overpays or abandons the cart. Ship duties-unpaid and the buyer gets a surprise bill and often refuses the parcel.

## What DutyLock does

1. **Classify with AI.** Claude (Opus 5.5) reads the seller's listing and explores the real US Harmonized Tariff Schedule through tools (`search_hts`, `browse_hts`, `get_hts_line`) over USITC data (HTSUS 2026 Revision 23). It returns the most likely 10-digit line and every plausible alternative, each with its reasoning under the General Rules of Interpretation and the single fact that would decide it.
2. **Price in code, not in the model.** The model never states a rate. Code reads each line's rate from the schedule, adds the duties that apply to the origin (Section 301 forced-labor duties by country, Section 232 copper duty, from HTSUS chapter 99), and the CBP merchandise processing fee. Codes the model submits are validated against the schedule; invalid ones are sent back to the model.
3. **Hold with PayPal.** The buyer approves a PayPal order with `intent: AUTHORIZE` for goods, shipping and the **highest plausible duty**. Nothing beyond the final amount will be charged.
4. **Capture the real number.** When the courier's duties invoice arrives, Claude transcribes it (PDF or photo) with structured output. Code checks it: line items add up, the air waybill matches this order, the tariff line customs used was one we held for, the customs value matches. A person approves, and PayPal captures goods + shipping + assessed duties with `final_capture: true`, which releases the rest of the authorization to the buyer. The tracking number is then attached to the capture.

The buyer sees the hold, the assessment and the release on the order page.

## PayPal integration

| PayPal API | Where | Why it is needed |
|---|---|---|
| Orders v2 `POST /v2/checkout/orders` (`intent: AUTHORIZE`) | `src/lib/paypal.ts`, `src/app/api/orders/route.ts` | Line items show the goods and the duty hold separately |
| PayPal JavaScript SDK Buttons (`intent=authorize`) | `src/components/PayPalButton.tsx` | Buyer approval |
| Orders v2 `POST /v2/checkout/orders/{id}/authorize` | `src/app/api/orders/[id]/authorize/route.ts` | Places the hold |
| Payments v2 `POST /v2/payments/authorizations/{id}/capture` with `final_capture: true` | `src/app/api/orders/[id]/settle/route.ts` | Captures only the assessed amount and releases the rest |
| Orders v2 `POST /v2/checkout/orders/{id}/track` | same | Attaches the courier tracking number to the capture |
| Webhooks + `POST /v1/notifications/verify-webhook-signature` | `src/app/api/paypal/webhook/route.ts` | Authorization and capture events, signature-verified |
| `PayPal-Request-Id` idempotency keys | `src/lib/paypal.ts` | Retries never double-charge |

## AI tools used

- **Claude Opus 5.5** (Anthropic API, `claude-opus-5-5`) for tariff classification, as a tool-using agent over the HTSUS data, with adaptive thinking at high effort, prompt caching, and server-side refusal fallback.
- **Claude Opus 5.5** with structured outputs (Zod schema) to transcribe customs duty invoices from PDF or images.
- Claude Code was used as a coding assistant while building the project.

Guardrails live in code: every code the model submits must exist in the schedule, rates and holds are computed from data, the settlement amount comes from a signed proposal that the browser cannot change, the capture never exceeds the authorization, and a person approves before money moves. Live AI calls are rate-limited per visitor on the public demo.

## Try it

**Hosted demo:** _URL added at deployment_

1. Open **Demo shop**, pick a product. The duty estimate appears (the three catalog products replay a saved classification run instantly; "Run the classification live" re-runs Claude).
2. Pay with the PayPal sandbox buyer account (credentials are in the Devpost submission's testing instructions), or choose "Debit or Credit Card" and use a [PayPal sandbox test card](https://developer.paypal.com/tools/sandbox/card-testing/).
3. On the order page, open **Seller console**: ship, choose the tariff line customs applies, generate the courier's duties invoice, let Claude read it, approve the capture.
4. **Classify your product** runs Claude live on any listing you type.

## Run it locally

Requirements: Node.js 20.9+, a PayPal developer account (sandbox REST app), an Anthropic API key.

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

| Variable | |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app (developer.paypal.com > Apps & Credentials) |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Same client id, for the browser SDK |
| `ANTHROPIC_API_KEY` | platform.claude.com |
| `QUOTE_SIGNING_SECRET` | Any long random string |
| `PAYPAL_WEBHOOK_ID` | Optional, to verify webhooks |
| `AI_CALLS_PER_HOUR` | Optional, live AI runs per visitor per hour (default 30) |

## How it is built

```
data/hts.json                 HTSUS 2026 Rev. 23, chapters 33–97 relevant to consumer goods (USITC REST export)
data/precomputed/*.json       Saved classification runs for the three demo products
src/lib/hts.ts                Schedule loading, rate inheritance, search, rate parsing
src/lib/classify.ts           Claude classification agent (tools + validation)
src/lib/duty-rules.ts         Section 301 / 232 / MPF rules with sources (one place to update)
src/lib/quote.ts              Duty per candidate, hold, HMAC-signed quote
src/lib/bill.ts               Claude transcription of the duties invoice (structured output)
src/lib/customs-sim.ts        Demo stand-in for the courier: issues a duties invoice PDF
src/lib/paypal.ts             PayPal REST client
src/app/api/...               Quote stream, order, authorize, customs bill, settle, webhook
```

There is no database: PayPal holds every amount, and the signed quote travels with the browser.

## Limits and honesty notes

- Duty rules reflect HTSUS 2026 Revision 23 and Federal Register notices as of 2026-11-11 (sources below). US tariff measures change often; `src/lib/duty-rules.ts` is the single place to update them.
- The demo loads the tariff chapters typical for handmade and consumer goods; codes outside them are flagged.
- Free-trade-agreement preferences (for example KORUS) and China's legacy Section 301 lists are not modeled.
- The courier ("Meridian Express") and the makers in the demo shop are fictional. Estimates are not customs advice.

## Sources

- USITC Harmonized Tariff Schedule, 2026 Revision 23, REST export: https://hts.usitc.gov/
- De minimis suspension: EO 14324 (https://www.federalregister.gov/d/2025-14897), EO 14388 (https://www.federalregister.gov/d/2026-03829); CBP interim final rules 2026-12669 and 2026-12670
- Section 301 forced-labor action: https://www.federalregister.gov/d/2026-15181, https://www.federalregister.gov/d/2026-15274 (HTSUS 9903.05.20–9903.05.99, US note 52)
- Section 232 metals: https://www.federalregister.gov/d/2026-06960 (HTSUS 9903.82.02, US note 16)
- Merchandise processing fee FY2027: https://www.federalregister.gov/d/2026-15530

## License

MIT
