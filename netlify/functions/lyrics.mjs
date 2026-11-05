import { json, checkAccess, suno, callbackUrl } from "../lib/suno.mjs";

// POST /api/lyrics  { prompt }      -> { taskId }
// GET  /api/lyrics?taskId=...       -> { status, lyrics: [{ title, text }] }
export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;

  if (req.method === "POST") {
    let input;
    try {
      input = await req.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }
    const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 200) : "";
    if (!prompt) return json({ error: "Describe what the lyrics should be about." }, 400);

    const result = await suno("/api/v1/lyrics", {
      method: "POST",
      body: { prompt, callBackUrl: callbackUrl() },
    });
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ taskId: result.data?.taskId });
  }

  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{4,100}$/.test(taskId)) return json({ error: "Missing or invalid taskId." }, 400);

  const result = await suno(`/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!result.ok) return json({ error: result.error }, result.status);

  const d = result.data || {};
  const items = d.response?.data || d.response?.lyricsData || [];
  const lyrics = items
    .filter((i) => i && i.text && i.status !== "failed")
    .map((i) => ({ title: i.title || "", text: i.text }));
  return json({ status: d.status || "PENDING", errorMessage: d.errorMessage || null, lyrics });
};

export const config = { path: "/api/lyrics" };
