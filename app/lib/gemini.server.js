const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 45000;

export async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("AI service not configured");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=` +
    encodeURIComponent(key);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || `AI service error (${res.status})`);
  }

  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text?.trim() || "";
  const finishReason = candidate?.finishReason;

  if (finishReason === "MAX_TOKENS") {
    return `${text}\n\n_[Respuesta truncada por límite de tokens — pulsa Regenerar]_`;
  }

  return text;
}

export async function askGeminiWithTimeout(prompt, timeoutMs = GEMINI_TIMEOUT_MS) {
  const task = askGemini(prompt);
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`AI timeout ${timeoutMs / 1000}s`)), timeoutMs);
  });
  return Promise.race([task, timeout]);
}
