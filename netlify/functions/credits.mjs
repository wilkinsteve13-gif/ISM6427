import { json, checkAccess, suno } from "../lib/suno.mjs";

export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;

  const result = await suno("/api/v1/generate/credit");
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ credits: result.data });
};

export const config = { path: "/api/credits" };
