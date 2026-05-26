/**
 * Prueba local de GEMINI_API_KEY (no imprime la clave).
 * Uso: node --env-file=.env scripts/test-gemini.mjs
 */

const key = process.env.GEMINI_API_KEY;

if (!key || key.length < 10) {
  console.error("❌ GEMINI_API_KEY no encontrada.");
  console.error("   Añádela a .env y ejecuta: node --env-file=.env scripts/test-gemini.mjs");
  process.exit(1);
}

const models = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

async function tryModel(model) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
    encodeURIComponent(key);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Responde solo: OK" }] }],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, model, status: res.status, message: data?.error?.message };
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "(sin texto)";
  return { ok: true, model, text };
}

try {
  for (const model of models) {
    const result = await tryModel(model);
    if (result.ok) {
      console.log("✅ GEMINI_API_KEY vigente");
      console.log("   Modelo:", result.model);
      console.log("   Respuesta:", result.text);
      process.exit(0);
    }
    console.log(`   · ${model} → HTTP ${result.status}: ${result.message?.slice(0, 80)}`);
  }

  console.error("❌ Ningún modelo respondió. Revisa cuota o crea una clave nueva en aistudio.google.com/apikey");
  process.exit(1);
} catch (err) {
  console.error("❌ Error de red:", err.message);
  process.exit(1);
}
