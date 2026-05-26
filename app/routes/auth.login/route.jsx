import { useState } from "react";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { Button, Card, FormLayout, Page, Text, TextField } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { login } from "../../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const errors = new URL(request.url).searchParams.get("errors");
  return json({ errors });
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const shop = formData.get("shop");
  return login(shop);
};

const shellStyle = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "28px 24px 40px",
  background: "linear-gradient(165deg, #0c0c14 0%, #12121c 50%, #0a0a10 100%)",
  color: "#e8e8ed",
  minHeight: "100vh",
};

export default function Login() {
  const { errors } = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");

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
          Entra con tu tienda Shopify para abrir el panel de análisis. El wizard premium vive dentro del admin de Shopify, no en esta URL pública.
        </p>
        <Page narrowWidth>
          <Card>
            <Form method="post">
              <FormLayout>
                <TextField
                  label="Dominio de la tienda"
                  name="shop"
                  value={shop}
                  onChange={setShop}
                  placeholder="tu-tienda.myshopify.com"
                  autoComplete="off"
                  helpText="Ejemplo: ai-entity-test-yarian-daelj76i.myshopify.com"
                  error={errors || actionData?.errors ? "Dominio no válido" : undefined}
                />
                <Button submit variant="primary">
                  Continuar con Shopify
                </Button>
              </FormLayout>
            </Form>
          </Card>
        </Page>
      </div>
    </div>
  );
}
