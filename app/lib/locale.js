export function getStoreLocale(data) {
  const locales = data?.shopLocales ?? [];
  const primary = locales.find((l) => l.primary && l.published);
  const fallback = locales.find((l) => l.published);
  const code = (primary ?? fallback)?.locale ?? "en";
  if (code.startsWith("es")) return "es";
  if (code.startsWith("fr")) return "fr";
  return "en";
}

export const SHOP_LOCALE_QUERY = `#graphql
  query PredictaCoreShopLocale {
    shopLocales {
      locale
      primary
      published
    }
  }
`;

export async function resolveShopLocale(admin) {
  try {
    const response = await admin.graphql(SHOP_LOCALE_QUERY);
    const { data, errors } = await response.json();
    if (errors?.length) return "en";
    return getStoreLocale(data);
  } catch {
    return "en";
  }
}

const MESSAGES = {
  en: {
    title: "PredictaCore",
    subtitle: "AI visibility audit",
    heroTitle: "Free AI visibility audit",
    heroBody:
      "We scan up to {{scanLimit}} products from your catalog for free and show what's missing — preview every change before you pay.",
    step1ScoreHeadline: "Your AI visibility score",
    step1WhyBrief:
      "This score measures AI readiness (titles, descriptions, brand data) — not live crawler visibility. A low score means gaps to fix before Apply; instant impact on ChatGPT/Perplexity requires the delivery checklist below after Apply.",
    step1TimelineBrief:
      "After you apply changes: crawlers typically re-read your store in 2–4 weeks. Organic traffic shifts often show in 4–8 weeks.",
    step1PlanIncludes:
      "Setup includes up to {{limit}} top sellers by sales. Today we analyzed {{analyzed}} of {{total}} products in your catalog.",
    step1AfterApplyNote:
      "After Apply we verify your storefront and optionally track Google Search Console — details appear below once optimized.",
    validationExplainProducts:
      "Markets confirmed. We also scanned your products for missing SEO fields (reflected in your score above).",
    introTitle: "We'll analyze how AI search sees your store",
    introBenefitTitle: "What you gain with PredictaCore",
    introBenefitLead:
      "When ChatGPT, Perplexity, or Google AI recommend products, they favor complete titles, descriptions, and brand data — not ad spend. We find those gaps and fix them in your catalog.",
    introBody:
      "Before any payment, we scan up to {{scanLimit}} products (ranked by sales) and show where ChatGPT, Perplexity, and Google AI may overlook your store — plus a clear plan to fix it.",
    introBullet1: "Read-only scan — we do not change products until you pay and confirm Apply",
    introBullet2:
      "Benefit: stronger AI-ready titles, descriptions, and brand identity so assistants can recommend your products in your target markets",
    introBullet3:
      "Top {{aiLimit}} products get full AI-written SEO; the rest use market-aware templates — preview everything before the $35 setup",
    introNoChanges: "Nothing on your storefront is modified during this free audit.",
    pricingScope:
      "Included: scan up to {{scanLimit}} products · full AI polish on top {{aiLimit}} by sales",
    pricingExtra:
      "Need more than {{aiLimit}} fully optimized? +${{packPrice}} one-time per additional {{packSize}} products",
    loadingAuditSubtext: "Read-only scan — nothing on your store is modified yet.",
    loading: "Analyzing your store and products for AI search…",
    loadingAiSummary: "Analyzing your store to build your optimization plan…",
    loadingAiSummarySubtext: "We're preparing your score, gap list, and AI summary — your results appear when this finishes.",
    auditLoadTimeout: "The store scan took too long. Your Shopify data is safe — try again.",
    auditLoadTimeoutHint:
      "Large catalogs may need a second attempt. Reload from Shopify Admin → Apps → PredictaCore.",
    optimizingStore: "We are optimizing your store and products",
    optimizingStoreSubtext: "Updating titles, descriptions, and brand data for AI search — usually 1–2 minutes.",
    startAuditButton: "Start free audit — I agree",
    monthlyBeforePayTitle: "After you unlock ($15/month)",
    monthlyBeforePayBody:
      "$35 today covers your first month and unlocks Apply. Then $15/month until you cancel in Shopify — no refunds; cancellation applies to the next billing period.",
    generateAiPlan: "Generate personalized AI plan",
    skipAiPlan: "Skip AI summary and continue",
    step3AiTitle: "AI summary",
    step3AiIntro:
      "Generate a short AI narrative of your store's gaps. When it finishes, Continue unlocks for step 4.",
    step3ContinueWait: "Generate the AI summary above to continue.",
    step3ContinueReady: "Summary ready — continue to preview.",
    generateAiPlanBody:
      "Uses AI to write a short, plain-language summary of your gaps and priorities — useful if you want a narrative before the preview. Takes about 10–20 seconds.",
    skipAiPlanBody:
      "Go straight to step 4. Your fix list from the audit is already complete — skipping does not reduce optimization quality.",
    skipAiWhileLoading: "Continue without AI summary",
    retryAiPlan: "Try AI summary again",
    previewNotAppliedYet: "Nothing has been changed on your store yet — this is a preview only.",
    previewAwaitApply:
      "Payment complete — nothing is live yet. Click Apply below to publish these changes to your store.",
    scopeNote: "Top {{analyzed}} products selected from {{total}} in catalog",
    scopeNoteFullCatalog: "All {{analyzed}} products in your catalog analyzed ({{total}} total)",
    scopeNoteFullCatalogExcluded:
      "{{analyzed}} products optimized · {{total}} in catalog · {{excluded}} gift card excluded (not eligible for SEO)",
    selectionNote: "{{selection}} — ranked by sales potential, then SEO/GEO gaps.",
    selectionFromBestSellers: "From your «{{collection}}» collection",
    selectionFromRanking: "Ranked by active inventory and publish status",
    selectionFromSales: "Ranked by actual sales in the last 90 days",
    selectionFullCatalog: "Full catalog — all {{total}} products included (under {{limit}} limit)",
    selectionFullCatalogExcluded:
      "Full catalog — {{total}} products · {{excluded}} gift card excluded from SEO optimization",
    stepOf: "Step {{current}} of {{total}}",
    catalogScoreLabel: "AI readiness score",
    foundationScoreLabel: "Brand visibility to AI",
    scoreExplain:
      "Your score combines search titles, search descriptions, product descriptions, and brand identity — averaged across your priority products (up to {{limit}}).",
    scorePlainTitle: "How to read your score",
    scorePlainBody:
      "Think of it as a readiness grade for AI search (ChatGPT, Perplexity, Google AI). We average four checks on your priority products — not your whole Shopify admin, not your sales.",
    scorePlain1: "Search titles — can AI find a clear name for each product?",
    scorePlain2: "Search descriptions — short summaries AI can quote",
    scorePlain3: "Product descriptions — enough detail on the page",
    scorePlain4: "Brand identity — does AI know who you are in {{region}}?",
    scorePlainLow:
      "A low score after Undo/Restore usually means your store is back to how it was before PredictaCore — often with missing SEO fields, not because the math broke.",
    catalogCountExplain:
      "We analyze {{analyzed}} sellable products. Your catalog shows {{total}} total — {{excluded}} gift card is skipped (gift cards are not optimized for AI product search).",
    restoreVsResetTitle: "Undo vs reset — important",
    restoreVsResetBody:
      "Restore / Undo uses the backup PredictaCore saved before Apply. It puts your titles, descriptions, and brand data back to that moment — your score should return close to what you had before paying to apply.",
    restoreVsResetWarning:
      "Do not confuse this with wiping your store. We never empty your SEO on restore.",
    scoreBreakdownTitle: "Your products",
    foundationBreakdownTitle: "Your brand",
    scoreAfterApply:
      "After Apply, your readiness score typically rises to {{low}}–{{high}} — that reflects saved SEO and schema in Shopify. Crawlers see changes only when delivery checks (theme blocks + live JSON-LD) turn green.",
    scoreIsPreparationNote:
      "Score = preparation inside Shopify. Green delivery checklist = impact visible to AI crawlers on your live storefront.",
    catalogLargeNote:
      "Your catalog has {{total}} products — we analyze your top {{limit}} by sales (ShopifyQL 90-day ranking). The rest stay out of scope unless you add a product pack.",
    scoreGainGeneric: "Your score should increase considerably after optimization",
    scoreAlmostComplete:
      "{{count}} products still need fixes — continue to pay and Apply to reach ~{{score}}/100",
    scoreNow: "Your score: {{score}}/100",
    scoreImproved: "AI readiness score: {{before}} → {{after}}",
    scoreSeoComplete: "Your store is fully optimized for AI search",
    factorSeoTitle: "{{missing}} of {{total}} products need a search title",
    factorSeoTitleDone: "All products have search titles",
    factorSeoDesc: "{{missing}} of {{total}} products need a search description",
    factorSeoDescDone: "All products have search descriptions",
    factorDesc: "{{missing}} of {{total}} products have no written description",
    factorDescDone: "All products have descriptions",
    factorSchema: "AI doesn't know your brand identity yet",
    factorSchemaDone: "Your brand is visible to AI",
    fixSeoDone: "Products — already complete ✓",
    previewAllDone: "Everything is already optimized. Nothing left to apply.",
    previewProductsDone: "Product SEO is already complete — no title or description changes needed.",
    previewSchemaOnlyExplain:
      "We will save your brand identity (Schema.org JSON-LD) so AI search can recognize {{shop}} in {{region}}. Enable the theme embed after applying.",
    previewSchemaRow: "Brand identity (Schema.org)",
    previewSchemaRowDetail: "Organization JSON-LD metafield + theme embed instructions",
    seeUpdatedScore: "See updated score",
    whyUsTitle: "Why PredictaCore",
    whyUs1: "Full audit + preview free — pay only when you're convinced",
    whyUs2: "Top {{aiLimit}} best sellers — where AI impact and revenue actually happen",
    whyUs3: "Backup before every change + one-click restore",
    whyUs4: "Built for AI search visibility — not traditional SEO alone",
    pricingTitle: "Pricing",
    pricingFree: "Free — full audit, AI plan & preview",
    pricingSetup:
      "$35 — first month + full optimization (Apply unlock). $15/month after for automatic catalog updates.",
    pricingRecurringNote:
      "One button in PredictaCore: Shopify may show up to two approval screens in a row ($35 setup, then $15/mo from day 31). We redirect you automatically — no need to return to the app between screens.",
    pricingMaintenance: "",
    billingPaymentDisclosureTitle: "What Shopify will ask you to approve",
    billingPaymentStep1: "Today: $35 one-time setup (includes your first month)",
    billingPaymentStep2:
      "Next screen (automatic): $15/month maintenance from day 31 — cancel anytime in Shopify Admin. Month 1 is already included in the $35 setup.",
    billingShopifyEmailNote:
      "Shopify’s email lists only the charge you just approved. The $15/mo plan is the next screen in the same flow — we redirect you there after $35.",
    billingMaintenanceApproveTitle: "One more step — approve $15/month maintenance",
    billingMaintenanceApproveBody:
      "Your $35 setup is active. Approve the $15/month subscription in Shopify so automatic catalog updates continue after day 31. Month 1 is already included in your setup fee — no double charge today.",
    subscribeMaintenance: "Approve $15/month in Shopify",
    billingMaintenanceApproved: "Maintenance plan active — $15/month from day 31 (month 1 included in setup).",
    billingFootnote:
      "No refunds. Cancel anytime in Shopify Admin — takes effect next billing period; the current month stays paid ($35 first month, then $15/month).",
    pricingMaintenanceIncluded:
      "Included: $15/month updates start automatically after your first month. Cancel anytime in Shopify Admin — takes effect next billing period.",
    unlockApply: "Pay $35 — unlock Apply",
    step2PayIntro:
      "Review the preview below, check the box to confirm backup/restore, then pay in Shopify. Apply unlocks on this same screen — no duplicate preview.",
    step2ConfirmBeforePay: "Check this box before paying — backup is saved and you can restore before uninstalling",
    billingAlreadyApproved:
      "This store already approved the $35 charge in Shopify — you will not see the payment screen again. Use Restore all below to undo changes and run Apply again.",
    step2NoPendingWork:
      "No pending product changes detected. If you already applied optimizations, use Restore all to test the full flow again.",
    billingBundleContinue: "Continue — approve $15/month plan (required)",
    billingRequired: "Complete the $35 setup payment to unlock Apply.",
    applyAlreadyDone:
      "Your initial optimization is already applied. Monthly updates run automatically — no extra action needed.",
    step4RestoreToContinue:
      "This store already has a completed Apply on record. Use Restore all below to undo changes and run the full flow again (including payment if needed).",
    step4FlowTitle: "Apply to your store",
    step4PaymentBodyFirst: "Continue to complete payment in Shopify and unlock Apply.",
    step4PaymentSuccess:
      "Payment successful — $35 setup complete. Redirecting to approve $15/mo maintenance (billing starts day 31).",
    step4FlowIntro: "Complete payment in Shopify to unlock Apply on your store.",
    expectationsPreviewTitle: "What to expect after you apply",
    expectationsPreviewMeans1:
      "After Apply, AI search will be able to read clear titles, descriptions, and brand identity on your store.",
    expectationsPreviewMeans2:
      "We will optimize your top {{count}} priority products (where AI visibility matters most).",
    expectationsPreviewNot1:
      "Instant AI mentions the same day — crawlers need time to re-read your store.",
    expectationsPreviewNot2:
      "A guaranteed #1 ranking — AI search results change constantly.",
    expectationsPreviewTimeline1:
      "2–4 weeks after Apply: AI crawlers typically re-index your store.",
    expectationsPreviewTimeline2:
      "4–8 weeks after Apply: better chance of appearing in AI search answers.",
    expectationsPreviewMaintenanceTitle: "After month 1 — $15/month maintenance",
    expectationsPreviewMaintenance1: "Monthly re-scan of up to {{limit}} top-selling products",
    expectationsPreviewMaintenance2: "Updates when new products or gaps lower your score",
    expectationsPreviewMaintenance3: "Polish for new catalog items as you grow",
    billingBundleStep2:
      "$35 setup is active on this store. Continue to approve the required $15/month subscription.",
    step4PaidIntro: "Payment complete — click Apply to publish these changes to your store.",
    step2ConfirmIntro: "Payment complete — confirm you understand backup/restore, then continue to Apply.",
    billingStatusTitle: "Billing status (this store)",
    billingStatusNone:
      "Not paid yet — Shopify will ask you to approve $35, then $15/month. Charges appear on your Shopify invoice.",
    billingStatusSetupOnly:
      "$35 setup is active on this store. Approve the $15/month plan to continue. If you approved charges before, Shopify may not ask for your card again — check Settings → Apps and sales channels → PredictaCore for charges.",
    billingStatusActive:
      "Plan active — $35 setup paid · $15/month subscription active. Shopify bills your store automatically each month. Cancel in Shopify Admin takes effect next period; no refunds for the current month.",
    billingShopifyReceipt:
      "To verify charges: Shopify Admin → Settings → Apps and sales channels → PredictaCore → View charges. Test stores may show $0 test charges.",
    alreadyOptimizedTitle: "Already optimized",
    alreadyOptimizedBody:
      "No pending changes right now — your store was optimized in a previous session. Click the yellow Restore button below to undo and run the wizard again.",
    dashboardActionsTitle: "Restore or run the wizard again",
    dashboardActionsBody:
      "Your store is already optimized. Use Restore now to return to the original baseline and see pending changes in the wizard again.",
    productTierTitle: "Product scope",
    productTierBody:
      "Included: up to {{base}} top sellers (currently {{limit}} in scope). Top {{ai}} get full AI-written SEO; the rest get market-aware templates for your regions.",
    productTierUpgrade: "Add {{size}} more products — ${{price}} one-time",
    themeOnboardingTitle: "Activate storefront blocks (required for AI crawlers)",
    themeOnboardingBody:
      "Apply saved your product SEO and schema inside Shopify. To deliver that data to ChatGPT, Perplexity, and Google AI on your live storefront, enable these theme app embeds:",
    themeOnboardingStepsTitle: "Step-by-step (about 5 minutes)",
    themeOnboardingStep1: "Shopify Admin → Online Store → Themes → Customize (open your live theme).",
    themeOnboardingStep2: "In the theme editor, click App embeds in the left sidebar (puzzle-piece icon).",
    themeOnboardingStep3: "Find PredictaCore → turn ON PredictaCore Brand (Organization + Website JSON-LD in <head>).",
    themeOnboardingStep4: "Turn ON PredictaCore Product (Product JSON-LD on product pages).",
    themeOnboardingStep5: "Click Save (top right), return to PredictaCore, and tap Recheck delivery now below.",
    themeOnboardingStep6: "Verify llms.txt loads: open {{llmsUrl}} in a new tab — you should see plain text about your store.",
    themeOnboardingStep7:
      "Optional: Online Store → Navigation → URL Redirects — redirect /llms.txt → /apps/predictacore/llms.txt (standard path for AI crawlers).",
    themeOnboardingAfterSteps:
      "When all delivery checks turn green (8/8), crawlers can read your schema on the live storefront. Crawler re-crawl usually takes 2–4 weeks.",
    themeOnboardingBrand: "PredictaCore Brand — injects organization + website schema in <head>",
    themeOnboardingProduct: "PredictaCore Product — product JSON-LD on product pages",
    themeOnboardingLlms:
      "llms.txt is served at /apps/predictacore/llms.txt once the app is installed — no extra block needed.",
    themeOnboardingCta: "Open theme editor (App embeds)",
    benchmarkTitle: "Category readiness benchmark",
    benchmarkAhead: "Your score {{your}} is ahead of typical stores ({{typical}}) — strong GEO foundation.",
    benchmarkBehind: "Your score {{your}} is below typical ({{typical}}) — Apply closes the biggest gaps.",
    benchmarkOnPar: "Your score {{your}} is close to typical stores ({{typical}}) — Apply can push you ahead.",
    applyImpactTitle: "Last optimization impact",
    impactScore: "Readiness score: {{before}} → {{after}} (internal model, same formula).",
    impactProducts: "{{count}} products updated in last Apply ({{scope}} in scope).",
    gscTitle: "Google organic traffic (optional)",
    gscWhyShopify:
      "Shopify Analytics shows sessions, orders, and sales channels — but Shopify does not give third-party apps Google's official organic search report (impressions and clicks from Google Search results).",
    gscWhyGoogle:
      "Those numbers live in Google Search Console — how Google sees your store in Search. Connecting is optional, read-only, and does not change your SEO or Apply.",
    gscNotConfigured:
      "Google connection is not enabled on this PredictaCore server yet. Once enabled, merchants see a Connect button here — no API keys required from them.",
    gscConnectHint:
      "Connect with the Google account that owns this store in Search Console (same email you use at search.google.com). One Google account per Shopify store.",
    gscSkipOk: "You can skip this entirely — optimization, schema, markets, and scores work without Google.",
    gscConnect: "Connect Google Search Console (optional)",
    gscConnected: "Search Console connected.",
    gscSummary: "Last 28 days: {{impressions}} impressions · {{clicks}} clicks (organic Google).",
    gscBeforeAfterTitle: "Google organic — before vs after Apply",
    gscBaseline: "Baseline (at Apply): {{impressions}} impressions · {{clicks}} clicks",
    gscLatest: "Latest (28 days): {{impressions}} impressions · {{clicks}} clicks",
    gscDeltaImpressions: "Impressions change since Apply: {{delta}}",
    gscDeltaClicks: "Clicks change since Apply: {{delta}}",
    gscAwaitingBaseline: "Connect Search Console and run Apply to capture your before/after baseline.",
    deliveryTitle: "What PredictaCore completed",
    deliveryIntro:
      "These items are saved inside Shopify when you Apply — no extra steps required from you.",
    deliveryRecommendTitle: "Recommended — further improve AI visibility",
    deliveryRecommendIntro:
      "Shopify does not allow apps to turn on theme blocks for you (merchant must approve in the theme editor). These optional steps help AI crawlers read your schema on the live storefront.",
    deliveryWhyManualTheme:
      "Why we can't do this for you: Shopify requires the store owner to enable app embeds in Online Store → Themes. PredictaCore already saved the data — you only flip two switches (about 2 minutes).",
    deliveryReady: "Live delivery ready — automated setup complete.",
    deliveryNotReady: "{{done}} automated steps complete · {{pending}} optional recommendations below",
    deliveryScore: "{{pct}}% automated",
    deliveryThemeBrand: "PredictaCore Brand block enabled in theme",
    deliveryThemeProduct: "PredictaCore Product block enabled in theme",
    deliveryShopSchema: "Organization schema saved (shop metafield)",
    deliveryProductSchema: "Product schema saved (sample product metafield)",
    deliveryLlmsLive: "llms.txt live at /apps/predictacore/llms.txt",
    deliveryLiveProductLd: "Product JSON-LD visible on live product page",
    deliveryLiveOrgLd: "Organization JSON-LD visible on storefront HTML",
    deliveryLlmsMetafield: "llms.txt content saved (shop metafield)",
    deliveryOpenTheme: "Fix in theme editor",
    deliveryRecheck: "Results update automatically after Apply and every 6 hours.",
    deliveryRecheckNow: "Recheck now",
    deliveryVerifySection: "Verify your results — included with PredictaCore",
    deliveryVerifyBody: "One-click checks that competitors don't offer: confirm Google sees your product schema and open your live page.",
    deliveryRichResultsTest: "Google Rich Results Test",
    deliveryViewLivePage: "Your live product page",
    marketsChangedBanner:
      "Your Shopify Markets changed since the last scan — run Restore or re-confirm markets, then Apply again to realign SEO.",
    refreshingStore: "Updating your store…",
    confirmingPayment: "Confirming payment…",
    restoreWarning:
      "Undo last change reverts only the most recent Apply (including a monthly update). Your store will not return to the original pre-PredictaCore state.",
    restoreLastConfirm:
      "Undo only the last Apply? This keeps earlier changes and does not restore your original store.",
    restoreAllConfirm:
      "Restore everything to how it was before PredictaCore? This uses your saved original baseline and removes all optimizations (including monthly updates).",
    restoreAllHint:
      "Restore all returns your store to the original first-scan baseline — as if PredictaCore had never run.",
    restoreLastHint:
      "Undo last change only reverses the most recent Apply batch (e.g. a monthly re-scan). Use Restore all for the full original store.",
    rollbackNote:
      "Before uninstalling in Shopify Admin, choose below whether to restore your original store or keep optimized data.",
    postApplyTitle: "Optimization complete",
    postApplyManualTitle: "Recommended — improve live crawler visibility",
    postApplyManualBody:
      "PredictaCore already saved SEO and schema in Shopify. These manual steps help AI crawlers read them on your live storefront (separate from your score above).",
    deliveryOptionalNote: "Optional merchant setup — not part of the paid Apply.",
    postApplyAlmostTitle: "Optional — finish live delivery (2 min)",
    postApplyBody: "Your store is updated. View your score anytime by reopening PredictaCore.",
    postApplyThemeRequired:
      "Apply saved product SEO and schema in Shopify. To show them on your live storefront, enable two theme blocks — Shopify requires you to do this in the theme editor; apps cannot enable them automatically.",
    viewDashboard: "View score dashboard",
    exitApp: "Close",
    products: "Products",
    markets: "Markets",
    continue: "Continue",
    back: "Back",
    stateTitle: "Current state",
    impactTitle: "Why AI can't recommend you",
    planTitle: "What we'll fix",
    uninstallPrefTitle: "If you uninstall PredictaCore",
    uninstallPrefIntro:
      "Choose what happens to your product SEO and brand data when you remove the app from Shopify Admin. You can change this anytime before uninstalling.",
    uninstallPrefNotNowNote:
      "These options apply only when you uninstall the app — they do not restore your store now. To restore immediately, use the Restore button below.",
    uninstallPrefRestoreLabel: "Restore my original store data (recommended)",
    uninstallPrefRestoreBody:
      "On uninstall we try to put titles, descriptions, and brand data back to how they were before PredictaCore. Best if you are leaving the app.",
    uninstallPrefKeepLabel: "Keep my optimized data",
    uninstallPrefKeepBody:
      "On uninstall we only remove PredictaCore from your shop — your optimized SEO and brand changes stay on your products.",
    uninstallPrefSaved: "Preference saved.",
    uninstallPrefSteps:
      "To uninstall: Shopify Admin → Settings → Apps → PredictaCore → Delete. Your choice above applies when the app is removed.",
    previewSoon: "Preview changes — coming next",
    priorityTitle: "Products to fix first",
    priorityExplain:
      "We picked your top sellers and highest-conversion products first, then ranked them by SEO/GEO gaps. Higher score = more to fix on that product.",
    priorityPlanSummary:
      "Apply will update {{count}} products across {{batches}} categories · {{mirrors}} get individual polish · selected for sales potential + AI search gaps",
    priorityScopeSummary:
      "{{count}} products in scope · {{high}} urgent SEO gaps · {{medium}} moderate",
    rank: "#",
    product: "Product",
    score: "Priority",
    targetScore: "Target",
    loading: "Analyzing your store with AI…",
    loadingHint: "This usually takes 10–20 seconds. Please wait before continuing.",
    error: "Something went wrong",
    impactIntro:
      "AI search uses your product titles and descriptions when surfacing stores. Missing info makes you harder to find and recommend.",
    gapNoSeoTitle: "{{count}} products missing search title",
    gapNoSeoDesc: "{{count}} products missing search description",
    gapNoDesc: "{{count}} products with no description",
    gapSingleLocale: "Only one language published",
    gapNoSchema: "AI doesn't know who your brand is yet",
    gapLowScore: "Score {{score}}/100 — room to improve",
    fixSchema: "Tell AI who your brand is in {{region}}",
    fixBatch: "Fix search titles on {{count}} products ({{batches}} groups)",
    fixMirror: "Polish your top {{count}} products individually",
    fixCategory: "Batch SEO for {{count}} products",
    previewTitle: "Preview changes",
    previewApplyIntro: "What we'll update on your store",
    previewRowTitles: "Search titles — {{count}} products",
    previewRowDescs: "Search descriptions — {{count}} products",
    previewRowBodies: "Product descriptions — {{count}} products",
    previewRowMirror: "Individual polish on top sellers — {{count}} products (★ below)",
    previewRowBatch: "Category batch patterns — {{count}} groups",
    previewRowBrand: "Brand identity for AI search (Schema.org JSON-LD)",
    previewMirrorLegend: "★ = top seller with individual title and description polish",
    previewTableIntro: "Sample of changes (first 6 products):",
    previewSchema: "+ Brand identity prepared — enable in Theme Settings → App embeds",
    schemaEmbedNote:
      "To show your brand to AI search on your storefront: Online Store → Themes → Customize → App embeds → enable PredictaCore Brand.",
    previewDesc: "Product description added",
    before: "Before",
    after: "After",
    seoTitle: "SEO title",
    apply: "Apply changes",
    confirmLabel: "I understand — a backup is saved and I can restore before uninstalling",
    applying: "Applying…",
    applySuccess: "Done — {{count}} products updated. Backup saved.",
    applySuccessWithSchema: "Done — {{count}} products updated and brand identity saved. Backup saved.",
    applySuccessSchemaOnly: "Done — brand identity activated. Backup saved.",
    resultsTitle: "What changed",
    resultsScoreExplainSchemaOnly:
      "{{before}} → {{after}}: we activated brand identity for AI search (+{{gain}} pts). Your {{count}} priority products already had complete SEO — no product edits were needed.",
    resultsScoreExplainFull:
      "{{before}} → {{after}}: {{productCount}} products updated and brand identity saved (+{{gain}} pts total).",
    resultsScoreExplainProducts:
      "{{before}} → {{after}}: {{productCount}} products updated across {{categories}} categories.",
    resultsAppliedTitle: "What we applied",
    resultsAppliedBrand: "Brand identity (Schema.org JSON-LD) — saved for AI search in {{region}}",
    marketsPanelTitle: "Where you sell",
    marketsPanelBody:
      "We read your Shopify Markets so product copy and structured data target the countries where you actually sell — not random regions.",
    marketsChangeWarning:
      "Changing countries only affects future SEO copy and schema (titles, descriptions, region labels). It does not change Shopify shipping zones. Pick countries where you actually sell.",
    marketsAvailableList: "{{count}} countries available from your Shopify Markets — select where you sell:",
    marketsDetected: "Detected markets: {{region}}",
    marketsCountries: "Countries: {{countries}}",
    marketsConfirmButton: "Confirm target markets",
    marketsSelectHint:
      "Shopify may list every country you could ship to. Check only the countries where you actually sell — SEO and schema will target those.",
    marketsPresetNorthAmerica: "US, Canada & Mexico only",
    marketsAddMexicoHint:
      "Mexico is not in your Shopify Markets yet. Add it in Shopify Admin → Settings → Markets, then reload this app.",
    marketsChangeButton: "Change target markets",
    marketsSelectRequired: "Select at least one country before confirming.",
    marketsConfirmed: "Target markets confirmed — optimizations will focus on {{region}}.",
    marketsNotConfigured:
      "No Shopify Markets detected. Set up Markets in Shopify Admin → Settings → Markets, then reload this app.",
    marketsConfirmRequired: "Confirm your target markets on step 1 before applying changes.",
    scoreProjectionLabel: "After Apply (estimated): {{low}}–{{high}}",
    scoreConfidenceHigh: "High confidence — most critical AI visibility gaps will close in your target markets.",
    scoreConfidenceModerate: "Moderate confidence — Apply will improve readiness; some gaps may remain.",
    validationTitle: "Readiness validation",
    validationSummaryPass: "Core checks passed for your target markets.",
    validationSummaryReview: "Review warnings below before applying or submitting to App Store review.",
    factorMarketAlignment: "Market alignment — SEO copy matches where you sell",
    factorCatalogCompleteness: "Catalog completeness — titles, descriptions, product copy",
    factorBrandEntity: "Brand entity — structured identity for AI search",
    factorSemanticRichness: "Semantic richness — categories, tags, detail",
    factorCommercialSignals: "Commercial signals — priority products with sales data",
    resultsAppliedProductsUpdated: "{{count}} products — search titles and/or descriptions updated",
    resultsAppliedProductsVerified: "{{count}} priority products — SEO verified complete (no changes needed)",
    resultsScoreBreakdownTitle: "Why your score changed",
    resultsScoreRowCatalog: "Product SEO · {{count}} priority products",
    resultsScoreRowBrand: "Brand identity for AI search",
    resultsBackupNote: "Backup saved before any change.",
    resultsTimeline:
      "When to expect results: usually 2–4 weeks for AI to re-read your store. Mentions in AI assistants often improve in 4–8 weeks.",
    resultsProductsTitle: "Every product we updated",
    changeSearchTitle: "Search title",
    changeSearchDesc: "Search description",
    changeProductDesc: "Product description",
    setupCompleteTitle: "One-time setup complete",
    setupCompleteBody:
      "Your store is fully optimized. The setup wizard won't run again — monthly maintenance ($15/mo) covers re-scans and new products.",
    viewScoreDashboard: "View score dashboard",
    viewSummary: "View optimization summary",
    moreProducts: "+{{count}} more products",
    applyError: "Could not apply changes",
    noChanges: "All products already have SEO metadata",
    noChangesAlreadyApplied:
      "These changes were already applied — reload the app to see your updated score, or use Restore / Reset demo store to run the wizard again.",
    restore: "Undo last change",
    restoreAll: "Restore everything to original",
    restoring: "Restoring…",
    restoreSuccess: "Restored {{products}} products from the last backup.",
    restoreAllSuccess:
      "Restored {{products}} products and {{schema}} brand identity from {{batches}} backup(s).",
    restoreAllSchemaOnly:
      "Brand identity restored. No product SEO was in the backup — only schema was applied last time.",
    restoreNothingFound:
      "Nothing to restore — no PredictaCore backup found for this store. If you used Restore before, apply backups were cleared. Use Restore all when a first-scan baseline exists.",
    baselineMissingTitle: "Original backup missing (legacy session)",
    baselineMissingBody:
      "This store was optimized before we saved the immutable first-scan baseline. Restore all cannot return to the true pre-PredictaCore state. For your test store: create a fresh development store or use Undo all (pilot). New installs are protected automatically.",
    restoreBaselineSuccess:
      "Restored {{products}} products and brand settings to the original first-scan baseline — as if PredictaCore had never run.",
    backupStatusTitle: "Backup status",
    backupStatusApply:
      "Apply backup: {{products}} products in {{batches}} batch(es){{schema}}. Restore all reverts to the immutable first-scan baseline.",
    backupStatusBaseline:
      "Original baseline: {{products}} products locked on first scan (Railway). Restore all always returns to this — never deleted.",
    backupStatusNone:
      "Original baseline will be saved on your first scan before any Apply. Required for safe Restore.",
    backupStatusSchema: " + brand identity",
    resetTestSuccessBaseline:
      "Demo reset complete — restored {{products}} products from first-scan baseline ({{schema}}). Reload step 1 to see gaps again.",
    resetTestSuccessStripped:
      "Demo reset complete — cleared SEO on {{count}} priority products (no baseline existed). Reload step 1 to see gaps again.",
    resetTestNoSchema: "schema cleared",
    resetTestTitle: "Undo all PredictaCore changes (pilot)",
    resetTestBody:
      "Same as Restore everything, plus restores the first-scan baseline from Railway (or clears product SEO if no baseline). Resets Apply quota so you can run the full wizard again.",
    resetTestConfirm:
      "Undo all PredictaCore changes on this store? Products and brand identity will return to the pre-Apply backup.",
    resetTestSuccess:
      "Undo complete — {{products}} products restored from backup{{schema}}. Refresh step 1 to see your updated score.",
    resetTestLoading: "Undoing changes…",
    resetTitle: "Store fully optimized",
    resetBody:
      "You're at 100/100 — gaps, recommendations, and the change preview are hidden because there's nothing left to fix. To walk through the full flow again, restore your store to how it was before PredictaCore.",
    resetHint:
      "After undo/restore, your score returns to what it was before PredictaCore — often ~25 on a demo store that had not been optimized yet. Steps 2–4 will show pending changes again.",
    aiUnavailable: "Our AI is temporarily unavailable. Try again later.",
    aiNotConfigured: "AI summary is not enabled on this server. You can continue — your audit plan is complete.",
    aiError: "Our AI could not complete the analysis.",
    aiTimeout: "Our AI did not respond in time. Try again.",
    expectationsTitle: "What happens now",
    expectationsMeansTitle: "What your score means",
    expectationsMeans1: "Your store is ready to be read by AI search — titles, descriptions, and brand identity are in place.",
    expectationsMeans2: "We optimized your top {{count}} priority products (where AI impact matters most).",
    expectationsMeans2ProductsDone:
      "Your priority products already had complete SEO — we saved brand identity so AI search knows who you are.",
    expectationsNotTitle: "What it does NOT mean",
    expectationsNot1: "Instant mentions in AI search today — crawlers need time to re-read your store.",
    expectationsNot2: "A guaranteed #1 ranking — AI search results change constantly.",
    expectationsDoneTitle: "What we applied to your store",
    expectationsDone1Updated: "{{count}} products — search titles and descriptions updated",
    expectationsDone1Verified: "{{count}} priority products reviewed — SEO already complete",
    expectationsDone2: "Product descriptions where they were missing",
    expectationsDone3: "Brand identity for AI search (enable embed in Theme Settings if you haven't)",
    expectationsDone4: "Full backup — restore anytime from step 4",
    expectationsTimelineTitle: "When to expect real-world results",
    expectationsTimeline1: "2–4 weeks: AI search crawlers typically re-index your store",
    expectationsTimeline2: "4–8 weeks: better chance of appearing in AI search answers",
    maintenancePlanTitle: "Monthly maintenance — $15/mo",
    maintenancePlanIntro: "Your catalog changes. Maintenance keeps your score high over time:",
    maintenancePlan1: "Monthly re-scan of up to {{limit}} top-selling products",
    maintenancePlan2: "Alerts when new products or gaps lower your score",
    maintenancePlan3: "Optimization for new catalog items as you grow",
    maintenancePlanNote: "Automatic monthly updates keep your catalog optimized as you add products.",
    applyQuotaTitle: "Apply rules — read before continuing",
    applyQuotaSetup:
      "Your $35 setup includes one Apply now — that counts as this month's included update. After that, one automatic Apply runs each calendar month with your $15/mo plan.",
    applyQuotaMonthlyAuto:
      "Your included Apply for {{period}} runs automatically — we scan your catalog and apply pending fixes without you clicking Apply. Manual Apply is not included this month unless you purchase an extra.",
    applyQuotaMonthlyDone:
      "Your included automatic Apply for {{period}} has already run. Need another update this month? Extra Apply costs $15 (one-time).",
    applyQuotaExtraAvailable:
      "You have {{count}} extra Apply credit(s) ready — paid $15 each. You can run Apply manually now.",
    applyQuotaExtraPayment: "Extra Apply — $15 one-time",
    applyQuotaExtraPaymentBody:
      "Your monthly included Apply is already used (or scheduled automatically). An additional Apply this month requires a $15 one-time charge. Same optimization quality — manual trigger.",
    applyQuotaNoSubscription:
      "Automatic monthly Apply requires active maintenance ($15/mo). Without it, you can still purchase an extra Apply for $15 when you need changes.",
    applyQuotaPeriod: "Billing month: {{period}}",
    payExtraApply: "Pay $15 for extra Apply",
    confirmExtraApply: "Pay $15 one-time to unlock one manual Apply this month?",
    extraApplySuccess: "Payment confirmed — 1 extra Apply credit added. You can Apply now.",
    reasonNoSeoTitle: "Missing search title",
    reasonNoSeoDesc: "Missing search description",
    reasonNoDesc: "Missing product description",
    reasonGiftCard: "Lower priority — gift card",
    reasonNoTags: "Missing semantic tags",
  },
  es: {
    title: "PredictaCore",
    subtitle: "Auditoría de visibilidad AI",
    heroTitle: "Auditoría AI gratis",
    heroBody:
      "Analizamos gratis hasta {{scanLimit}} productos de tu catálogo. Descubre qué impide que la IA te recomiende — vista previa de cada cambio antes de pagar.",
    step1ScoreHeadline: "Tu score de visibilidad AI",
    step1WhyBrief:
      "Este score mide preparación para IA (títulos, descripciones, marca) — no visibilidad en vivo en crawlers. Un score bajo indica gaps antes del Apply; el impacto instantáneo en ChatGPT/Perplexity requiere el checklist de entrega verde después del Apply.",
    step1TimelineBrief:
      "Después de aplicar cambios: los crawlers suelen re-leer tu tienda en 2–4 semanas. Cambios en tráfico orgánico suelen verse en 4–8 semanas.",
    step1PlanIncludes:
      "El setup incluye hasta {{limit}} productos principales por ventas. Hoy analizamos {{analyzed}} de {{total}} productos en tu catálogo.",
    step1AfterApplyNote:
      "Después del Apply verificamos tu storefront y opcionalmente Google Search Console — los detalles aparecen abajo una vez optimizado.",
    validationExplainProducts:
      "Mercados confirmados. También escaneamos tus productos buscando campos SEO faltantes (reflejado en tu score arriba).",
    scopeNote: "Top {{analyzed}} productos seleccionados de {{total}} en catálogo",
    scopeNoteFullCatalog: "Los {{analyzed}} productos de tu catálogo analizados ({{total}} en total)",
    scopeNoteFullCatalogExcluded:
      "{{analyzed}} productos optimizados · {{total}} en catálogo · {{excluded}} gift card excluida (no aplica SEO)",
    selectionNote: "{{selection}} — ordenados por potencial de venta y gaps SEO/GEO.",
    selectionFromBestSellers: "Colección «{{collection}}»",
    selectionFromRanking: "Ordenados por inventario activo y estado publicado",
    selectionFromSales: "Ordenados por ventas reales de los últimos 90 días",
    selectionFullCatalog: "Catálogo completo — los {{total}} productos incluidos (bajo el límite de {{limit}})",
    selectionFullCatalogExcluded:
      "Catálogo completo — {{total}} productos · {{excluded}} gift card excluida de la optimización SEO",
    stepOf: "Paso {{current}} de {{total}}",
    catalogScoreLabel: "Score de preparación AI",
    foundationScoreLabel: "Visibilidad de marca",
    scoreExplain:
      "Tu score combina títulos de búsqueda, descripciones SEO, descripciones de producto e identidad de marca — promedio en tus productos prioritarios (hasta {{limit}}).",
    scorePlainTitle: "Cómo leer tu score",
    scorePlainBody:
      "Piensa en él como una nota de preparación para búsqueda con IA (ChatGPT, Perplexity, Google AI). Promediamos cuatro chequeos en tus productos prioritarios — no todo el admin de Shopify ni tus ventas.",
    scorePlain1: "Títulos de búsqueda — ¿la IA puede encontrar un nombre claro para cada producto?",
    scorePlain2: "Descripciones de búsqueda — resúmenes cortos que la IA puede citar",
    scorePlain3: "Descripciones de producto — suficiente detalle en la página",
    scorePlain4: "Identidad de marca — ¿la IA sabe quién es tu tienda (US y Canadá)?",
    scorePlainLow:
      "Un score bajo tras Deshacer/Restaurar suele significar que tu tienda volvió a como estaba antes de PredictaCore — a menudo con SEO incompleto, no porque el cálculo se haya roto.",
    catalogCountExplain:
      "Analizamos {{analyzed}} productos vendibles. Tu catálogo muestra {{total}} en total — se omite {{excluded}} gift card (las gift cards no se optimizan para búsqueda AI de productos).",
    restoreVsResetTitle: "Deshacer vs reset — importante",
    restoreVsResetBody:
      "Restaurar / Deshacer usa la copia de seguridad que PredictaCore guardó antes de Aplicar. Devuelve títulos, descripciones e identidad de marca a ese momento — tu score debería volver cerca de lo que tenías antes de pagar.",
    restoreVsResetWarning:
      "No confundas esto con vaciar tu tienda. En restaurar nunca borramos tu SEO.",
    scoreBreakdownTitle: "Cobertura del catálogo",
    foundationBreakdownTitle: "Base de tienda (GEO)",
    scoreAfterApply:
      "Tras el Apply, tu score de preparación suele subir a {{low}}–{{high}} — refleja SEO y schema guardados en Shopify. Los crawlers ven cambios solo cuando el checklist de entrega (bloques + JSON-LD en vivo) esté verde.",
    scoreIsPreparationNote:
      "Score = preparación en Shopify. Checklist de entrega verde = impacto visible para crawlers de IA en tu tienda en vivo.",
    catalogLargeNote:
      "Tu catálogo tiene {{total}} productos — analizamos tus {{limit}} principales por ventas (ranking ShopifyQL 90 días). El resto queda fuera de alcance hasta que agregues un pack de productos.",
    scoreGainGeneric: "Tu score debería subir considerablemente tras optimizar",
    scoreAlmostComplete:
      "Quedan {{count}} productos por corregir — ve al paso 4 y aplica para llegar a ~{{score}}/100",
    scoreNow: "Tu score: {{score}}/100",
    scoreImproved: "Score de preparación AI: {{before}} → {{after}}",
    scoreSeoComplete: "Tu tienda está optimizada para búsqueda AI",
    factorSeoTitle: "{{missing}} de {{total}} productos necesitan título de búsqueda",
    factorSeoTitleDone: "Todos tienen título de búsqueda",
    factorSeoDesc: "{{missing}} de {{total}} productos necesitan descripción de búsqueda",
    factorSeoDescDone: "Todos tienen descripción de búsqueda",
    factorDesc: "{{missing}} de {{total}} productos no tienen descripción escrita",
    factorDescDone: "Todos tienen descripción",
    factorSchema: "Las AI aún no conocen tu marca",
    factorSchemaDone: "Tu marca es visible para las AI",
    fixSeoDone: "Productos — ya completos ✓",
    previewAllDone: "Todo optimizado. No hay cambios pendientes.",
    previewProductsDone: "El SEO de productos ya está completo — no hay cambios de títulos ni descripciones.",
    previewSchemaOnlyExplain:
      "Guardaremos la identidad de marca (Schema.org JSON-LD) para que las AI reconozcan {{shop}} en {{region}}. Activa el embed del tema después de aplicar.",
    previewSchemaRow: "Identidad de marca (Schema.org)",
    previewSchemaRowDetail: "Metafield JSON-LD de organización + instrucciones del theme embed",
    previewSchema: "+ Identidad de marca preparada — activar en Theme Settings → App embeds",
    schemaEmbedNote:
      "Para mostrar tu marca en AI search: Online Store → Themes → Customize → App embeds → activar PredictaCore Brand.",
    previewDesc: "Descripción de producto añadida",
    seeUpdatedScore: "Ver score actualizado",
    whyUsTitle: "Por qué PredictaCore",
    whyUs1: "Auditoría + preview gratis — pagas solo cuando te convence",
    whyUs2: "Top {{aiLimit}} best sellers — donde impactan ventas y visibilidad AI",
    whyUs3: "Backup antes de cada cambio + restore en un clic",
    whyUs4: "Hecho para visibilidad en AI search — no solo SEO tradicional",
    pricingTitle: "Precios",
    pricingFree: "Gratis — auditoría completa, plan AI y preview",
    pricingSetup:
      "$35 — primer mes + optimización completa (desbloquea Apply). $15/mes después para actualizaciones automáticas.",
    pricingRecurringNote:
      "Un solo botón en PredictaCore: Shopify puede mostrar hasta dos pantallas seguidas ($35 setup, luego $15/mes desde el día 31). Te redirigimos automáticamente — no necesitas volver a la app entre pantallas.",
    pricingMaintenance: "",
    billingPaymentDisclosureTitle: "Qué te pedirá aprobar Shopify",
    billingPaymentStep1: "Hoy: setup único de $35 (incluye tu primer mes)",
    billingPaymentStep2:
      "Siguiente pantalla (automática): mantenimiento de $15/mes desde el día 31 — cancela cuando quieras en Shopify Admin. El mes 1 ya está incluido en el setup de $35.",
    billingShopifyEmailNote:
      "El correo de Shopify solo lista el cargo que acabas de aprobar. El plan de $15/mes es la siguiente pantalla del mismo flujo — te redirigimos ahí después del $35.",
    billingMaintenanceApproveTitle: "Un paso más — aprueba el mantenimiento de $15/mes",
    billingMaintenanceApproveBody:
      "Tu setup de $35 ya está activo. Aprueba la suscripción de $15/mes en Shopify para que las actualizaciones automáticas del catálogo continúen después del día 31. El mes 1 ya está incluido en el setup — no hay doble cobro hoy.",
    subscribeMaintenance: "Aprobar $15/mes en Shopify",
    billingMaintenanceApproved: "Plan de mantenimiento activo — $15/mes desde el día 31 (mes 1 incluido en el setup).",
    billingFootnote:
      "Sin devoluciones. Cancela en Shopify Admin — aplica al siguiente periodo; el mes en curso ya está pagado ($35 primer mes, luego $15/mes).",
    pricingMaintenanceIncluded:
      "Incluido: actualizaciones de $15/mes empiezan automáticamente después del primer mes. Cancela en Shopify Admin cuando quieras.",
    unlockApply: "Pagar $35 — desbloquear Apply",
    step2PayIntro:
      "Revisa la vista previa abajo, marca la casilla para confirmar backup/restore y paga en Shopify. Apply se desbloquea en esta misma pantalla — sin vista previa duplicada.",
    step2ConfirmBeforePay: "Marca esta casilla antes de pagar — guardamos backup y puedes restaurar antes de desinstalar",
    billingAlreadyApproved:
      "Esta tienda ya aprobó el cargo de $35 en Shopify — no verás la pantalla de pago otra vez. Usa Restaurar todo abajo para deshacer cambios y volver a probar el flujo.",
    step2NoPendingWork:
      "No hay cambios pendientes en productos. Si ya aplicaste optimizaciones, usa Restaurar todo para probar el flujo completo otra vez.",
    billingBundleContinue: "Continuar — aprobar plan $15/mes (obligatorio)",
    billingRequired: "Completa el pago de $35 para desbloquear Apply.",
    applyAlreadyDone:
      "Tu optimización inicial ya está aplicada. Las actualizaciones mensuales son automáticas — no necesitas hacer nada más.",
    step4RestoreToContinue:
      "Esta tienda ya tiene un Apply completado registrado. Usa Restaurar todo abajo para deshacer cambios y volver a correr el flujo completo.",
    step4FlowTitle: "Aplicar en tu tienda",
    step4PaymentBodyFirst: "Continúa para completar el pago en Shopify y desbloquear Apply.",
    step4PaymentSuccess:
      "Pago exitoso — setup de $35 completado. Redirigiendo para aprobar mantenimiento de $15/mes (cobro desde el día 31).",
    step4FlowIntro: "Completa el pago en Shopify para desbloquear Apply.",
    expectationsPreviewTitle: "Qué esperar después de aplicar",
    expectationsPreviewMeans1:
      "Después del Apply, la búsqueda con IA podrá leer títulos, descripciones e identidad de marca claros en tu tienda.",
    expectationsPreviewMeans2:
      "Optimizaremos tus {{count}} productos prioritarios (donde más importa la visibilidad AI).",
    expectationsPreviewNot1:
      "Menciones instantáneas en AI search el mismo día — los crawlers necesitan tiempo para re-leer tu tienda.",
    expectationsPreviewNot2:
      "Garantía de posición #1 — los resultados de AI search cambian constantemente.",
    expectationsPreviewTimeline1:
      "2–4 semanas después del Apply: los crawlers de IA suelen reindexar tu tienda.",
    expectationsPreviewTimeline2:
      "4–8 semanas después del Apply: más probabilidad de aparecer en respuestas de AI search.",
    expectationsPreviewMaintenanceTitle: "Después del mes 1 — mantenimiento $15/mes",
    expectationsPreviewMaintenance1: "Re-escaneo mensual de hasta {{limit}} productos principales por ventas",
    expectationsPreviewMaintenance2: "Actualizaciones cuando productos nuevos o gaps bajan tu score",
    expectationsPreviewMaintenance3: "Pulido de productos nuevos conforme crece tu catálogo",
    step4PaidIntro: "Pago completado — pulsa Apply para publicar los cambios en tu tienda.",
    step2ConfirmIntro: "Pago completado — confirma que entiendes backup/restore y continúa al Apply.",
    introTitle: "Analizaremos cómo la IA ve tu tienda",
    introBenefitTitle: "Qué ganas con PredictaCore",
    introBenefitLead:
      "Cuando ChatGPT, Perplexity o Google AI recomiendan productos, priorizan títulos, descripciones e identidad de marca completos — no el gasto en anuncios. Encontramos esos gaps y los corregimos en tu catálogo.",
    introBody:
      "Antes de cualquier pago, escaneamos hasta {{scanLimit}} productos (ordenados por ventas) y te mostramos dónde ChatGPT, Perplexity y Google AI pueden pasar por alto tu tienda — más un plan claro para corregirlo.",
    introBullet1: "Escaneo solo lectura — no modificamos productos hasta que pagues y confirmes Apply",
    introBullet2:
      "Beneficio: títulos, descripciones e identidad de marca listos para IA para que los asistentes recomienden tus productos en tus mercados",
    introBullet3:
      "Tus {{aiLimit}} productos principales por ventas reciben SEO completo con IA; el resto usa plantillas según tus mercados — vista previa de todo antes del setup de $35",
    introNoChanges: "Nada en tu tienda se modifica durante esta auditoría gratuita.",
    pricingScope:
      "Incluido: escaneo de hasta {{scanLimit}} productos · pulido IA completo en los {{aiLimit}} principales por ventas",
    pricingExtra:
      "¿Necesitas más de {{aiLimit}} con IA completa? +${{packPrice}} pago único por cada {{packSize}} productos adicionales",
    loadingAuditSubtext: "Escaneo solo lectura — aún no modificamos nada en tu tienda.",
    loading: "Analizando tu tienda y productos para búsqueda con IA…",
    loadingAiSummary: "Analizando tu tienda para preparar tu plan de optimización…",
    loadingAiSummarySubtext: "Preparamos tu score, lista de gaps y resumen IA — los resultados aparecen al terminar.",
    auditLoadTimeout: "El escaneo tardó demasiado. Tus datos en Shopify están seguros — inténtalo de nuevo.",
    auditLoadTimeoutHint:
      "Catálogos grandes pueden necesitar un segundo intento. Recarga desde Admin de Shopify → Apps → PredictaCore.",
    optimizingStore: "Estamos optimizando tu tienda y tus productos",
    optimizingStoreSubtext:
      "Actualizando títulos, descripciones e identidad de marca para búsqueda con IA — suele tardar 1–2 minutos.",
    startAuditButton: "Iniciar auditoría gratis — acepto",
    monthlyBeforePayTitle: "Después de desbloquear ($15/mes)",
    monthlyBeforePayBody:
      "$35 hoy cubre tu primer mes y desbloquea Apply. Luego $15/mes hasta cancelar en Shopify — sin devoluciones; la cancelación aplica al siguiente periodo.",
    generateAiPlan: "Generar plan personalizado con IA",
    skipAiPlan: "Omitir resumen IA y continuar",
    step3AiTitle: "Resumen IA",
    step3AiIntro:
      "Genera un resumen narrativo con IA. Cuando termine, se activa Continuar para el paso 4.",
    step3ContinueWait: "Genera el resumen IA arriba para continuar.",
    step3ContinueReady: "Resumen listo — continúa al preview.",
    generateAiPlanBody:
      "La IA escribe un resumen breve en lenguaje claro de tus gaps y prioridades — útil si quieres leer un plan narrativo antes del preview. Tarda unos 10–20 segundos.",
    skipAiPlanBody:
      "Ve directo al paso 4. La lista de correcciones del audit ya está lista — omitir no reduce la calidad de la optimización.",
    skipAiWhileLoading: "Continuar sin resumen IA",
    retryAiPlan: "Reintentar resumen IA",
    previewNotAppliedYet: "Aún no hemos cambiado nada en tu tienda — esto es solo una vista previa.",
    previewAwaitApply:
      "Pago completado — aún no hay cambios en vivo. Pulsa Apply abajo para publicar estos cambios en tu tienda.",
    alreadyOptimizedTitle: "Ya optimizado",
    alreadyOptimizedBody:
      "No hay cambios pendientes — tu tienda se optimizó en una sesión anterior. Usa Restore abajo para repetir el wizard.",
    themeOnboardingTitle: "Activa los bloques del tema (requerido para crawlers de IA)",
    themeOnboardingBody:
      "Apply guardó tu SEO y schema dentro de Shopify. Para entregar esos datos a ChatGPT, Perplexity y Google AI en tu tienda en vivo, activa estos app embeds del tema:",
    themeOnboardingStepsTitle: "Pasos (unos 5 minutos)",
    themeOnboardingStep1: "Admin de Shopify → Tienda online → Temas → Personalizar (tema publicado).",
    themeOnboardingStep2: "En el editor, abre App embeds en la barra lateral (icono de piezas).",
    themeOnboardingStep3: "Busca PredictaCore → activa PredictaCore Brand (JSON-LD Organization + Website en <head>).",
    themeOnboardingStep4: "Activa PredictaCore Product (JSON-LD de producto en páginas de producto).",
    themeOnboardingStep5: "Pulsa Guardar (arriba a la derecha), vuelve a PredictaCore y toca Reverificar entrega abajo.",
    themeOnboardingStep6: "Verifica llms.txt: abre {{llmsUrl}} en una pestaña nueva — debe verse texto plano sobre tu tienda.",
    themeOnboardingStep7:
      "Opcional: Tienda online → Navegación → Redirecciones URL — de /llms.txt a /apps/predictacore/llms.txt (ruta estándar para crawlers de IA).",
    themeOnboardingAfterSteps:
      "Cuando todas las verificaciones estén en verde (8/8), los crawlers pueden leer tu schema en la tienda en vivo. Re-rastreo suele tardar 2–4 semanas.",
    themeOnboardingBrand: "PredictaCore Brand — schema de organización + sitio web en <head>",
    themeOnboardingProduct: "PredictaCore Product — JSON-LD de producto en páginas de producto",
    themeOnboardingLlms:
      "llms.txt se sirve en /apps/predictacore/llms.txt con la app instalada — no hace falta otro bloque.",
    themeOnboardingCta: "Abrir editor de temas (App embeds)",
    refreshingStore: "Actualizando tu tienda…",
    confirmingPayment: "Confirmando pago…",
    restoreWarning:
      "Restore solo revierte el último Apply. Optimizaciones anteriores se mantienen.",
    products: "Productos",
    markets: "Mercados",
    continue: "Continuar",
    back: "Atrás",
    stateTitle: "Estado actual",
    impactTitle: "Por qué las AI no te recomiendan",
    planTitle: "Qué vamos a corregir",
    rollbackNote:
      "Guardamos una copia antes de cada cambio. Antes de desinstalar, elige abajo si restaurar tu tienda o conservar los datos optimizados.",
    gscTitle: "Tráfico orgánico de Google (opcional)",
    gscWhyShopify:
      "Shopify Analytics muestra sesiones, pedidos y canales de venta — pero Shopify no comparte con apps de terceros el informe oficial de Google sobre búsqueda orgánica (impresiones y clics en resultados de Google).",
    gscWhyGoogle:
      "Esos datos están en Google Search Console — cómo Google ve tu tienda en Search. Conectar es opcional, solo lectura, y no cambia tu SEO ni el Apply.",
    gscNotConfigured:
      "La conexión con Google aún no está activada en este servidor PredictaCore. Cuando esté activa, aquí aparecerá el botón Conectar — la tienda no necesita API keys.",
    gscConnectHint:
      "Conecta con la cuenta de Google que tenga esta tienda en Search Console (el mismo correo de search.google.com). Una cuenta de Google por tienda Shopify.",
    gscSkipOk: "Puedes omitir esto — optimización, schema, mercados y scores funcionan sin Google.",
    gscConnect: "Conectar Google Search Console (opcional)",
    gscBeforeAfterTitle: "Google orgánico — antes vs después del Apply",
    gscBaseline: "Punto de partida (al Apply): {{impressions}} impresiones · {{clicks}} clics",
    gscLatest: "Más reciente (28 días): {{impressions}} impresiones · {{clicks}} clics",
    gscDeltaImpressions: "Cambio en impresiones desde el Apply: {{delta}}",
    gscDeltaClicks: "Cambio en clics desde el Apply: {{delta}}",
    gscAwaitingBaseline: "Conecta Search Console y ejecuta Apply para capturar tu comparación antes/después.",
    deliveryTitle: "Lo que PredictaCore completó",
    deliveryIntro:
      "Estos elementos se guardan en Shopify al hacer Apply — no necesitas pasos extra.",
    deliveryRecommendTitle: "Recomendado — mejorar aún más tu visibilidad en IA",
    deliveryRecommendIntro:
      "Shopify no permite que las apps activen bloques del tema por ti (el comerciante debe aprobarlo en el editor). Estos pasos opcionales ayudan a que los crawlers de IA lean tu schema en la tienda en vivo.",
    deliveryWhyManualTheme:
      "Por qué no podemos hacerlo por ti: Shopify exige que el dueño de la tienda active los app embeds en Tienda online → Temas. PredictaCore ya guardó los datos — solo activas dos interruptores (unos 2 minutos).",
    deliveryReady: "Entrega en vivo lista — configuración automática completa.",
    deliveryNotReady: "{{done}} pasos automáticos completos · {{pending}} recomendaciones opcionales abajo",
    deliveryScore: "{{pct}}% automatizado",
    deliveryThemeBrand: "Bloque PredictaCore Brand activo en el tema",
    deliveryThemeProduct: "Bloque PredictaCore Product activo en el tema",
    deliveryShopSchema: "Schema Organization guardado (metafield de la tienda)",
    deliveryProductSchema: "Schema Product guardado (producto de muestra)",
    deliveryLlmsLive: "llms.txt activo en /apps/predictacore/llms.txt",
    deliveryLiveProductLd: "JSON-LD de Product visible en la página del producto en vivo",
    deliveryLiveOrgLd: "JSON-LD de Organization visible en el HTML de la tienda",
    deliveryLlmsMetafield: "Contenido de llms.txt guardado (metafield de la tienda)",
    deliveryOpenTheme: "Arreglar en el editor de temas",
    deliveryRecheck: "Se actualiza automáticamente después del Apply y cada 6 horas.",
    deliveryRecheckNow: "Reverificar entrega ahora",
    deliveryVerifySection: "Verifica tus resultados — incluido con PredictaCore",
    deliveryVerifyBody:
      "Comprobaciones en un clic que la competencia no ofrece: confirma que Google ve tu schema de producto y abre tu página en vivo.",
    deliveryRichResultsTest: "Probar en Google Rich Results",
    deliveryViewLivePage: "Abrir página del producto en vivo",
    postApplyTitle: "Optimización completada",
    postApplyManualTitle: "Recomendado — mejorar visibilidad en crawlers en vivo",
    postApplyManualBody:
      "PredictaCore ya guardó SEO y schema en Shopify. Estos pasos manuales ayudan a que los crawlers de IA los lean en tu tienda en vivo (aparte de tu score arriba).",
    deliveryOptionalNote: "Configuración manual opcional — no forma parte del Apply pagado.",
    postApplyAlmostTitle: "Opcional — termina la entrega en vivo (2 min)",
    postApplyBody: "Tu tienda está actualizada. Reabre PredictaCore para ver tu score cuando quieras.",
    postApplyThemeRequired:
      "Apply guardó SEO y schema en Shopify. Para mostrarlos en tu tienda en vivo, activa dos bloques del tema — Shopify exige que lo hagas tú en el editor; las apps no pueden activarlos automáticamente.",
    viewDashboard: "Ver dashboard de score",
    uninstallPrefTitle: "Si desinstalas PredictaCore",
    uninstallPrefIntro:
      "Elige qué pasa con tu SEO e identidad de marca cuando quites la app en Shopify Admin. Puedes cambiarlo antes de desinstalar.",
    uninstallPrefRestoreLabel: "Restaurar mis datos originales (recomendado)",
    uninstallPrefRestoreBody:
      "Al desinstalar intentamos devolver títulos, descripciones e identidad de marca al estado pre-Apply. Ideal si dejas la app.",
    uninstallPrefKeepLabel: "Conservar mis datos optimizados",
    uninstallPrefKeepBody:
      "Al desinstalar solo quitamos PredictaCore — tu SEO optimizado y cambios de marca permanecen en tus productos.",
    uninstallPrefSaved: "Preferencia guardada.",
    uninstallPrefSteps:
      "Para desinstalar: Shopify Admin → Configuración → Apps → PredictaCore → Eliminar. Se aplicará la opción elegida arriba.",
    previewSoon: "Vista previa de cambios — próximamente",
    priorityTitle: "Productos prioritarios",
    priorityExplain:
      "Elegimos primero tus best sellers y productos con más probabilidad de vender, luego los ordenamos por gaps SEO/GEO. Score más alto = más que corregir en ese producto.",
    priorityPlanSummary:
      "Apply actualizará {{count}} productos en {{batches}} categorías · {{mirrors}} con pulido individual · seleccionados por ventas + gaps AI search",
    priorityScopeSummary:
      "{{count}} productos en alcance · {{high}} gaps urgentes · {{medium}} moderados",
    rank: "#",
    product: "Producto",
    score: "Urgencia",
    targetScore: "Objetivo",
    loading: "Analizando tu tienda con IA…",
    loadingHint: "Suele tardar 10–20 segundos. Espera antes de continuar.",
    error: "Algo salió mal",
    impactIntro:
      "La búsqueda AI usa títulos y descripciones de producto para mostrar tiendas. Si falta info, cuesta más que te encuentren.",
    gapNoSeoTitle: "{{count}} productos sin SEO title",
    gapNoSeoDesc: "{{count}} productos sin SEO description",
    gapNoDesc: "{{count}} productos sin descripción",
    gapSingleLocale: "Solo un idioma publicado — limita visibilidad AI entre mercados",
    gapNoSchema: "Sin Schema.org — las AI no saben quién eres",
    gapLowScore: "Score {{score}}/100 — no listo para recomendaciones AI",
    fixSchema: "Añadir identidad de tienda (Schema.org) para {{region}}",
    fixBatch: "Aplicar patrones SEO a {{count}} productos prioritarios ({{batches}} categorías)",
    fixMirror: "Refinar individualmente los top {{count}}",
    fixCategory: "SEO en lote para {{count}} productos",
    previewTitle: "Vista previa de cambios",
    previewApplyIntro: "Qué actualizaremos en tu tienda",
    previewRowTitles: "Títulos de búsqueda — {{count}} productos",
    previewRowDescs: "Descripciones de búsqueda — {{count}} productos",
    previewRowBodies: "Descripciones de producto — {{count}} productos",
    previewRowMirror: "Pulido individual en top sellers — {{count}} productos (★ abajo)",
    previewRowBatch: "Patrones por categoría — {{count}} grupos",
    previewRowBrand: "Identidad de marca para AI search (Schema.org JSON-LD)",
    previewMirrorLegend: "★ = top seller con título y descripción pulidos individualmente",
    previewTableIntro: "Muestra de cambios (primeros 6 productos):",
    before: "Antes",
    after: "Después",
    seoTitle: "SEO title",
    apply: "Aplicar cambios",
    confirmLabel: "Entiendo — se guarda backup y puedo restaurar antes de desinstalar",
    applying: "Aplicando…",
    applySuccess: "Listo — {{count}} productos actualizados. Backup guardado.",
    applySuccessWithSchema: "Listo — {{count}} productos actualizados e identidad de marca guardada. Backup guardado.",
    applySuccessSchemaOnly: "Listo — identidad de marca activada. Backup guardado.",
    resultsTitle: "Qué cambió",
    resultsScoreExplainSchemaOnly:
      "{{before}} → {{after}}: activamos la identidad de marca para AI search (+{{gain}} pts). Tus {{count}} productos prioritarios ya tenían SEO completo — no se editaron productos.",
    resultsScoreExplainFull:
      "{{before}} → {{after}}: {{productCount}} productos actualizados e identidad de marca guardada (+{{gain}} pts en total).",
    resultsScoreExplainProducts:
      "{{before}} → {{after}}: {{productCount}} productos actualizados en {{categories}} categorías.",
    resultsAppliedTitle: "Qué aplicamos",
    resultsAppliedBrand: "Identidad de marca (Schema.org JSON-LD) — guardada para AI search en tus mercados",
    resultsAppliedProductsUpdated: "{{count}} productos — títulos y/o descripciones de búsqueda actualizados",
    resultsAppliedProductsVerified: "{{count}} productos prioritarios — SEO verificado completo (sin cambios)",
    resultsScoreBreakdownTitle: "Por qué cambió tu score",
    resultsScoreRowCatalog: "SEO de productos · {{count}} prioritarios",
    resultsScoreRowBrand: "Identidad de marca para AI search",
    resultsBackupNote: "Backup guardado antes de cualquier cambio.",
    resultsTimeline:
      "Cuándo ver resultados: los crawlers AI suelen reindexar en 2–4 semanas. Citas en asistentes y Google AI Overviews suelen mejorar en 4–8 semanas.",
    resultsProductsTitle: "Cada producto que actualizamos",
    changeSearchTitle: "Título de búsqueda",
    changeSearchDesc: "Descripción de búsqueda",
    changeProductDesc: "Descripción de producto",
    setupCompleteTitle: "Configuración única completada",
    setupCompleteBody:
      "Tu tienda está optimizada. El wizard no se ejecutará de nuevo — el mantenimiento mensual ($15/mes) cubre re-scans y productos nuevos.",
    viewScoreDashboard: "Ver panel de score",
    viewSummary: "Ver resumen de optimización",
    moreProducts: "+{{count}} productos más",
    applyError: "No se pudieron aplicar los cambios",
    noChanges: "Todos los productos ya tienen SEO",
    noChangesAlreadyApplied:
      "Estos cambios ya se aplicaron — recarga la app para ver tu score actualizado, o usa Restore / Reset demo store para repetir el wizard.",
    restore: "Restaurar último cambio",
    restoreAll: "Restaurar todo al original",
    restoreAllConfirm:
      "Esto deshace TODOS los backups de PredictaCore — productos que cambiamos e identidad de marca. ¿Continuar?",
    restoring: "Restaurando…",
    restoreSuccess: "Restaurados {{products}} productos del último backup.",
    restoreAllSuccess:
      "Restaurados {{products}} productos e identidad de marca ({{schema}}) de {{batches}} backup(s).",
    restoreAllSchemaOnly:
      "Identidad de marca restaurada. No había SEO de productos en el backup — solo se aplicó schema la última vez.",
    restoreAllHint:
      "Restaurar y Deshacer usan la misma copia — productos e identidad de marca vuelven a como estaban antes de Aplicar. Tu score debería reflejar ese momento, no cero.",
    resetTestTitle: "Deshacer todos los cambios de PredictaCore (piloto)",
    resetTestBody:
      "Igual que Restaurar todo: devuelve tu tienda a como estaba antes de Aplicar, usando la copia que guardamos. Tu score debería subir si ya habías aplicado cambios.",
    resetTestConfirm:
      "¿Deshacer todos los cambios de PredictaCore en esta tienda? Productos e identidad de marca volverán a la copia pre-Aplicar.",
    resetTestSuccess:
      "Deshacer completo — {{products}} productos restaurados de la copia{{schema}}. Actualiza el paso 1 para ver tu score.",
    resetTestLoading: "Deshaciendo cambios…",
    resetTitle: "Tienda totalmente optimizada",
    resetBody:
      "Estás en 100/100 — los gaps, recomendaciones y la vista previa no aparecen porque no queda nada por corregir. Para volver a ver el flujo completo, restaura la tienda a como estaba antes de PredictaCore.",
    resetHint:
      "Tras deshacer/restaurar, tu score vuelve a lo que era antes de PredictaCore — a menudo ~25 en una tienda demo sin optimizar. Los pasos 2–4 mostrarán cambios pendientes otra vez.",
    aiUnavailable: "Nuestra AI no está disponible. Intenta de nuevo más tarde.",
    aiNotConfigured: "El resumen IA no está activo en este servidor. Puedes continuar — tu plan del audit ya está listo.",
    aiError: "Nuestra AI no pudo completar el análisis.",
    aiTimeout: "Nuestra AI no respondió a tiempo. Intenta de nuevo.",
    expectationsTitle: "Qué pasa ahora",
    expectationsMeansTitle: "Qué significa tu score",
    expectationsMeans1: "Tu tienda está lista para AI search — títulos, descripciones e identidad de marca en su lugar.",
    expectationsMeans2: "Optimizamos tus {{count}} productos prioritarios (donde más impacta la visibilidad AI).",
    expectationsMeans2ProductsDone:
      "Tus productos prioritarios ya tenían SEO completo — guardamos la identidad de marca para que las AI sepan quién eres.",
    expectationsNotTitle: "Qué NO significa",
    expectationsNot1: "Menciones instantáneas en AI search hoy — los crawlers necesitan tiempo para re-leer tu tienda.",
    expectationsNot2: "Garantía de posición #1 — los resultados de AI search cambian constantemente.",
    expectationsDoneTitle: "Qué aplicamos en tu tienda",
    expectationsDone1Updated: "{{count}} productos — títulos y descripciones de búsqueda actualizados",
    expectationsDone1Verified: "{{count}} productos prioritarios revisados — SEO ya completo",
    expectationsDone2: "Descripciones de producto donde faltaban",
    expectationsDone3: "Identidad de marca para AI search (activa el embed en Theme Settings si no lo hiciste)",
    expectationsDone4: "Backup completo — restaura cuando quieras desde el paso 4",
    expectationsTimelineTitle: "Cuándo esperar resultados reales",
    expectationsTimeline1: "2–4 semanas: los crawlers de AI search suelen reindexar tu tienda",
    expectationsTimeline2: "4–8 semanas: más probabilidad de aparecer en respuestas de AI search",
    maintenancePlanTitle: "Mantenimiento mensual — $15/mes",
    maintenancePlanIntro: "Tu catálogo cambia. El mantenimiento mantiene tu score alto:",
    maintenancePlan1: "Re-escaneo mensual de hasta {{limit}} productos prioritarios por ventas",
    maintenancePlan2: "Alertas si productos nuevos o gaps bajan tu score",
    maintenancePlan3: "Optimización de productos nuevos conforme creces",
    maintenancePlanNote:
      "Incluido al desbloquear — $15/mes facturado por Shopify cada mes después del primer mes ($35). Cancela cuando quieras; sin devoluciones.",
    applyQuotaTitle: "Reglas de Apply — lee antes de continuar",
    applyQuotaSetup:
      "Tu setup de $35 incluye un Apply ahora — cuenta como la actualización incluida de este mes. Después, un Apply automático corre cada mes calendario con tu plan de $15/mes.",
    applyQuotaMonthlyAuto:
      "Tu Apply incluido de {{period}} corre automáticamente — escaneamos tu catálogo y aplicamos cambios pendientes sin que pulses Apply. Apply manual no está incluido este mes salvo que compres uno extra.",
    applyQuotaMonthlyDone:
      "Tu Apply automático incluido de {{period}} ya se ejecutó. ¿Necesitas otro este mes? Apply extra cuesta $15 (pago único).",
    applyQuotaExtraAvailable:
      "Tienes {{count}} crédito(s) de Apply extra — pagados $15 c/u. Puedes ejecutar Apply manualmente ahora.",
    applyQuotaExtraPayment: "Apply extra — $15 pago único",
    applyQuotaExtraPaymentBody:
      "Tu Apply mensual incluido ya se usó (o está programado automáticamente). Un Apply adicional este mes requiere $15 pago único. Misma calidad — lo disparas tú.",
    applyQuotaNoSubscription:
      "El Apply mensual automático requiere mantenimiento activo ($15/mes). Sin él, puedes comprar un Apply extra por $15 cuando necesites cambios.",
    applyQuotaPeriod: "Mes de facturación: {{period}}",
    payExtraApply: "Pagar $15 por Apply extra",
    confirmExtraApply: "¿Pagar $15 pago único para desbloquear un Apply manual este mes?",
    extraApplySuccess: "Pago confirmado — 1 crédito de Apply extra añadido. Ya puedes Apply.",
    reasonNoSeoTitle: "Sin título de búsqueda",
    reasonNoSeoDesc: "Sin descripción de búsqueda",
    reasonNoDesc: "Sin descripción de producto",
    reasonGiftCard: "Prioridad baja — gift card",
    reasonNoTags: "Sin tags semánticos",
  },
  fr: {
    title: "PredictaCore",
    subtitle: "Audit de visibilité IA",
    introTitle: "Nous analyserons comment l'IA voit votre boutique",
    introBody:
      "Avant tout paiement ou modification, nous lisons votre catalogue pour afficher un score de préparation IA et un plan d'action clair.",
    introBullet1: "Scan en lecture seule — aucune modification avant paiement et confirmation",
    introBullet2: "Score basé sur titres, descriptions et identité de marque pour l'IA",
    introBullet3: "Aperçu de chaque changement avant les $35 uniques",
    introNoChanges: "Rien n'est modifié sur votre boutique pendant cet audit gratuit.",
    startAuditButton: "Démarrer l'audit gratuit — j'accepte",
    monthlyBeforePayTitle: "Après déblocage ($15/mois)",
    monthlyBeforePayBody:
      "$35 aujourd'hui couvre votre premier mois et débloque Apply. Puis $15/mois jusqu'à annulation dans Shopify — sans remboursement ; l'annulation s'applique à la période suivante.",
    generateAiPlan: "Générer un plan IA personnalisé",
    skipAiPlan: "Ignorer le résumé IA et continuer",
    step3AiTitle: "Résumé IA",
    step3AiIntro:
      "Générez un court résumé IA. Quand il est prêt, Continuer s'active pour l'étape 4.",
    step3ContinueWait: "Générez le résumé IA ci-dessus pour continuer.",
    step3ContinueReady: "Résumé prêt — continuez vers l'aperçu.",
    generateAiPlanBody:
      "L'IA rédige un court résumé clair de vos lacunes et priorités — utile si vous voulez un plan narratif avant l'aperçu. Comptez 10–20 secondes.",
    skipAiPlanBody:
      "Passez directement à l'étape 4. La liste de corrections de l'audit est déjà complète — ignorer ne réduit pas la qualité de l'optimisation.",
    skipAiWhileLoading: "Continuer sans résumé IA",
    retryAiPlan: "Réessayer le résumé IA",
    previewNotAppliedYet: "Rien n'a encore été modifié — ceci est un aperçu uniquement.",
    heroTitle: "Audit IA gratuit",
    heroBody:
      "Nous analysons gratuitement vos 50 produits prioritaires. Découvrez ce qui bloque les recommandations IA — aperçu de chaque changement avant de payer.",
    scopeNote: "Top {{analyzed}} produits sélectionnés sur {{total}} au catalogue",
    scopeNoteFullCatalog: "Les {{analyzed}} produits de votre catalogue analysés ({{total}} au total)",
    scopeNoteFullCatalogExcluded:
      "{{analyzed}} produits optimisés · {{total}} au catalogue · {{excluded}} carte cadeau exclue (SEO non applicable)",
    selectionNote: "{{selection}} — classés par potentiel de vente puis gaps SEO/GEO.",
    selectionFromBestSellers: "Collection « {{collection}} »",
    selectionFromRanking: "Classés par inventaire actif et statut publié",
    selectionFromSales: "Classés par ventes réelles des 90 derniers jours",
    selectionFullCatalog: "Catalogue complet — les {{total}} produits inclus (sous la limite de {{limit}})",
    selectionFullCatalogExcluded:
      "Catalogue complet — {{total}} produits · {{excluded}} carte cadeau exclue de l'optimisation SEO",
    stepOf: "Étape {{current}} sur {{total}}",
    catalogScoreLabel: "Score catalogue prioritaire",
    foundationScoreLabel: "Fondation boutique",
    scoreExplain:
      "Le score catalogue est la couverture SEO moyenne sur vos 50 produits prioritaires. Apply corrige titres et descriptions. Descriptions produit et Schema.org sont des étapes séparées.",
    scorePlainTitle: "Comment lire votre score",
    scorePlainBody:
      "C'est une note de préparation pour la recherche IA (ChatGPT, Perplexity, Google AI). Nous faisons la moyenne de quatre contrôles sur vos produits prioritaires — pas tout l'admin Shopify ni vos ventes.",
    scorePlain1: "Titres de recherche — l'IA trouve-t-elle un nom clair pour chaque produit ?",
    scorePlain2: "Descriptions de recherche — courts résumés que l'IA peut citer",
    scorePlain3: "Descriptions produit — assez de détail sur la page",
    scorePlain4: "Identité de marque — l'IA sait-elle qui est votre boutique ({{region}}) ?",
    scorePlainLow:
      "Un score bas après Annuler/Restaurer signifie souvent que la boutique est revenue à l'état d'avant PredictaCore — SEO incomplet, pas un bug de calcul.",
    catalogCountExplain:
      "Nous analysons {{analyzed}} produits vendables. Votre catalogue en compte {{total}} — {{excluded}} carte cadeau est exclue (non optimisée pour la recherche IA produit).",
    restoreVsResetTitle: "Annuler vs reset — important",
    restoreVsResetBody:
      "Restaurer / Annuler utilise la sauvegarde PredictaCore d'avant Apply. Titres, descriptions et identité de marque reviennent à ce moment — le score devrait y correspondre.",
    restoreVsResetWarning:
      "Ce n'est pas un effacement de votre boutique. Nous ne vidons jamais le SEO lors d'une restauration.",
    scoreBreakdownTitle: "Couverture catalogue",
    foundationBreakdownTitle: "Fondation boutique (GEO)",
    scoreAfterApply: "Après Apply : {{score}}/100",
    scoreSeoComplete: "Métadonnées SEO — complètes sur le catalogue prioritaire",
    factorSeoTitle: "{{pct}}% — {{missing}} sur {{total}} titres SEO manquants",
    factorSeoTitleDone: "100% — titres SEO complets",
    factorSeoDesc: "{{pct}}% — {{missing}} sur {{total}} descriptions SEO manquantes",
    factorSeoDescDone: "100% — descriptions SEO complètes",
    factorDesc: "{{pct}}% — {{missing}} sur {{total}} sans description produit",
    factorDescDone: "100% — descriptions produit complètes",
    factorSchema: "Identité boutique — Schema.org pas encore actif",
    factorSchemaDone: "Identité boutique — Schema.org actif",
    fixSeoDone: "Métadonnées SEO — déjà complètes ✓",
    previewAllDone: "Tous les produits ont déjà un SEO. Rien à appliquer.",
    previewProductsDone: "Le SEO produit est déjà complet — aucun changement de titre ou description.",
    previewSchemaOnlyExplain:
      "Nous enregistrerons l'identité de marque (Schema.org JSON-LD) pour que l'IA reconnaisse {{shop}} en {{region}}. Activez l'embed du thème après application.",
    previewSchemaRow: "Identité de marque (Schema.org)",
    previewSchemaRowDetail: "Metafield JSON-LD Organization + instructions theme embed",
    seeUpdatedScore: "Voir le score mis à jour",
    whyUsTitle: "Pourquoi PredictaCore",
    whyUs1: "Audit + aperçu gratuits — payez seulement quand vous êtes convaincu",
    whyUs2: "Top 50 best sellers — là où ventes et visibilité IA comptent",
    whyUs3: "Sauvegarde avant chaque changement + restauration en un clic",
    whyUs4: "Conçu pour le GEO — visibilité IA, pas seulement Google",
    pricingTitle: "Tarifs",
    pricingFree: "Gratuit — audit complet, plan IA et aperçu",
    pricingSetup:
      "$35 — premier mois + optimisation complète (débloque Apply). $15/mois ensuite pour les mises à jour automatiques.",
    pricingMaintenance: "",
    billingFootnote:
      "Sans remboursement. Annulez dans Shopify Admin — effet à la période suivante ; le mois en cours reste payé ($35 premier mois, puis $15/mois).",
    pricingMaintenanceIncluded:
      "Inclus : mises à jour à $15/mois automatiques après le premier mois. Annulez dans Shopify Admin quand vous voulez.",
    unlockApply: "Payer $35 — débloquer Apply",
    step2PayIntro: "Consultez l'aperçu ci-dessous, puis payez $35 dans Shopify pour débloquer Apply.",
    billingAlreadyApproved:
      "Cette boutique a déjà approuvé les $35 dans Shopify — l'écran de paiement ne réapparaîtra pas. Utilisez Restaurer tout ci-dessous pour annuler et retester le flux.",
    step2NoPendingWork:
      "Aucun changement produit en attente. Si vous avez déjà appliqué les optimisations, utilisez Restaurer tout pour retester le flux complet.",
    billingBundleContinue: "Continuer — approuver le plan $15/mois (obligatoire)",
    billingRequired: "Finalisez le paiement de $35 pour débloquer Apply.",
    applyAlreadyDone:
      "Votre optimisation initiale est déjà appliquée. Les mises à jour mensuelles sont automatiques — aucune action supplémentaire.",
    step4RestoreToContinue:
      "Cette boutique a déjà un Apply enregistré. Utilisez Restaurer tout ci-dessous pour annuler et relancer le flux complet.",
    step4FlowTitle: "Appliquer sur votre boutique",
    step4PaymentBodyFirst: "Continuer pour finaliser le paiement dans Shopify et débloquer Apply.",
    step4PaymentSuccess: "Paiement réussi — vous pouvez maintenant appliquer les changements.",
    step4FlowIntro: "Finalisez le paiement dans Shopify pour débloquer Apply.",
    expectationsPreviewTitle: "À quoi s'attendre après Apply",
    step4PaidIntro: "Paiement effectué — confirmez ci-dessous pour publier les changements.",
    restoreWarning:
      "La restauration n'annule que la dernière application. Les optimisations précédentes restent en place.",
    products: "Produits",
    markets: "Marchés",
    continue: "Continuer",
    back: "Retour",
    stateTitle: "État actuel",
    impactTitle: "Pourquoi l'IA ne vous recommande pas",
    planTitle: "Ce que nous allons corriger",
    rollbackNote:
      "Sauvegarde avant chaque modification. Avant de désinstaller, choisissez ci-dessous : restaurer ou conserver les données optimisées.",
    uninstallPrefTitle: "Si vous désinstallez PredictaCore",
    uninstallPrefIntro:
      "Choisissez ce qui arrive à votre SEO et identité de marque quand vous supprimez l'app dans Shopify Admin.",
    uninstallPrefRestoreLabel: "Restaurer mes données d'origine (recommandé)",
    uninstallPrefRestoreBody:
      "À la désinstallation, nous remettons titres, descriptions et identité de marque comme avant PredictaCore.",
    uninstallPrefKeepLabel: "Conserver mes données optimisées",
    uninstallPrefKeepBody:
      "À la désinstallation, nous retirons seulement PredictaCore — votre SEO optimisé reste sur vos produits.",
    uninstallPrefSaved: "Préférence enregistrée.",
    uninstallPrefSteps:
      "Pour désinstaller : Shopify Admin → Paramètres → Apps → PredictaCore → Supprimer.",
    previewSoon: "Aperçu des modifications — bientôt",
    priorityTitle: "Produits prioritaires",
    priorityExplain:
      "Nous choisissons d'abord vos best sellers et produits à fort potentiel de vente, puis les classons par gaps SEO/GEO. Score élevé = plus à corriger sur ce produit.",
    priorityPlanSummary:
      "Apply mettra à jour {{count}} produits dans {{batches}} catégories · {{mirrors}} avec polish individuel · sélectionnés pour ventes + gaps AI search",
    priorityScopeSummary:
      "{{count}} produits dans le périmètre · {{high}} gaps urgents · {{medium}} modérés",
    rank: "#",
    product: "Produit",
    score: "Urgence",
    targetScore: "Objectif",
    loading: "Analyse de votre boutique avec l'IA…",
    loadingHint: "Comptez 10–20 secondes. Patientez avant de continuer.",
    error: "Une erreur est survenue",
    impactIntro:
      "Notre IA a besoin de métadonnées produit structurées pour recommander votre boutique.",
    gapNoSeoTitle: "{{count}} produits sans titre SEO",
    gapNoSeoDesc: "{{count}} produits sans description SEO",
    gapNoDesc: "{{count}} produits sans description",
    gapSingleLocale: "Une seule langue — visibilité IA limitée",
    gapNoSchema: "Pas de Schema.org — l'IA ne sait pas qui vous êtes",
    gapLowScore: "Score {{score}}/100 — pas prêt pour l'IA",
    fixSchema: "Ajouter l'identité boutique (Schema.org)",
    fixBatch: "Appliquer des modèles SEO par catégorie à {{count}} produits",
    fixMirror: "Affiner les {{count}} produits prioritaires",
    fixCategory: "SEO par lot pour {{count}} produits",
    previewTitle: "Aperçu des modifications",
    previewApplyIntro: "Ce que nous mettrons à jour sur votre boutique",
    previewRowTitles: "Titres de recherche — {{count}} produits",
    previewRowDescs: "Descriptions de recherche — {{count}} produits",
    previewRowBodies: "Descriptions produit — {{count}} produits",
    previewRowMirror: "Polish individuel sur best sellers — {{count}} produits (★ ci-dessous)",
    previewRowBatch: "Modèles par catégorie — {{count}} groupes",
    previewRowBrand: "Identité de marque pour l'IA (Schema.org JSON-LD)",
    previewMirrorLegend: "★ = best seller avec titre et description affinés individuellement",
    previewTableIntro: "Échantillon des changements (6 premiers produits) :",
    before: "Avant",
    after: "Après",
    seoTitle: "Titre SEO",
    apply: "Appliquer",
    confirmLabel: "Je comprends — une sauvegarde est créée avant toute modification",
    applying: "Application…",
    applySuccess: "{{count}} produits mis à jour. Sauvegarde enregistrée.",
    applySuccessWithSchema: "{{count}} produits mis à jour et identité de marque enregistrée. Sauvegarde enregistrée.",
    applySuccessSchemaOnly:
      "Terminé — produits déjà optimisés. Identité de marque enregistrée. Sauvegarde enregistrée.",
    resultsSummarySchema: "L'identité de marque est active sur votre boutique.",
    scoreAlmostComplete:
      "{{count}} produits restent à corriger — allez à l'étape 4 pour atteindre ~{{score}}/100",
    resultsTitle: "Ce qui a changé",
    resultsSummary:
      "{{count}} produits ont maintenant un titre SEO optimisé IA dans {{categories}} catégories ({{mirrors}} produits prioritaires affinés).",
    resultsSummaryProductsDone:
      "0 produit mis à jour — le SEO du catalogue prioritaire était déjà complet.",
    resultsTimeline:
      "Quand voir des résultats : les crawlers IA réindexent en 2–4 semaines. Les citations dans les assistants s'améliorent souvent en 4–8 semaines.",
    resultsProductsTitle: "Chaque produit mis à jour",
    changeSearchTitle: "Titre de recherche",
    changeSearchDesc: "Description de recherche",
    changeProductDesc: "Description produit",
    setupCompleteTitle: "Configuration unique terminée",
    setupCompleteBody:
      "Votre boutique est optimisée. L'assistant ne se relancera pas — la maintenance mensuelle ($15/mo) couvre les re-scans et nouveaux produits.",
    viewScoreDashboard: "Voir le tableau de bord",
    viewSummary: "Voir le résumé d'optimisation",
    moreProducts: "+{{count}} produits de plus",
    applyError: "Impossible d'appliquer les modifications",
    noChanges: "Tous les produits ont déjà un SEO",
    noChangesAlreadyApplied:
      "Ces changements sont déjà appliqués — rechargez l'app pour voir le score, ou utilisez Restore / Reset demo store.",
    restore: "Restaurer le dernier changement",
    restoreAll: "Tout restaurer à l'original",
    restoreAllConfirm:
      "Cela annule TOUTES les optimisations et remet chaque produit comme avant. Continuer ?",
    restoring: "Restauration…",
    restoreSuccess: "{{count}} produits restaurés",
    restoreAllSuccess: "Terminé — {{count}} produits restaurés sur {{batches}} changements.",
    restoreAllHint:
      "Restaurer et Annuler utilisent la même sauvegarde — produits et identité de marque reviennent à l'état d'avant Apply. Le score doit refléter ce moment, pas zéro.",
    applyQuotaTitle: "Règles d'Apply — à lire avant de continuer",
    applyQuotaSetup:
      "Votre setup à $35 inclut un Apply manuel maintenant. Ensuite, les Apply inclus tournent automatiquement une fois par mois avec votre plan à $15/mois.",
    applyQuotaMonthlyAuto:
      "Votre Apply inclus pour {{period}} s'exécute automatiquement — nous scannons le catalogue sans clic Apply. Apply manuel non inclus ce mois sauf achat extra.",
    applyQuotaMonthlyDone:
      "Votre Apply automatique inclus pour {{period}} a déjà été exécuté. Besoin d'une autre mise à jour ce mois ? Apply extra : $15 (unique).",
    applyQuotaExtraAvailable:
      "Vous avez {{count}} crédit(s) Apply extra ($15 chacun). Vous pouvez Apply manuellement maintenant.",
    applyQuotaExtraPayment: "Apply extra — $15 unique",
    applyQuotaExtraPaymentBody:
      "Votre Apply mensuel inclus est utilisé (ou programmé). Un Apply supplémentaire ce mois coûte $15. Même qualité — déclenché par vous.",
    applyQuotaNoSubscription:
      "L'Apply mensuel automatique nécessite la maintenance ($15/mo). Sinon, achetez un Apply extra à $15 quand vous en avez besoin.",
    applyQuotaPeriod: "Mois de facturation : {{period}}",
    payExtraApply: "Payer $15 pour un Apply extra",
    confirmExtraApply: "Payer $15 pour débloquer un Apply manuel ce mois ?",
    extraApplySuccess: "Paiement confirmé — 1 crédit Apply extra ajouté. Vous pouvez Apply.",
    resetTestTitle: "Annuler tous les changements PredictaCore (pilote)",
    resetTestBody:
      "Identique à Tout restaurer : remet la boutique comme avant Apply via la sauvegarde. Le score remonte si vous aviez déjà appliqué des changements.",
    resetTestConfirm:
      "Annuler tous les changements PredictaCore sur cette boutique ? Produits et identité de marque reviendront à la sauvegarde pre-Apply.",
    resetTestSuccess:
      "Annulation terminée — {{products}} produits restaurés{{schema}}. Actualisez l'étape 1 pour voir le score.",
    resetTestLoading: "Annulation en cours…",
    resetTitle: "Boutique entièrement optimisée",
    resetBody:
      "Score 100/100 — les lacunes, recommandations et l'aperçu des changements sont masqués car il ne reste rien à corriger. Pour revoir le parcours complet, restaurez la boutique à son état d'origine.",
    resetHint:
      "Après annulation/restauration, le score revient à l'état d'avant PredictaCore — souvent ~25 sur une boutique demo non optimisée. Les étapes 2–4 afficheront à nouveau les changements en attente.",
    aiUnavailable: "Notre IA est temporairement indisponible.",
    aiNotConfigured: "Le résumé IA n'est pas activé sur ce serveur. Vous pouvez continuer — votre plan d'audit est prêt.",
    aiError: "Notre IA n'a pas pu terminer l'analyse.",
    aiTimeout: "Notre IA n'a pas répondu à temps. Réessayez.",
    reasonNoSeoTitle: "Titre de recherche manquant",
    reasonNoSeoDesc: "Description de recherche manquante",
    reasonNoDesc: "Description produit manquante",
    reasonGiftCard: "Priorité basse — carte cadeau",
    reasonNoTags: "Tags sémantiques manquants",
  },
};

export function t(locale, key, vars = {}) {
  const bag = MESSAGES[locale] ?? MESSAGES.en;
  let text = bag[key] ?? MESSAGES.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{{${k}}}`, String(v));
  }
  return text;
}

export function formatStepLabel(template, current, total) {
  return template.replace("{{current}}", String(current)).replace("{{total}}", String(total));
}
