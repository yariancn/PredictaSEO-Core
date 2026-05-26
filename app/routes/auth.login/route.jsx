import { useState } from "react";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { AppProvider, Button, Card, FormLayout, Page, Text, TextField } from "@shopify/polaris";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const errors = new URL(request.url).searchParams.get("errors");
  return json({ errors });
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const shop = formData.get("shop");
  return login(shop);
};

export default function Login() {
  const { errors } = useLoaderData();
  const [shop, setShop] = useState("");

  return (
    <Page>
      <Card>
        <Form method="post">
          <FormLayout>
            <Text as="h2" variant="headingMd">PredictaCore Login</Text>
            <TextField
              label="Dominio de la tienda"
              name="shop"
              value={shop}
              onChange={setShop}
              autoComplete="off"
              error={errors ? "Dominio no válido" : null}
            />
            <Button submit variant="primary">Entrar</Button>
          </FormLayout>
        </Form>
      </Card>
    </Page>
  );
}