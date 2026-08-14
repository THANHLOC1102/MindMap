import "dotenv/config";
import express from "express";
import cors from "cors";
import searchRouter, { initMasterDataCache } from "./routes/search.js";
import placesRouter from "./routes/places.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/api", searchRouter);
app.use("/api", placesRouter);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

async function start() {
  await initMasterDataCache();
  app.listen(PORT, () => {
    console.log(`Lado B2B Data Finder server đang chạy tại http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Không thể khởi động server:", err);
  process.exit(1);
});
