import { json, checkAccess, suno, callbackUrl } from "../lib/suno.mjs";

const MODELS = new Set(["V6", "V6_MINI", "V6_WILD"]);

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const denied = checkAccess(req);
  if (denied) return denied;

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const customMode = !!input.customMode;
  const instrumental = !!input.instrumental;
  const model = MODELS.has(input.model) ? input.model : "V6";

  const body = { customMode, instrumental, model, callBackUrl: callbackUrl() };

  if (customMode) {
    const title = clean(input.title, 80);
    const style = clean(input.style, 1000);
    const lyrics = instrumental ? "" : clean(input.lyrics, 5000);
    const negativeTags = clean(input.negativeTags, 1000);

    if (!style && !lyrics && !negativeTags) {
      return json({ error: "Add a style, lyrics, or styles to avoid." }, 400);
    }
    if (title) body.title = title;
    if (style) body.style = style;
    if (lyrics) body.lyrics = lyrics;
    if (negativeTags) body.negativeTags = negativeTags;
    if (!instrumental && (input.vocalGender === "m" || input.vocalGender === "f")) {
      body.vocalGender = input.vocalGender;
    }
    const duration = Number(input.duration);
    if (Number.isFinite(duration) && duration >= 10 && duration <= 360) {
      body.duration = Math.round(duration);
    }
  } else {
    const prompt = clean(input.prompt, 3000);
    const style = clean(input.style, 1000);
    if (!prompt && !style) {
      return json({ error: "Describe the song you want." }, 400);
    }
    if (prompt) body.prompt = prompt;
    if (style) body.style = style;
  }

  const result = await suno("/api/v1/generate", { method: "POST", body });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ taskId: result.data?.taskId });
};

export const config = { path: "/api/generate" };
