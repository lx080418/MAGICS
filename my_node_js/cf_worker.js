import { Redis } from "@upstash/redis/cloudflare";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        const origin = request.headers.get("Origin") || "";
        const allowlist = new Set([
            "https://mathmagics.org",
            "https://www.mathmagics.org",
        ]);

        const cors = {
            "Access-Control-Allow-Origin": allowlist.has(origin) ? origin : "https://mathmagics.org",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-api-key",
            "Vary": "Origin",
        };

        if (request.method === "OPTIONS") return new Response(null, { headers: cors });

        // 不碰 Redis 的路由：永遠要能回 200
        if (url.pathname === "/") return new Response("MAGICS Worker OK", { headers: cors });
        if (url.pathname === "/healthz") return new Response("ok", { headers: cors });

        try {
            const redis = Redis.fromEnv(env);

            if (url.pathname === "/api/set" && request.method === "POST") {
                const { key, value, ttl } = await request.json();
                if (!key) return new Response("missing key", { status: 400, headers: cors });

                if (ttl) await redis.set(key, value, { ex: ttl });
                else await redis.set(key, value);

                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...cors, "Content-Type": "application/json" },
                });
            }

            if (url.pathname === "/api/get" && request.method === "GET") {
                const key = url.searchParams.get("key");
                const value = key ? await redis.get(key) : null;

                return new Response(JSON.stringify({ key, value }), {
                    headers: { ...cors, "Content-Type": "application/json" },
                });
            }

            return new Response("not found", { status: 404, headers: cors });
        } catch (e) {
            console.error(e);
            return new Response(`ERR: ${e?.stack || e}`, { status: 500, headers: cors });
        }
    },
};
