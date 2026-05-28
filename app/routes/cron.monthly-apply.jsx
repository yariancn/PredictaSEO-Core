import { json } from "@remix-run/node";
import { runMonthlyApplyForAllShops } from "../lib/monthly-apply.server.js";

function authorizeCron(request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${secret}`;
}

/** Railway / external cron: POST or GET with Authorization: Bearer $CRON_SECRET */
export async function loader({ request }) {
  if (!authorizeCron(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runMonthlyApplyForAllShops();
  return json(summary);
}

export async function action({ request }) {
  return loader({ request });
}
