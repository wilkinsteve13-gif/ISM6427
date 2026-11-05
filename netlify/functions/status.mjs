import { json, checkAccess, suno } from "../lib/suno.mjs";

// Normalize a track from either snake_case or camelCase API responses.
function track(t) {
  return {
    id: t.id,
    title: t.title || "Untitled",
    tags: t.tags || "",
    duration: t.duration || null,
    audioUrl: t.audio_url || t.audioUrl || "",
    streamUrl: t.stream_audio_url || t.streamAudioUrl || "",
    imageUrl: t.image_url || t.imageUrl || "",
    lyrics: t.prompt || "",
  };
}

export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;

  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{4,100}$/.test(taskId)) return json({ error: "Missing or invalid taskId." }, 400);

  const result = await suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  if (!result.ok) return json({ error: result.error }, result.status);

  const d = result.data || {};
  const tracks = (d.response?.sunoData || []).map(track);
  return json({
    taskId,
    status: d.status || "PENDING",
    errorMessage: d.errorMessage || null,
    tracks,
  });
};

export const config = { path: "/api/status" };
