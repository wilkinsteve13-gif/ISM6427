// Shared helpers for the Suno API proxy functions.
// The API key is read from the SUNO_API_KEY environment variable (set in Netlify),
// so it never reaches the browser or the repository.

export const SUNO_BASE = process.env.SUNO_API_BASE || "https://api.sunoapi.org";

const ERROR_MESSAGES = {
  400: "Invalid parameters.",
  401: "Unauthorized — check the SUNO_API_KEY setting in Netlify.",
  404: "Invalid request method or path.",
  405: "Rate limit exceeded. Try again shortly.",
  413: "Prompt or style is too long.",
  429: "Out of Suno credits. Top up at sunoapi.org.",
  430: "Too many requests. Wait a few seconds and retry.",
  455: "Suno API is under maintenance. Try again later.",
  500: "Suno server error. Try again.",
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Optional shared password: if APP_PASSWORD is set in Netlify, every request
// must send it in the x-app-password header. Stops strangers burning credits.
export function checkAccess(req) {
  const required = process.env.APP_PASSWORD;
  if (!required) return null;
  if (req.headers.get("x-app-password") === required) return null;
  return json({ error: "Password required.", needPassword: true }, 401);
}

export async function suno(path, { method = "GET", body } = {}) {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    return { ok: false, status: 500, error: "Server is missing SUNO_API_KEY. Add it in Netlify → Site configuration → Environment variables." };
  }
  let res;
  try {
    res = await fetch(`${SUNO_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return { ok: false, status: 502, error: `Could not reach Suno API: ${err.message}` };
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, status: 502, error: `Suno API returned a non-JSON response (HTTP ${res.status}).` };
  }

  // Suno returns HTTP 200 with its own `code` field; treat code !== 200 as an error.
  const code = payload?.code ?? res.status;
  if (code !== 200) {
    const status = code >= 400 && code < 600 ? code : 502;
    return { ok: false, status, error: payload?.msg || ERROR_MESSAGES[code] || `Suno API error ${code}.` };
  }
  return { ok: true, data: payload.data };
}

export function callbackUrl() {
  // callBackUrl is required by the API. We poll for results instead, so point it
  // at a no-op function on this site. Netlify sets URL automatically.
  const site = process.env.URL || "https://example.com";
  return `${site}/api/callback`;
}
