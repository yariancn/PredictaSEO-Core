import { useState } from "react";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }) => {
  const { login } = await import("../../shopify.server");
  const result = await login(request);
  if (result instanceof Response) return result;
  return json(loginErrorMessage(result));
};

export const action = async ({ request }) => {
  const { login } = await import("../../shopify.server");
  const result = await login(request);
  if (result instanceof Response) return result;
  return json(loginErrorMessage(result));
};

const shellStyle = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "28px 24px 40px",
  background: "linear-gradient(165deg, #0c0c14 0%, #12121c 50%, #0a0a10 100%)",
  color: "#e8e8ed",
  minHeight: "100vh",
};

export default function Login() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const hasErrors = actionData?.hasErrors || loaderData?.hasErrors;

  return (
    <div style={shellStyle}>
      <div style={{ maxWidth: "480px", margin: "0 auto" }}>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "#6366f1", fontWeight: 600, letterSpacing: "0.06em" }}>
          AI visibility audit
        </p>
        <h1 style={{ margin: "4px 0 8px 0", fontSize: "1.5rem", fontWeight: 700, color: "#fff" }}>
          PredictaCore
        </h1>
        <p style={{ margin: "0 0 24px 0", fontSize: "0.9rem", color: "#8b8b9a", lineHeight: 1.5 }}>
          Entra con tu tienda Shopify para abrir el panel de análisis premium.
        </p>

        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <Form method="post">
            <label htmlFor="shop" style={{ display: "block", fontSize: "0.85rem", marginBottom: "8px", color: "#c4c4d0" }}>
              Dominio de la tienda
            </label>
            <input
              id="shop"
              name="shop"
              value={shop}
              onChange={(event) => setShop(event.target.value)}
              placeholder="tu-tienda.myshopify.com"
              autoComplete="off"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "12px 14px",
                borderRadius: "8px",
                border: hasErrors ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.12)",
                background: "#0a0a10",
                color: "#fff",
                fontSize: "0.95rem",
                marginBottom: hasErrors ? "8px" : "16px",
              }}
            />
            {hasErrors ? (
              <p style={{ margin: "0 0 16px 0", color: "#fca5a5", fontSize: "0.85rem" }}>
                Dominio no válido. Usa el formato tu-tienda.myshopify.com
              </p>
            ) : (
              <p style={{ margin: "0 0 16px 0", color: "#6b6b7a", fontSize: "0.8rem" }}>
                Ejemplo: ai-entity-test-yarian-daelj76i.myshopify.com
              </p>
            )}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "none",
                background: "linear-gradient(90deg, #6366f1, #818cf8)",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: "pointer",
              }}
            >
              Continuar con Shopify
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
