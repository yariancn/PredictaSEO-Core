export const meta = () => [{ title: "PredictaCore Privacy Policy" }];

const page = {
  wrapper: {
    minHeight: "100vh",
    background: "#f8f9fb",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#1a1a2e",
    lineHeight: 1.65,
  },
  main: {
    maxWidth: "720px",
    margin: "0 auto",
    padding: "48px 24px 64px",
  },
  badge: {
    margin: 0,
    fontSize: "0.75rem",
    color: "#6366f1",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  h1: {
    fontSize: "1.85rem",
    margin: "8px 0 6px 0",
    color: "#0f0f1a",
    fontWeight: 700,
  },
  updated: {
    color: "#6b7280",
    marginBottom: "36px",
    fontSize: "0.9rem",
  },
  section: {
    marginBottom: "28px",
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "20px 22px",
  },
  h2: {
    fontSize: "1.05rem",
    margin: "0 0 12px 0",
    color: "#111827",
    fontWeight: 600,
  },
  p: {
    margin: "0 0 12px 0",
    color: "#374151",
  },
  ul: {
    margin: "0 0 12px 0",
    paddingLeft: "1.25rem",
    color: "#374151",
  },
  li: {
    marginBottom: "8px",
  },
  code: {
    background: "#f3f4f6",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "0.88em",
    color: "#4f46e5",
  },
  link: {
    color: "#4f46e5",
    fontWeight: 500,
  },
};

export default function PrivacyPolicy() {
  return (
    <div style={page.wrapper}>
      <main style={page.main}>
        <p style={page.badge}>PredictaCore</p>
        <h1 style={page.h1}>Privacy Policy</h1>
        <p style={page.updated}>Last updated: May 24, 2026</p>

        <section style={page.section}>
          <h2 style={page.h2}>Overview</h2>
          <p style={page.p}>
            PredictaCore (&quot;we&quot;, &quot;our&quot;, &quot;the app&quot;) is a Shopify app that helps merchants improve
            AI search readiness through product SEO optimization and Schema.org structured data. This policy
            describes what data we collect, how we use it, and your rights.
          </p>
        </section>

        <section style={page.section}>
          <h2 style={page.h2}>Data we collect</h2>
          <ul style={page.ul}>
            <li style={page.li}>
              <strong>Shop data:</strong> store name, domain, locales, markets, locations, product catalog
              (titles, descriptions, SEO fields), and shop metafields needed for optimization.
            </li>
            <li style={page.li}>
              <strong>App usage data:</strong> optimization snapshots, entity profile drafts, and billing status
              stored in our database to provide rollback and subscription features.
            </li>
            <li style={page.li}>
              <strong>Staff session data:</strong> OAuth access tokens and staff profile fields provided by Shopify
              during app installation (name, email) for authentication only.
            </li>
          </ul>
          <p style={{ ...page.p, marginBottom: 0 }}>
            PredictaCore does <strong>not</strong> collect or store customer personal information (names, emails,
            addresses, or order history of store customers).
          </p>
        </section>

        <section style={page.section}>
          <h2 style={page.h2}>How we use data</h2>
          <ul style={{ ...page.ul, marginBottom: 0 }}>
            <li style={page.li}>Analyze catalog and generate SEO / Schema.org recommendations</li>
            <li style={page.li}>Apply approved changes to products and shop metafields</li>
            <li style={page.li}>Provide rollback from optimization backups</li>
            <li style={page.li}>Process subscription billing through Shopify Billing API</li>
          </ul>
        </section>

        <section style={page.section}>
          <h2 style={page.h2}>Third-party services</h2>
          <p style={{ ...page.p, marginBottom: 0 }}>
            We use Google Gemini API to generate optimization suggestions. Product and shop context sent to Gemini
            is limited to catalog and SEO fields required for the feature. We do not send customer PII to third
            parties.
          </p>
        </section>

        <section style={page.section}>
          <h2 style={page.h2}>Data retention and deletion</h2>
          <ul style={{ ...page.ul, marginBottom: 0 }}>
            <li style={page.li}>When you uninstall the app, we delete your shop&apos;s sessions and stored app data.</li>
            <li style={page.li}>
              Shopify may send a <code style={page.code}>shop/redact</code> webhook 48 hours after uninstall; we
              purge all remaining shop data at that time.
            </li>
            <li style={page.li}>We respond to GDPR data requests within 30 days as required by Shopify.</li>
          </ul>
        </section>

        <section style={page.section}>
          <h2 style={page.h2}>Your rights</h2>
          <p style={{ ...page.p, marginBottom: 0 }}>
            Merchants can request access to or deletion of data by contacting us or through Shopify&apos;s GDPR
            tools. Because we do not store end-customer data, customer redaction requests typically require no
            action from PredictaCore.
          </p>
        </section>

        <section style={page.section}>
          <h2 style={page.h2}>Contact</h2>
          <p style={{ ...page.p, marginBottom: 0 }}>
            For privacy questions:{" "}
            <a href="mailto:privacy@predictaseo.com" style={page.link}>
              privacy@predictaseo.com
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
