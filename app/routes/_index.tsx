import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");

  // Shopify abre la app embebida desde el admin
  if (shop && embedded === "1") {
    return redirect(`/app?${url.searchParams.toString()}`);
  }

  // Visitantes directos a la URL pública → login OAuth (no /app suelto)
  return redirect("/auth/login");
};

export default function Index() {
  return null;
}
