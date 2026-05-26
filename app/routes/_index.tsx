import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");

  // Shopify abre la app en "/" — redirigir al panel embebido con análisis real
  if (shop && embedded === "1") {
    return redirect(`/app?${url.searchParams.toString()}`);
  }

  return json({
    title: "PredictaCore — Inteligencia de Auditoría Forense",
    version: "TITÁN v22.0",
    client: "Regenoxy LLC",
  });
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: "monospace", padding: "40px", backgroundColor: "#050505", color: "#ffffff", minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid #d4af37", paddingBottom: "20px", marginBottom: "40px" }}>
        <h1 style={{ color: "#d4af37", margin: 0, fontSize: "2.2rem", letterSpacing: "1px" }}>{data.title}</h1>
        <p style={{ color: "#888", margin: "8px 0 0 0" }}>Capa Operativa Actualizada: {data.version} | {data.client}</p>
      </header>

      <div style={{ background: "#0c0c0c", border: "1px solid #d4af37", borderRadius: "4px", padding: "16px 20px", marginBottom: "28px" }}>
        <p style={{ color: "#aaa", margin: "0 0 12px 0", fontSize: "0.9rem" }}>
          Esta es la terminal pública. El análisis de tu tienda Shopify vive en el panel embebido.
        </p>
        <Link
          to="/app"
          style={{
            display: "inline-block",
            background: "#d4af37",
            color: "#050505",
            padding: "10px 18px",
            borderRadius: "4px",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: "0.9rem",
          }}
        >
          → Abrir Panel de Análisis [/app]
        </Link>
      </div>

      <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px" }}>
        <section style={{ background: "#0c0c0c", padding: "25px", borderRadius: "4px", border: "1px solid #1a1a1a" }}>
          <h3 style={{ color: "#d4af37", margin: "0 0 10px 0" }}>[01] DIAGNÓSTICO EJECUTIVO</h3>
          <p style={{ color: "#aaa", fontSize: "0.95rem", lineHeight: "1.5" }}>Análisis de fricciones operativas iniciales y rendimiento general de la conversión.</p>
        </section>

        <section style={{ background: "#0c0c0c", padding: "25px", borderRadius: "4px", border: "1px solid #1a1a1a" }}>
          <h3 style={{ color: "#d4af37", margin: "0 0 10px 0" }}>[02] MATRIZ DE RENDIMIENTO Y VIABILIDAD</h3>
          <p style={{ color: "#aaa", fontSize: "0.95rem", lineHeight: "1.5" }}>Evaluación transaccional con simetría exacta de oportunidades detectadas y acciones correctivas aplicables.</p>
        </section>

        <section style={{ background: "#0c0c0c", padding: "25px", borderRadius: "4px", border: "1px solid #1a1a1a" }}>
          <h3 style={{ color: "#d4af37", margin: "0 0 10px 0" }}>[03] BLOQUE FORENSE (GEMELOS DIGITALES)</h3>
          <p style={{ color: "#aaa", fontSize: "0.95rem", lineHeight: "1.5" }}>Modelado de comportamiento mediante perfiles psicológicos avanzados para identificar fugas de capital críticas.</p>
        </section>

        <section style={{ background: "#0c0c0c", padding: "25px", borderRadius: "4px", border: "1px solid #1a1a1a" }}>
          <h3 style={{ color: "#d4af37", margin: "0 0 10px 0" }}>[04] HOJA DE RUTA TÁCTICA</h3>
          <p style={{ color: "#aaa", fontSize: "0.95rem", lineHeight: "1.5" }}>Plan de acción optimizado mediante pulsos obligatorios estructurados hacia un veredicto de autoridad profesional.</p>
        </section>
      </main>

      <footer style={{ marginTop: "60px", textAlign: "center", color: "#444", fontSize: "0.85rem", borderTop: "1px solid #111", paddingTop: "20px" }}>
        Terminal Restringida — Desarrollo Seguro de PredictaCore
      </footer>
    </div>
  );
}
