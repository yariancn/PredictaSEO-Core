/** Auth for predictacore.ai → Pam pilot internal APIs (same secret as META_CRON_SECRET on ads). */
export function resolvePilotInternalSecret() {
  return (
    process.env.PILOT_INTERNAL_SECRET?.trim() ||
    process.env.PREDICTACORE_ADS_INTERNAL_SECRET?.trim() ||
    process.env.META_CRON_SECRET?.trim() ||
    ""
  );
}

export function assertPilotInternalRequest(request) {
  const secret = resolvePilotInternalSecret();
  if (!secret) return;

  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key")?.trim();
  const headerKey =
    request.headers.get("x-pilot-internal-secret")?.trim() ||
    request.headers.get("x-predictacore-internal-secret")?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (queryKey === secret || headerKey === secret || bearer === secret) return;

  throw new Response(JSON.stringify({ error: "No autorizado" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
