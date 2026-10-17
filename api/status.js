// Vercel serverless endpoint: /api/status
//
// This endpoint intentionally does not claim the bot is online just because
// DISCORD_TOKEN is configured. A serverless function cannot keep a Discord
// Gateway connection alive between requests. It reads a trusted live snapshot
// from JOINLY_STATUS_ENDPOINT, which your running bot/service should publish.
//
// Configure in Vercel:
//   JOINLY_STATUS_ENDPOINT = URL returning the JSON schema shown in README.md
//   JOINLY_STATUS_SECRET   = shared secret used by your status feed (optional)
//
// DISCORD_TOKEN remains server-side and must never be sent to the browser.

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ message: "Method not allowed." });
  }

  const endpoint = process.env.JOINLY_STATUS_ENDPOINT;
  if (!endpoint) {
    return res.status(503).json({
      message: "Live status feed is not configured yet. Set JOINLY_STATUS_ENDPOINT in Vercel and connect the running bot to publish its gateway metrics."
    });
  }

  try {
    const headers = { Accept: "application/json" };
    if (process.env.JOINLY_STATUS_SECRET) {
      headers.Authorization = `Bearer ${process.env.JOINLY_STATUS_SECRET}`;
    }

    const upstream = await fetch(endpoint, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
      cache: "no-store"
    });

    if (!upstream.ok) {
      return res.status(502).json({ message: "The live status provider is currently unavailable." });
    }

    const data = await upstream.json();
    if (!data || !Array.isArray(data.shards) || !Number.isFinite(Number(data.guildCount))) {
      return res.status(502).json({ message: "The live status provider returned invalid metrics." });
    }

    return res.status(200).json({
      botName: typeof data.botName === "string" ? data.botName : "Joinly",
      botOnline: Boolean(data.botOnline),
      guildCount: Number(data.guildCount),
      totalShards: Number.isFinite(Number(data.totalShards)) ? Number(data.totalShards) : 1,
      shards: data.shards.map((shard, index) => ({
        id: Number.isFinite(Number(shard.id)) ? Number(shard.id) : index + 1,
        status: ["idle", "connecting", "connected", "ready", "stopping", "stopped"].includes(String(shard.status).toLowerCase())
          ? String(shard.status).toLowerCase()
          : "stopped",
        guildCount: Number(shard.guildCount) || 0,
        averageLatencyMs: Number.isFinite(Number(shard.averageLatencyMs)) ? Number(shard.averageLatencyMs) : null,
        averageUptimeSeconds: Number.isFinite(Number(shard.averageUptimeSeconds)) ? Number(shard.averageUptimeSeconds) : null
      }))
    });
  } catch (error) {
    console.error("Joinly status endpoint error:", error);
    return res.status(502).json({ message: "Unable to retrieve live status at this time." });
  }
}