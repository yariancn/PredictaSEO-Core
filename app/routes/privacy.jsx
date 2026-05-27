export const meta = () => [{ title: "PredictaCore Privacy Policy" }];

export default function PrivacyPolicy() {
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "720px",
        margin: "0 auto",
        padding: "40px 24px",
        lineHeight: 1.6,
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "8px" }}>PredictaCore Privacy Policy</h1>
      <p style={{ color: "#666", marginBottom: "32px" }}>Last updated: May 24, 2026</p>

      <section style={{ marginBottom: "24px" }}>
        <h2>Overview</h2>
        <p>
          PredictaCore (&quot;we&quot;, &quot;our&quot;, &quot;the app&quot;) is a Shopify app that helps merchants improve
          AI search readiness through product SEO optimization and Schema.org structured data. This policy
          describes what data we collect, how we use it, and your rights.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>Data we collect</h2>
        <ul>
          <li>
            <strong>Shop data:</strong> store name, domain, locales, markets, locations, product catalog
            (titles, descriptions, SEO fields), and shop metafields needed for optimization.
          </li>
          <li>
            <strong>App usage data:</strong> optimization snapshots, entity profile drafts, and billing status
            stored in our database to provide rollback and subscription features.
          </li>
          <li>
            <strong>Staff session data:</strong> OAuth access tokens and staff profile fields provided by Shopify
            during app installation (name, email) for authentication only.
          </li>
        </ul>
        <p>
          PredictaCore does <strong>not</strong> collect or store customer personal information (names, emails,
          addresses, or order history of store customers).
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>How we use data</h2>
        <ul>
          <li>Analyze catalog and generate SEO / Schema.org recommendations</li>
          <li>Apply approved changes to products and shop metafields</li>
          <li>Provide rollback from optimization backups</li>
          <li>Process subscription billing through Shopify Billing API</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>Third-party services</h2>
        <p>
          We use Google Gemini API to generate optimization suggestions. Product and shop context sent to Gemini
          is limited to catalog and SEO fields required for the feature. We do not send customer PII to third
          parties.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>Data retention and deletion</h2>
        <ul>
          <li>When you uninstall the app, we delete your shop&apos;s sessions and stored app data.</li>
          <li>
            Shopify may send a <code>shop/redact</code> webhook 48 hours after uninstall; we purge all remaining
            shop data at that time.
          </li>
          <li>We respond to GDPR data requests within 30 days as required by Shopify.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>Your rights</h2>
        <p>
          Merchants can request access to or deletion of data by contacting us or through Shopify&apos;s GDPR
          tools. Because we do not store end-customer data, customer redaction requests typically require no
          action from PredictaCore.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2>Contact</h2>
        <p>
          For privacy questions:{" "}
          <a href="mailto:privacy@predictaseo.com">privacy@predictaseo.com</a>
        </p>
      </section>
    </main>
  );
}
