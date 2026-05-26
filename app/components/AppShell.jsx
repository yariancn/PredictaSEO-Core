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
      <h1 style={{ margin: "4px 0 16px 0", fontSize: "1.35rem", fontWeight: 700, color: "#fff" }}>{title}</h1>
      <div
        style={{
          height: "3px",
          borderRadius: "2px",
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: "40%",
            background: "linear-gradient(90deg, #6366f1, #a5b4fc)",
            animation: "predictacore-pulse 1.2s ease-in-out infinite",
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: "0.9rem", color: "#8b8b9a" }}>{message}</p>
      <style>{`
        @keyframes predictacore-pulse {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
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
