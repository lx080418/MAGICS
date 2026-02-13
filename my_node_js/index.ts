import express, { Request, Response, NextFunction } from "express";
import cors, { CorsOptions } from "cors";
import multer from "multer";
import { MongoClient, ServerApiVersion, Collection } from "mongodb";

const app = express();

// ===== logger（放最上面）=====
app.use((req: Request, _res: Response, next: NextFunction) => {
    const p = req.path; // 不含 query
    if (req.method === "HEAD") return next();
    if (p === "/" || p === "/health" || p === "/healthz" || p.startsWith("/health-")) return next();

    console.log("INCOMING", req.method, req.url, "commit", process.env.RENDER_GIT_COMMIT);
    next();
});


// ===== CORS（一定要在所有 routes 之前）=====
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
        if (!origin) return cb(null, true); // curl/postman 沒有 Origin
        return cb(null, ALLOWED_ORIGINS.has(origin));
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // preflight

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

// ===== MongoDB =====
type VolunteerDoc = {
    fullName: string;
    preferredName: string;
    email: string; // normalized lower-case
    affiliation: string;
    imageUrl: string;
    role: string;
    createdAt: number;
    updatedAt: number;
};

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "magics";
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || "volunteers";

let mongoClient: MongoClient | null = null;
let volunteersCol: Collection<VolunteerDoc> | null = null;

async function initMongo() {
    if (!MONGODB_URI) throw new Error("Missing env MONGODB_URI");

    mongoClient = new MongoClient(MONGODB_URI, {
        serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    });

    await mongoClient.connect();
    volunteersCol = mongoClient.db(MONGODB_DB).collection<VolunteerDoc>(MONGODB_COLLECTION);

    // 讓 email 唯一（避免重複資料）
    await volunteersCol.createIndex({ email: 1 }, { unique: true });

    console.log("Mongo connected:", `${MONGODB_DB}.${MONGODB_COLLECTION}`);
}

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

// ===== routes =====
app.post("/api/google-form/volunteer", upload.none(), async (req: Request, res: Response) => {
    try {
        if (!volunteersCol) return res.status(503).json({ ok: false, message: "DB not ready" });

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

        // 1) submit to Google Form
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

        // 2) save to MongoDB
        const normEmail = email.trim().toLowerCase();
        const now = Date.now();

        await volunteersCol.updateOne(
            { email: normEmail },
            {
                $set: {
                    fullName,
                    preferredName,
                    email: normEmail,
                    affiliation: affiliation || "N/A",
                    imageUrl: imageUrl || "N/A",
                    role,
                    updatedAt: now,
                },
                $setOnInsert: { createdAt: now },
            },
            { upsert: true }
        );

        return res.json({ ok: true, status: 200, location: null });
    } catch (e: any) {
        return res.status(500).json({ ok: false, message: e?.message || "server error" });
    }
});

// testing
app.get("/api/volunteers", async (_req: Request, res: Response) => {
    try {
        if (!volunteersCol) return res.status(503).json({ ok: false, message: "DB not ready" });

        const data = await volunteersCol
            .find({}, { projection: { _id: 0 } })
            .sort({ createdAt: -1 })
            .limit(500)
            .toArray();

        return res.json({ ok: true, data });
    } catch (e: any) {
        return res.status(500).json({ ok: false, message: e?.message || "server error" });
    }
});

// ===== listen（Render 會注入 PORT）=====
const port = Number(process.env.PORT || 3000);

async function start() {
    await initMongo();

    app.listen(port, () => console.log(`Server listening on ${port}`));
}
//
start().catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
});

// optional graceful shutdown
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
