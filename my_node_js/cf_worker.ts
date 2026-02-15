/// <reference lib="webworker" />
/// <reference types="@cloudflare/workers-types" />

type Env = {
    WORKER_GATE_KEY: string;
    NODE_ORIGIN: string;     // e.g. https://xxx-node.onrender.com
    SPRING_ORIGIN: string;   // e.g. https://xxx-spring.onrender.com
    RATE_LIMITER: DurableObjectNamespace;
};

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get("Origin") || "*";

        // CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                    "Access-Control-Allow-Headers":
                        request.headers.get("Access-Control-Request-Headers") || "*",
                    "Access-Control-Allow-Credentials": "true",
                },
            });
        }

        // ========== ✅ 第一層：IP 限流（只針對 volunteer 的 POST） ==========
        const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
        const isVolunteerPost =
            request.method === "POST" &&
            url.pathname.includes("/google-form/volunteer");

        if (isVolunteerPost) {
            // ✅ key 只用 IP（不帶 path）
            const id = env.RATE_LIMITER.idFromName(ip);
            const stub = env.RATE_LIMITER.get(id);

            // 規則 1：60 秒最多 10 次
            const r1 = await stub.fetch("https://rl/check", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ windowSec: 60, limit: 10, key: ip }),
            });
            if (!r1.ok) return new Response("Too Many Requests", { status: 429 });

            // 規則 2：10 分鐘最多 20 次（可選，建議保留）
            const r2 = await stub.fetch("https://rl/check", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ windowSec: 600, limit: 20, key: ip }),
            });
            if (!r2.ok) return new Response("Too Many Requests", { status: 429 });
        }
        // ========== ✅ 第一層結束 ==========

        // 路由：/api/node/* -> Node，/api/java/* -> Spring
        let targetOrigin: string | null = null;
        let newPath = url.pathname;

        if (url.pathname.startsWith("/api/node/")) {
            targetOrigin = env.NODE_ORIGIN;
            newPath = url.pathname.replace("/api/node", "");
        } else if (url.pathname.startsWith("/api/java/")) {
            targetOrigin = env.SPRING_ORIGIN;
            newPath = url.pathname.replace("/api/java", "");
        } else {
            return new Response("Not Found", { status: 404 });
        }

        if (!targetOrigin) return new Response("Missing target origin", { status: 500 });

        const targetUrl = new URL(targetOrigin);
        const proxyUrl = new URL(request.url);
        proxyUrl.protocol = targetUrl.protocol;
        proxyUrl.host = targetUrl.host;
        proxyUrl.pathname = newPath;

        // 轉發（保留 method/body/headers）
        const cloned = request.clone();
        const upstreamHeaders = new Headers(cloned.headers);

        // 可選：給後端做 gate（後端若沒用到也不影響）
        if (env.WORKER_GATE_KEY) upstreamHeaders.set("x-worker-key", env.WORKER_GATE_KEY);

        const method = cloned.method.toUpperCase();
        const upstreamReq = new Request(proxyUrl.toString(), {
            method,
            headers: upstreamHeaders,
            body: method === "GET" || method === "HEAD" ? undefined : cloned.body,
            redirect: "manual",
        });

        const resp = await fetch(upstreamReq);

        // 回傳時加 CORS（給前端用）
        const headers = new Headers(resp.headers);
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Credentials", "true");

        return new Response(resp.body, { status: resp.status, headers });
    },
};

export class RateLimiterDO {
    state: DurableObjectState;

    constructor(state: DurableObjectState) {
        this.state = state;
    }

    async fetch(req: Request): Promise<Response> {
        const body = (await req.json()) as { windowSec: number; limit: number; key: string };

        const windowSec = body.windowSec;
        const limit = body.limit;
        const key = body.key;

        if (!windowSec || !limit || !key) {
            return new Response("Bad Request", { status: 400 });
        }

        const now = Date.now();
        const storageKey = `${key}:${windowSec}`;

        let rec =
            (await this.state.storage.get<{ count: number; resetAt: number }>(storageKey)) ??
            { count: 0, resetAt: now + windowSec * 1000 };

        if (now > rec.resetAt) rec = { count: 0, resetAt: now + windowSec * 1000 };

        rec.count++;
        // ✅ 加 TTL，避免 storage 長期累積
        await this.state.storage.put(storageKey, rec);


        if (rec.count > limit) return new Response("Too Many Requests", { status: 429 });
        return new Response("OK", { status: 200 });
    }
}
