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

function SpinnerIndicator() {
  return (
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
  );
}

function BreathingIndicator() {
  return (
    <div style={{ position: "relative", width: "72px", height: "72px" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "2px solid rgba(163,230,53,0.35)",
          animation: "predictacore-breathe 2.2s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "10px",
          borderRadius: "50%",
          background: "rgba(99,102,241,0.2)",
          border: "2px solid rgba(165,180,252,0.55)",
          animation: "predictacore-breathe 2.2s ease-in-out infinite 0.35s",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "22px",
          borderRadius: "50%",
          background: "#6366f1",
          boxShadow: "0 0 24px rgba(99,102,241,0.45)",
        }}
      />
    </div>
  );
}

export function LoadingShell({
  title = "PredictaCore",
  message = "Loading your audit…",
  subtext = "",
  eyebrow = "AI visibility audit",
  mode = "audit",
}) {
  const isOptimize = mode === "optimize";

  return (
    <div style={shellStyle}>
      <p style={{ margin: 0, fontSize: "0.75rem", color: "#6366f1", fontWeight: 600, letterSpacing: "0.06em" }}>
        {eyebrow}
      </p>
      <h1 style={{ margin: "4px 0 24px 0", fontSize: "1.35rem", fontWeight: 700, color: "#fff" }}>{title}</h1>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "12px 0 8px" }}>
        {isOptimize ? <BreathingIndicator /> : <SpinnerIndicator />}
        <p style={{ margin: 0, fontSize: "0.95rem", color: isOptimize ? "#a3e635" : "#e8e8ef", fontWeight: 600, textAlign: "center" }}>
          {message}
        </p>
        {subtext ? (
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#8b8b9a", textAlign: "center", lineHeight: 1.5, maxWidth: "360px" }}>
            {subtext}
          </p>
        ) : null}
      </div>
      <style>{`
        @keyframes predictacore-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes predictacore-breathe {
          0%, 100% { transform: scale(0.92); opacity: 0.55; }
          50% { transform: scale(1.06); opacity: 1; }
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
