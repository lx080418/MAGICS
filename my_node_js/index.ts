import express, { Request, Response, NextFunction } from "express";
import cors, { CorsOptions } from "cors";
import multer from "multer";
import { MongoClient, ServerApiVersion, Collection } from "mongodb";

const app = express();

// ===== logger =====
app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log("INCOMING", req.method, req.url, "commit", process.env.RENDER_GIT_COMMIT);
    next();
});

// ===== CORS（你主要走 Worker，其實不靠它；保留方便直連測試）=====
const ALLOWED_ORIGINS = new Set([
    "https://mathmagics.org",
    "https://www.mathmagics.org",
    "http://localhost:63343",
    "http://localhost:63342",
    "http://localhost:5173",
    "http://localhost:3000",
]);

const corsOptions: CorsOptions = {
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        return cb(null, ALLOWED_ORIGINS.has(origin));
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

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

// ===== multer：memoryStorage（不落盤）=====
const upload = multer({ storage: multer.memoryStorage() });

// ===== MongoDB =====
type VolunteerDoc = {
    fullName: string;
    preferredName: string;
    email: string;      // 原始 email（顯示用）
    emailNorm: string;  // trim + lower（唯一鍵）
    affiliation: string;
    imageUrl: string;
    role: string;

    status: "reserved" | "submitted";
    createdAt: number;
    updatedAt: number;
    submittedAt?: number;
};

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "magics";
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || "volunteers";

let mongoClient: MongoClient | null = null;
let volunteersCol: Collection<VolunteerDoc> | null = null;

async function initMongo() {
    if (!MONGODB_URI) throw new Error("Missing env MONGODB_URI");

    mongoClient = new MongoClient(MONGODB_URI, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
    });

    await mongoClient.connect();
    volunteersCol = mongoClient.db(MONGODB_DB).collection<VolunteerDoc>(MONGODB_COLLECTION);

    // ✅ emailNorm 唯一：防止重複提交
    try {
        await volunteersCol.createIndex({ emailNorm: 1 }, { unique: true });
    } catch (e) {
        console.warn("createIndex(emailNorm unique) failed (maybe duplicates already exist):", e);
    }

    console.log("Mongo connected:", `${MONGODB_DB}.${MONGODB_COLLECTION}`);
}

// ===== Google Form entry mapping =====
// 你如果 entry id 跟這個不同，把這裡換成你自己的
const ENTRY = {
    fullName: "entry.2005620554",
    preferredName: "entry.1218979286",
    email: "entry.1065046570",
    affiliation: "entry.1045781291",
    imageUrl: "entry.1215194561",
    role: "entry.1437617207",
};

const FORM_RESPONSE_URL =
    process.env.GOOGLE_FORM_RESPONSE_URL ||
    "https://docs.google.com/forms/d/e/1FAIpQLSfCoJLQEFAw2JOR0f8LFCpG2mpCDIhIiPgftHjtDAKAzLpd5g/formResponse";

// 你前端 drop-down 有哪幾個 role，就跟這裡一致
const ALLOWED_ROLES = new Set(["General Volunteer", "Class Instructor", "Website Designer"]);

function normEmail(emailRaw: string) {
    return emailRaw.trim().toLowerCase();
}

// ===== routes =====
app.post("/api/google-form/volunteer", upload.none(), async (req: Request, res: Response) => {
    try {
        if (!volunteersCol) return res.status(503).json({ ok: false, error: "DB not ready" });

        const body = (req.body ?? {}) as Record<string, any>;
        const fullName = (body.fullName || "").toString().trim();
        const preferredName = (body.preferredName || "").toString().trim();
        const emailRaw = (body.email || "").toString().trim();
        const affiliation = (body.affiliation || "N/A").toString().trim() || "N/A";
        const imageUrl = (body.imageUrl || "N/A").toString().trim() || "N/A";
        const role = (body.role || "").toString().trim();

        if (!fullName || !preferredName || !emailRaw) {
            return res.status(400).json({ ok: false, error: "Missing required fields" });
        }
        if (!emailRaw.includes("@")) {
            return res.status(400).json({ ok: false, error: "Invalid email" });
        }
        if (!role) return res.status(400).json({ ok: false, error: "Role is required" });
        if (!ALLOWED_ROLES.has(role)) {
            return res.status(400).json({
                ok: false,
                error: "Invalid role",
                allowed: Array.from(ALLOWED_ROLES),
            });
        }

        const emailNorm = normEmail(emailRaw);
        const now = Date.now();

        // ✅ 0) 先「搶佔」email（原子 upsert）：已存在就直接 409（不再提交 Google Form）
        try {
            const r = await volunteersCol.updateOne(
                { emailNorm },
                {
                    $setOnInsert: {
                        fullName,
                        preferredName,
                        email: emailRaw,   // 存原始 email
                        emailNorm,         // 唯一鍵
                        affiliation,
                        imageUrl,
                        role,
                        status: "reserved",
                        createdAt: now,
                        updatedAt: now,
                    },
                },
                { upsert: true }
            );

            if (!r.upsertedCount) {
                return res.status(409).json({ ok: false, error: "This email has already been submitted; please do not submit it again." });
            }
        } catch (e: any) {
            if (e?.code === 11000) {
                return res.status(409).json({ ok: false, error: "This email has already been submitted; please do not submit it again." });
            }
            throw e;
        }

        // ✅ 1) submit to Google Form
        const form = new URLSearchParams();
        form.append(ENTRY.fullName, fullName);
        form.append(ENTRY.preferredName, preferredName);
        form.append(ENTRY.email, emailRaw);
        form.append(ENTRY.affiliation, affiliation);
        form.append(ENTRY.imageUrl, imageUrl);
        form.append(ENTRY.role, role);

        const resp = await fetch(FORM_RESPONSE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: form.toString(),
            redirect: "manual",
        });

        if (!(resp.ok || resp.status === 302)) {
            await volunteersCol.deleteOne({ emailNorm, status: "reserved" }).catch(() => {});
            const text = await resp.text().catch(() => "");
            return res.status(502).json({
                ok: false,
                error: "Google Form submit failed",
                status: resp.status,
                detailHead: text.slice(0, 300),
            });
        }

        // ✅ 2) finalize: 標記 submitted
        await volunteersCol.updateOne(
            { emailNorm },
            {
                $set: {
                    fullName,
                    preferredName,
                    email: emailRaw,
                    affiliation,
                    imageUrl,
                    role,
                    status: "submitted",
                    submittedAt: Date.now(),
                    updatedAt: Date.now(),
                },
            }
        );

        return res.json({ ok: true, status: 200, location: null });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ ok: false, error: e?.message || "server error" });
    }
});

// ===== listen =====
const port = Number(process.env.PORT || 3000);

async function start() {
    await initMongo();
    app.listen(port, () => console.log(`Server listening on ${port}`));
}

start().catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
});

process.on("SIGTERM", async () => {
    try {
        await mongoClient?.close();
    } catch {}
    process.exit(0);
});
process.on("SIGINT", async () => {
    try {
        await mongoClient?.close();
    } catch {}
    process.exit(0);
});
