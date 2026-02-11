import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();

// 允许 x-www-form-urlencoded（contact form）+ JSON（如果你未来改 fetch）
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.get("/health", (req, res) => res.send("ok-20260211"));



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

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// volunteer: multipart/form-data（支持 photo 但先不存，优先用 imageUrl）
app.post("/api/google-form/volunteer", upload.none(), async (req, res) => {
    try {
        const body = (req.body ?? {}) as Record<string, string>;

        const { fullName, preferredName, email, affiliation, imageUrl } = body;
        const roleRaw = (body as any).role;

        if (!fullName || !preferredName || !email) {
            return res.status(400).json({ ok: false, message: "Missing required fields" });
        }
        // 多选 role：允许 string 或数组
        const roles: string[] = Array.isArray(roleRaw)
            ? roleRaw
            : typeof roleRaw === "string" && roleRaw.trim()
                ? [roleRaw.trim()]
                : [];

        // 图片：先用 imageUrl；如果未来要支持 photo，需先上传到云拿 public URL
        const finalImageUrl = (imageUrl || "").trim();

        const form = new URLSearchParams();
        form.append(ENTRY.fullName, fullName || "");
        form.append(ENTRY.preferredName, preferredName || "");
        form.append(ENTRY.email, email || "");
        form.append(ENTRY.affiliation, affiliation || "");
        form.append(ENTRY.imageUrl, finalImageUrl);

        for (const r of roles) form.append(ENTRY.role, r);

        const resp = await fetch(FORM_RESPONSE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: form.toString(),
            redirect: "manual", // Google Form 经常 302
        });

        if (!(resp.ok || resp.status === 302)) {
            const text = await resp.text();
            return res.status(500).json({ ok: false, message: "Google Form submit failed", detail: text });
        }

        return res.json({ ok: true });
    } catch (e: any) {
        return res.status(500).json({ ok: false, message: e?.message || "server error" });
    }
});

// contact：先最小实现（你可以后续转发到另一份 form 或发邮件）
app.post("/api/contact", async (req, res) => {
    try {
        const { name, email, subject, message } = req.body as Record<string, string>;
        // TODO: 这里你可以：
        // 1) 转发到 Google Form（另一份表单）
        // 2) 发邮件（SendGrid/Resend）
        // 3) 入库
        return res.json({ ok: true, received: { name, email, subject, message } });
    } catch (e: any) {
        return res.status(500).json({ ok: false, message: e?.message || "server error" });
    }
});

// listen（Render 会注入 PORT）
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Server listening on ${port}`));
