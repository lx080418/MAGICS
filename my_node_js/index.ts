import { volunteerTree } from "./RBT_DATA";
import express from "express";
import cors from "cors";
import multer from "multer";
const app = express();
app.use((req, _res, next) => {
    console.log("INCOMING", req.method, req.url, "commit", process.env.RENDER_GIT_COMMIT);
    next();
});
export default {
    async fetch(request: Request) {
        return new Response("OK");
    },
};

// 允许 x-www-form-urlencoded（contact form）+ JSON（如果你未来改 fetch）
console.log("MAGICS API BOOT ✅ commit:", process.env.RENDER_GIT_COMMIT || "unknown");
console.log("CWD:", process.cwd());
console.log("__dirname:", __dirname);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.get("/health-unique-20260211", (_req, res) => res.send("ok-unique-20260211"));
app.get("/healthz", (_req, res) => res.send("ok"));
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
app.get("/health", (_req, res) => res.status(200).send("ok")); // optional
app.get("/", (_req, res) => res.status(200).send("ok"));       // optional
app.get("/health-unique-20260211", (_req, res) => res.status(200).send("ok-unique-20260211"));



// CORS：先放宽，等你有前端正式域名再收紧
app.use(
    cors({
        origin: true,
        credentials: true,
    })
);

// multer：先用 memoryStorage（不落盘）
const upload = multer({ storage: multer.memoryStorage() });


// ===== Google Form entry mapping（你刚刚拿到的）=====
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
// 允许的 role（必须和 <option> 文本完全一致）
const ALLOWED_ROLES = new Set([
    "General Volunteer",
    "Class Instructor",
    "Website Designer",
]);

app.post("/api/google-form/volunteer", upload.none(), async (req, res) => {
    try {
        const body = (req.body ?? {}) as Record<string, string>;
        const { fullName, preferredName, email, affiliation, imageUrl, role } = body;

        if (!fullName || !preferredName || !email) {
            return res.status(400).json({ ok: false, message: "Missing required fields" });
        }

        if (!role) {
            return res.status(400).json({ ok: false, message: "Role is required" });
        }

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

        // ✅ 这两项：你可选其一策略
        // 策略A：如果你不想前端必传，就给默认值（避免 Google 因空值拒收）
        form.append(ENTRY.affiliation, affiliation || "N/A");
        form.append(ENTRY.imageUrl, imageUrl || "N/A");

        // 策略B：如果你要强制用户填写，把上面两行换成：
        // if (!affiliation) return res.status(400).json({ ok:false, message:"Affiliation is required" });
        // if (!imageUrl) return res.status(400).json({ ok:false, message:"ImageUrl is required" });
        // form.append(ENTRY.affiliation, affiliation);
        // form.append(ENTRY.imageUrl, imageUrl);

        form.append(ENTRY.role, role);

        const resp = await fetch(FORM_RESPONSE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: form.toString(),
            redirect: "manual",
        });


        if (!(resp.ok || resp.status === 302)) {
            const text = await resp.text();
            return res.status(502).json({ ok: false, message: "Google Form submit failed", status: resp.status, detailHead: text.slice(0, 500) });
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
//testing
app.get("/api/volunteers", (_req, res) => {
    res.json({ ok: true, data: volunteerTree.entries() });
});



// listen（Render 会注入 PORT）
const port = Number(process.env.PORT || 3000);
// DEBUG: list routes



app.listen(port, () => console.log(`Server listening on ${port}`));
