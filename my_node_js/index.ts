import express, { Request, Response } from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req: Request, res: Response) => res.status(200).send("ok"));
app.get("/healthz", (_req: Request, res: Response) => res.status(200).send("ok"));

const port = Number(process.env.PORT) || 10000;
app.listen(port, () => console.log("listening on", port));
