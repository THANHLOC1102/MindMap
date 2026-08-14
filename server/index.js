import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import express from "express";
import cors from "cors";
import searchRouter, { initMasterDataCache } from "./routes/search.js";
import placesRouter from "./routes/places.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/api", searchRouter);
app.use("/api", placesRouter);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Phục vụ luôn frontend React đã build (client/dist), để gộp chung backend + frontend
// vào 1 Web Service DUY NHẤT trên Render (khỏi cần tạo Static Site riêng + cấu hình
// rewrite/CORS giữa 2 domain). Thư mục client/dist chỉ tồn tại SAU KHI đã chạy build
// frontend (xem hướng dẫn deploy) — nếu chưa build, server vẫn chạy bình thường, chỉ
// là truy cập "/" sẽ không có gì để hiển thị.
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));

  // Mọi route KHÔNG phải /api/* (vd truy cập trực tiếp 1 URL con của React Router nếu có)
  // đều trả về index.html, để React tự xử lý routing ở phía client.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
} else {
  console.warn(
    "[Server] Không tìm thấy client/dist — frontend chưa được build. " +
      "Server vẫn chạy bình thường cho các route /api/*."
  );
}

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