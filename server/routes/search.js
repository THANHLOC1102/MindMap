import { Router } from "express";
import { loadMasterData, DATA_FILE_PATH } from "../lib/excelReader.js";
import { parseQuery } from "../lib/queryParser.js";
import { filterBusinesses, sortByDistrictOrder } from "../lib/filterEngine.js";
import { exportToExcel } from "../lib/excelExport.js";

const router = Router();
const OUTPUT_FILENAME = "DATA B2B LADO.xlsx";

// Cache Master Data trong bộ nhớ (nạp khi server khởi động, có thể reload thủ công)
let masterDataCache = [];

export async function initMasterDataCache() {
  masterDataCache = await loadMasterData();
  console.log(`[MasterData] Đã nạp ${masterDataCache.length} dòng dữ liệu.`);
  return masterDataCache;
}

router.get("/master-data/reload", async (req, res) => {
  try {
    await initMasterDataCache();
    res.json({ ok: true, total: masterDataCache.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/search — chỉ lọc Master Data, KHÔNG gọi Vietmap
// Body: { city?, districts?: string[], wards?: string[], segmentCode?, keywordText? }
// city/districts/wards do người dùng CHỌN từ dropdown (không gõ tự do).
// segmentCode (nếu có, chọn từ dropdown Phân khúc) ưu tiên hơn Phân khúc tự nhận diện từ keywordText.
router.post("/search", (req, res) => {
  try {
    const {
      city = "",
      districts = [],
      wardsByDistrict = {},
      segmentCode = "",
      keywordText = "",
    } = req.body;

    // Master Data chỉ cần match theo tên phường (soft match trên địa chỉ), nên gộp phẳng
    // toàn bộ phường đã chọn ở mọi quận lại — không cần phân biệt phường thuộc quận nào.
    const wards = Object.values(wardsByDistrict).flat();

    const parsedKeywords = parseQuery(keywordText);
    const filters = {
      city: city || null,
      districts,
      wards,
      segment: segmentCode || parsedKeywords.segment,
      keywords: parsedKeywords.keywords,
    };

    let results = filterBusinesses(masterDataCache, filters);
    results = sortByDistrictOrder(results, filters.districts);

    res.json({
      source: "master-data",
      filters,
      total: results.length,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/search/export — xuất kết quả (đã lọc/tìm được) ra file DATA B2B LADO.xlsx
router.post("/search/export", async (req, res) => {
  try {
    const { results = [] } = req.body;
    const buffer = await exportToExcel(results);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${OUTPUT_FILENAME}"`
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/master-data/download — tải nguyên file DATA B2B LADO.xlsx đang lưu trên server
// (bao gồm mọi doanh nghiệp mới đã được xác nhận qua /api/places/confirm),
// giữ nguyên toàn bộ 4 sheet gốc (Master Data, Contact Person, Sales Pipeline, Mã KH).
router.get("/master-data/download", (req, res) => {
  res.download(DATA_FILE_PATH, OUTPUT_FILENAME, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "Không tải được file DATA B2B LADO.xlsx" });
    }
  });
});

export function getMasterDataCache() {
  return masterDataCache;
}

export function setMasterDataCache(rows) {
  masterDataCache = rows;
}

export default router;
