export default {
    async fetch(request: Request, env: any): Promise<Response> {
        const url = new URL(request.url);

        // 你的兩個後端（建議用 wrangler secret/vars 注入）
        const NODE_ORIGIN = env.NODE_ORIGIN as string;     // e.g. https://xxx-node.onrender.com
        const SPRING_ORIGIN = env.SPRING_ORIGIN as string; // e.g. https://xxx-spring.onrender.com

        // CORS（可保留，方便你本機測試；上線同網域其實用不到）
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
                    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                    "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "*",
                    "Access-Control-Allow-Credentials": "true",
                },
            });
        }

        let targetOrigin: string | null = null;
        let newPath = url.pathname;

        // 路由規則：/api/node/* -> Node，/api/java/* -> Spring
        if (url.pathname.startsWith("/api/node/")) {
            targetOrigin = NODE_ORIGIN;
            newPath = url.pathname.replace("/api/node", "");
        } else if (url.pathname.startsWith("/api/java/")) {
            targetOrigin = SPRING_ORIGIN;
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
        const req = new Request(proxyUrl.toString(), request);

        const resp = await fetch(req);

        // 回傳時可加 CORS header（保險）
        const headers = new Headers(resp.headers);
        headers.set("Access-Control-Allow-Origin", request.headers.get("Origin") || "*");
        headers.set("Access-Control-Allow-Credentials", "true");

        return new Response(resp.body, {
            status: resp.status,
            headers,
        });
    },
};
