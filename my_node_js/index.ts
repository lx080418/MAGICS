import { volunteerTree } from "./RBT_DATA";
import express, { Request, Response, NextFunction } from "express";
import cors, { CorsOptions } from "cors";
import multer from "multer";

const app = express();

// ===== logger（放最上面）=====
app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log("INCOMING", req.method, req.url, "commit", process.env.RENDER_GIT_COMMIT);
    next();
});

// ===== CORS（一定要在所有 routes 之前）=====
const ALLOWED_ORIGINS = new Set([
    "https://mathmagics.org",
    "https://www.mathmagics.org",
    // JetBrains 內建預覽（你目前就是這個來源）
    "http://localhost:63343",
    "http://localhost:63342",
    // 常見本機前端 dev server
    "http://localhost:5173",
    "http://localhost:3000",
]);

const corsOptions: CorsOptions = {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // curl/postman 沒有 Origin
        return cb(null, ALLOWED_ORIGINS.has(origin));
    },
    credentials: false, // 你這些 API 目前不需要 cookie/session，先用 false 最省事
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));// preflight

// ===== body parsers =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===== health =====
app.get("/", (_req: Request, res: Response) => res.status(200).send("ok"));
app.get("/health", (_req: Request, res: Response) => res.status(200).send("ok"));
app.get("/healthz", (_req: Request, res: Response) => res.status(200).send("ok"));
app.get("/health-unique-20260211", (_req: Request, res: Response) =>
    res.status(200).send("ok-unique-20260211")
);

// ===== multer：memoryStorage（不落盘）=====
const upload = multer({ storage: multer.memoryStorage() });

// ===== Google Form entry mapping =====
const ENTRY = {
    fullName: "entry.2005620554",
    preferredName: "entry.1218979286",
    email: "entry.1065046570",
    affiliation: "entry.1045781291",
    imageUrl: "entry.1215194561",
    role: "entry.1437617207",
};

const FORM_RESPONSE_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSfCoJLQEFAw2JOR0f8LFCpG2mpCDIhIiPgftHjtDAKAzLpd5g/formResponse";

const ALLOWED_ROLES = new Set(["General Volunteer", "Class Instructor", "Website Designer"]);

app.post("/api/google-form/volunteer", upload.none(), async (req: Request, res: Response) => {
    try {
        const body = (req.body ?? {}) as Record<string, string>;
        const { fullName, preferredName, email, affiliation, imageUrl, role } = body;

        if (!fullName || !preferredName || !email) {
            return res.status(400).json({ ok: false, message: "Missing required fields" });
        }
        if (!role) return res.status(400).json({ ok: false, message: "Role is required" });

        if (!ALLOWED_ROLES.has(role)) {
            return res.status(400).json({
                ok: false,
                message: "Invalid role",
                allowed: Array.from(ALLOWED_ROLES),
            });
        }

        const form = new URLSearchParams();
        form.append(ENTRY.fullName, fullName);
        form.append(ENTRY.preferredName, preferredName);
        form.append(ENTRY.email, email);
        form.append(ENTRY.affiliation, affiliation || "N/A");
        form.append(ENTRY.imageUrl, imageUrl || "N/A");
        form.append(ENTRY.role, role);

        const resp = await fetch(FORM_RESPONSE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: form.toString(),
            redirect: "manual",
        });

        if (!(resp.ok || resp.status === 302)) {
            const text = await resp.text();
            return res.status(502).json({
                ok: false,
                message: "Google Form submit failed",
                status: resp.status,
                detailHead: text.slice(0, 500),
            });
        }

        volunteerTree.set(email.trim().toLowerCase(), {
            fullName,
            preferredName,
            email,
            affiliation: affiliation || "N/A",
            imageUrl: imageUrl || "N/A",
            role,
            createdAt: Date.now(),
        });

        return res.json({ ok: true, status: 200, location: null });
    } catch (e: any) {
        return res.status(500).json({ ok: false, message: e?.message || "server error" });
    }
});

// testing
app.get("/api/volunteers", (_req: Request, res: Response) => {
    res.json({ ok: true, data: volunteerTree.entries() });
});

// ===== Redis Worker Proxy =====
const WORKER_BASE_URL = process.env.WORKER_BASE_URL || "https://magics-math.leeyang2077.workers.dev";
const MAGICS_API_KEY = process.env.MAGICS_API_KEY || "";

app.get("/api/redis/get", async (req: Request, res: Response) => {
    try {
        const key = String(req.query.key || "");
        if (!key) return res.status(400).json({ ok: false, message: "missing key" });

        const r = await fetch(`${WORKER_BASE_URL}/api/get?key=${encodeURIComponent(key)}`, {
            headers: { "x-api-key": MAGICS_API_KEY },
        });

        const text = await r.text();
        return res
            .status(r.status)
            .type(r.headers.get("content-type") || "application/json")
            .send(text);
    } catch (e: any) {
        return res.status(500).json({ ok: false, message: e?.message || "server error" });
    }
});

app.post("/api/redis/set", async (req: Request, res: Response) => {
    try {
        const { key, value, ttl } = (req.body || {}) as { key?: string; value?: any; ttl?: number };
        if (!key) return res.status(400).json({ ok: false, message: "missing key" });

        const r = await fetch(`${WORKER_BASE_URL}/api/set`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": MAGICS_API_KEY,
            },
            body: JSON.stringify({ key, value, ttl }),
        });

        const text = await r.text();
        return res
            .status(r.status)
            .type(r.headers.get("content-type") || "application/json")
            .send(text);
    } catch (e: any) {
        return res.status(500).json({ ok: false, message: e?.message || "server error" });
    }
});

// ===== listen（Render 會注入 PORT）=====
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Server listening on ${port}`));
