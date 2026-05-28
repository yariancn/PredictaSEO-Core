const shellStyle = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "28px 24px 40px",
  background: "linear-gradient(165deg, #0c0c14 0%, #12121c 50%, #0a0a10 100%)",
  color: "#e8e8ed",
  minHeight: "100vh",
  maxWidth: "720px",
  margin: "0 auto",
};

export function AppErrorShell({ title = "PredictaCore", message, hint, onRetry }) {
  return (
    <div style={shellStyle}>
      <p style={{ margin: 0, fontSize: "0.75rem", color: "#6366f1", fontWeight: 600, letterSpacing: "0.06em" }}>
        AI visibility audit
      </p>
      <h1 style={{ margin: "4px 0 12px 0", fontSize: "1.35rem", fontWeight: 700, color: "#fff" }}>{title}</h1>
      <p style={{ color: "#f87171", margin: "0 0 10px 0", fontSize: "0.92rem", lineHeight: 1.5 }}>{message}</p>
      {hint && (
        <p style={{ color: "#8b8b9a", fontSize: "0.85rem", margin: "0 0 16px 0", lineHeight: 1.5 }}>{hint}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: "12px 18px",
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function routeErrorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong loading PredictaCore";
}

export function routeErrorHint(error) {
  const status = error && typeof error === "object" && "status" in error ? error.status : null;
  if (status === 401 || status === 410) {
    return "Open PredictaCore from Shopify Admin → Apps, or reload this page. If billing failed, try again from step 4.";
  }
  return "Reload from Shopify Admin → Apps → PredictaCore.";
}
