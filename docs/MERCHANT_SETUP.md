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

## Medición de resultados (sin Google)

PredictaCore **no usa Google ni Shopify Analytics** para medir tráfico. La validación es **interna**:

- Score de preparación para IA (probabilístico)
- Alineación de mercados (países donde vendes)
- Completitud de catálogo + schema JSON-LD
- Reporte pre/post Apply en la app

Los cambios en tráfico real tardan semanas y dependen de Google/ChatGPT/Perplexity — no los controlamos ni los medimos con APIs externas en v1.

## Optional (not planned for v1)

- Integraciones externas (Search Console, Bing) — **no necesarias** para la app ni para Shopify App Store review.

## Shopify compliance (already in code)

- GDPR webhooks (`/webhooks/compliance`)
- No customer PII scopes
- Billing via Shopify Billing API
- Backup + restore before destructive changes
- Listing must not promise guaranteed rankings (app copy uses “estimated readiness”)
