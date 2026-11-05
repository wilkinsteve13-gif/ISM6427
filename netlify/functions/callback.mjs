// No-op receiver for Suno's required callBackUrl. The app polls /api/status
// for results, so this only needs to acknowledge the POST quickly.
export default async () => new Response("ok", { status: 200 });

export const config = { path: "/api/callback" };
