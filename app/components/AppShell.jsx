import { useEffect, useState } from "react";

const shellStyle = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "28px 24px 40px",
  background: "linear-gradient(165deg, #0c0c14 0%, #12121c 50%, #0a0a10 100%)",
  color: "#e8e8ed",
  minHeight: "100vh",
  maxWidth: "720px",
  margin: "0 auto",
};

export function LoadingShell({ title = "PredictaCore", message = "Loading your audit…" }) {
  return (
    <div style={shellStyle}>
      <p style={{ margin: 0, fontSize: "0.75rem", color: "#6366f1", fontWeight: 600, letterSpacing: "0.06em" }}>
        AI visibility audit
      </p>
      <h1 style={{ margin: "4px 0 24px 0", fontSize: "1.35rem", fontWeight: 700, color: "#fff" }}>{title}</h1>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "12px 0 8px" }}>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            border: "3px solid rgba(165,180,252,0.25)",
            borderTopColor: "#a5b4fc",
            animation: "predictacore-spin 0.85s linear infinite",
          }}
        />
        <p style={{ margin: 0, fontSize: "0.95rem", color: "#e8e8ef", fontWeight: 600, textAlign: "center" }}>
          {message}
        </p>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "#8b8b9a", textAlign: "center", lineHeight: 1.5 }}>
          Read-only scan — nothing on your store is modified yet.
        </p>
      </div>
      <style>{`
        @keyframes predictacore-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function ClientShell({ children, fallback = <LoadingShell /> }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return fallback;
  return children;
}
