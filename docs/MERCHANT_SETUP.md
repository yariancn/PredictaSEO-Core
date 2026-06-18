# PredictaCore — what we need from you before App Store submit

## Required (you)

1. **Shopify Markets configured** on each merchant store  
   Admin → Settings → Markets → add countries/regions where the store sells (e.g. Argentina, Mexico, US).

2. **Railway production variables**
   - `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`
   - `SHOPIFY_APP_URL` = `https://predictaseo-core-production.up.railway.app`
   - `DATABASE_URL` (Postgres)
   - `GEMINI_API_KEY` (AI summaries + top-priority product copy)
   - `NODE_ENV=production`
   - `CRON_SECRET` (monthly re-apply cron)
   - For App Store review: `BILLING_DISABLED=false`
   - For dev testing without charges: `BILLING_DISABLED=true`

3. **Deploy to Shopify**
   ```bash
   npm run deploy
   ```
   Then activate theme blocks on merchant themes:
   - **PredictaCore Brand** (head — organization + website schema)
   - **PredictaCore Product** (product template — product JSON-LD)

4. **App Store listing** (Partners): screenshots, screencast, privacy URL  
   `https://predictaseo-core-production.up.railway.app/privacy`

5. **Confirm markets in app** — Step 1 → “Confirm target markets” before Apply.

## Optional (validation layer v2 — not blocking submit)

- **Google Search Console** OAuth — future integration for measured traffic (requires Google Cloud project + credentials from you).
- **Bing Webmaster Tools** — same, optional.

## Shopify compliance (already in code)

- GDPR webhooks (`/webhooks/compliance`)
- No customer PII scopes
- Billing via Shopify Billing API
- Backup + restore before destructive changes
- Listing must not promise guaranteed rankings (app copy uses “estimated readiness”)
