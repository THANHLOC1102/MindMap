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

// AN TOÀN TOÀN CỤC: nếu có lỗi bất ngờ không được try/catch bắt đúng chỗ (vd cố gắng trả
// response cho 1 kết nối trình duyệt đã tự ngắt giữa chừng vì chờ quá lâu), Node mặc định
// sẽ CRASH TOÀN BỘ server (không riêng gì request đang lỗi) — đây chính là nguyên nhân server
// bị "restart" đột ngột khi tìm Phân khúc quá đông kết quả (vd Nhà hàng). Bắt các lỗi này lại
// ở đây để CHỈ LOG ra console, KHÔNG làm sập toàn bộ server, các request khác vẫn tiếp tục
// hoạt động bình thường.
process.on("uncaughtException", (err) => {
  console.error("[Server] ⚠️ Lỗi không được bắt (uncaughtException) — server VẪN tiếp tục chạy:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Server] ⚠️ Promise bị reject không được bắt (unhandledRejection) — server VẪN tiếp tục chạy:", reason);
});

app.use(cors());
// Mặc định express.json() chỉ nhận body TỐI ĐA 100KB — quá nhỏ so với danh sách vài trăm
// doanh nghiệp (mỗi doanh nghiệp có tên/địa chỉ/website...) gửi lên khi "Xác nhận & lưu" hay
// "Xuất Excel" cho 1 Phân khúc đông đúc (vd Nhà hàng, quét đầy đủ nhiều phường). Vượt 100KB,
// Express từ chối với lỗi "PayloadTooLargeError" (không phải JSON) -> client cố res.json()
// bị lỗi parse. Nới lên 25MB cho thoải mái.
app.use(express.json({ limit: "25mb" }));

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
  const server = app.listen(PORT, () => {
    console.log(`Lado B2B Data Finder server đang chạy tại http://localhost:${PORT}`);
  });
  // Tìm kiếm ở khu vực rất đông đúc (vd Phân khúc Nhà hàng ở cả 1 quận lớn) có thể mất
  // hơn 2 phút do phải gọi Vietmap nhiều lần (giới hạn tốc độ 200 request/phút). Nới thời
  // gian chờ mặc định của Node lên 5 phút để không tự ngắt giữa chừng những request hợp lệ
  // nhưng chạy lâu.
  server.requestTimeout = 5 * 60 * 1000;
  server.headersTimeout = 5 * 60 * 1000 + 5000;
}

start().catch((err) => {
  console.error("Không thể khởi động server:", err);
  process.exit(1);
});