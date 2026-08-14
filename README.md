# Lado B2B Data Finder — Master Data + Google Places

Web app tìm kiếm, lọc và bổ sung dữ liệu doanh nghiệp B2B, xây theo đúng spec
`AI_Agent_Spec_LadoB2B_MasterData_GoogleMaps.md`:

- **Không dùng Claude API / OpenAI API / AI trả phí** cho chức năng cốt lõi.
- Phân tích câu hỏi tìm kiếm bằng **JavaScript rule-based** (`server/lib/queryParser.js`).
- Nguồn dữ liệu chính: Sheet **"Master Data"** trong `DATA B2B LADO.xlsx`, đọc bằng `ExcelJS`.
- Tìm doanh nghiệp mới dùng **Vietmap Place API** (mặc định) — cần `VIETMAP_API_KEY`, chỉ gọi khi
  người dùng bấm "Tìm thêm". Có thể chuyển sang **Google Places API (New)** bằng
  `PLACES_PROVIDER=google` nếu bạn có billing account hợp lệ ngoài Việt Nam (Google Maps
  Platform hiện chặn billing account gắn ngân hàng/địa chỉ Việt Nam).
- Người dùng chọn **Phân khúc mong muốn** trước khi tìm (dropdown theo đúng bảng mã sheet
  "Mã KH", hoặc nhập tự do nếu loại hình không có trong bảng mã).

## Cấu trúc

```
lado-b2b-agent/
├── client/        # React (Vite) frontend
└── server/        # Node.js/Express backend
```

## Chạy local

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
# Mở .env: mặc định PLACES_PROVIDER=vietmap, điền VIETMAP_API_KEY=... (lấy tại maps.vietmap.vn)
npm start
```

Server chạy tại `http://localhost:4000`. Nếu KHÔNG điền key nhà cung cấp đang chọn, chức năng lọc
Master Data vẫn dùng bình thường — chỉ nút "Tìm thêm" sẽ báo lỗi thiếu key.

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Mở `http://localhost:5173`. Vite dev server đã cấu hình proxy `/api` → `http://localhost:4000`.

## Cách dùng: tìm theo Phân khúc mong muốn

1. Chọn **Phân khúc** ở dropdown đầu trang:
   - Một trong 12 phân khúc có sẵn (đúng sheet "Mã KH") → khi lưu, hệ thống tự gán đúng
     `Mã KH` (vd `HT014`) và cột `Phân khúc`.
   - Hoặc chọn "Khác..." và tự gõ loại hình (vd "phòng gym") nếu không có trong bảng mã →
     kết quả vẫn được thêm vào Master Data (sheet 1), nhưng cột `Mã KH` và `Phân khúc` **để
     trống** để bạn tự bổ sung sau.
2. Gõ thêm thành phố/quận/từ khóa (vd "quận 1, quận 3 TPHCM") ở ô tìm kiếm.
3. Bấm **"Tìm trong Master Data"** để lọc dữ liệu sẵn có (không tốn phí), hoặc
   **"Tìm thêm"** để tìm doanh nghiệp mới qua Vietmap (hoặc Google nếu đã cấu hình).
4. Với kết quả tìm được: kiểm tra rồi bấm **"Xác nhận & lưu vào Master Data"** — hệ thống ghi
   thẳng vào file `server/data/DATA B2B LADO.xlsx` (giữ nguyên các sheet Contact Person, Sales
   Pipeline, Mã KH) và tự tải file `DATA B2B LADO.xlsx` mới nhất về máy.
5. Có thể bấm **"Xuất Excel"** bất kỳ lúc nào để tải kết quả đang xem thành file
   `DATA B2B LADO.xlsx` (8 cột đúng cấu trúc Master Data).

## API chính

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/api/search` | Lọc Master Data theo query + Phân khúc (không gọi Google) |
| POST | `/api/search/export` | Xuất kết quả đang xem ra `DATA B2B LADO.xlsx` (8 cột) |
| GET  | `/api/places/segments` | Danh sách Phân khúc hợp lệ (sheet "Mã KH") cho dropdown |
| POST | `/api/places/search` | Tìm doanh nghiệp mới qua Vietmap/Google (tuỳ `PLACES_PROVIDER`), tự lọc trùng với Master Data |
| POST | `/api/places/confirm` | Cấp `Mã KH` (nếu Phân khúc hợp lệ) và ghi thẳng vào `DATA B2B LADO.xlsx` trên server |
| GET  | `/api/master-data/download` | Tải nguyên file `DATA B2B LADO.xlsx` hiện có trên server |
| GET  | `/api/places/status` | Kiểm tra đã cấu hình key cho nhà cung cấp đang chọn chưa |

## Định dạng Excel xuất ra

`server/lib/excelExport.js` xuất đúng 8 cột theo file mẫu:

```
Mã KH | Tên doanh nghiệp | Phân khúc | Loại hình | Thành phố | Địa chỉ | Sales PIC | Website
```

## Bảng mã Phân khúc

Cố định theo sheet "Mã KH" / spec (`server/lib/segmentCodes.js`), không tự tạo mã mới:
`HT, RS, RT, CP, BK, RE, EA, CB, SP, IN, WP, AL`.
Tìm phân khúc không có trong bảng này vẫn được, nhưng `Mã KH`/`Phân khúc` sẽ để trống.

## Deploy lên Render

Dùng `render.yaml` ở gốc repo — backend là Web Service (root: `server`), frontend là Static Site
(root: `client`). Cần thêm biến môi trường `GOOGLE_MAPS_API_KEY` cho backend trên Render.

> **Lưu ý:** ổ đĩa trên Render (gói free/Web Service mặc định) là **ephemeral** — file
> `DATA B2B LADO.xlsx` ghi trực tiếp trên server sẽ **mất khi redeploy**. Với dữ liệu quan trọng,
> nên định kỳ tải file về (`/api/master-data/download`) hoặc gắn Render Disk (persistent disk)
> vào thư mục `server/data`.

## Về nhà cung cấp tìm địa điểm

**Vietmap (mặc định, `PLACES_PROVIDER=vietmap`)**
- Dùng **Vietmap Autocomplete API v3** (`https://maps.vietmap.vn/api/autocomplete/v3`).
- Response KHÔNG có field website — cột Website sẽ để trống với kết quả từ Vietmap, bạn bổ
  sung thủ công sau nếu cần.
- Mỗi request tối đa trả về 10 kết quả (giới hạn của Vietmap).
- Key **chỉ đặt ở backend** (`server/.env`), không đưa vào frontend.

**Google Places (`PLACES_PROVIDER=google`)**
- Dùng **Places API (New) — Text Search** (`https://places.googleapis.com/v1/places:searchText`).
- ⚠️ Việt Nam hiện nằm trong danh sách "Prohibited Territories" của Google Maps Platform —
  billing account gắn ngân hàng/địa chỉ Việt Nam sẽ bị từ chối quyền dùng API (`403
  PERMISSION_DENIED`) dù cấu hình đúng mọi bước. Chỉ dùng được nếu bạn có billing account hợp lệ
  ngoài khu vực bị chặn.
- Field mask mặc định chỉ xin field thuộc gói "Basic" + `websiteUri` (gói "Contact", tính phí
  thêm) — tắt bằng `GOOGLE_INCLUDE_WEBSITE=false` nếu muốn tối ưu chi phí.

Dù dùng nhà cung cấp nào, không phải mọi kết quả đều được tự động thêm vào Master Data — luôn
qua bước kiểm tra trùng (`duplicateChecker.js`) và người dùng phải bấm "Xác nhận & lưu" trước.
