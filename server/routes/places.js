import { Router } from "express";
import { parseQuery } from "../lib/queryParser.js";
import { searchPlaces, isPlacesConfigured, getAttribution, getProviderName } from "../lib/placesProvider.js";
import { sortByDistrictOrder } from "../lib/filterEngine.js";
import { dedupeAgainstMasterData } from "../lib/duplicateChecker.js";
import { SEGMENT_CODES, SEGMENT_SEARCH_LABEL, isValidSegmentCode } from "../lib/segmentCodes.js";
import { generateNextCode, appendRowsToMasterData } from "../lib/excelReader.js";
import { loadLocations } from "../lib/locations.js";
import { getMasterDataCache, setMasterDataCache } from "./search.js";

const router = Router();

router.get("/places/status", (req, res) => {
  res.json({ configured: isPlacesConfigured(), provider: getProviderName() });
});

// Danh sách Phân khúc hợp lệ (đúng sheet "Mã KH") để frontend dựng dropdown
router.get("/places/segments", (req, res) => {
  res.json({ segments: SEGMENT_CODES });
});

// Dữ liệu Thành phố -> Quận/Huyện -> Phường/Xã để frontend dựng dropdown chọn bắt buộc
// (không cho người dùng gõ tự do địa điểm nữa, tránh sai tên/thiếu dấu)
router.get("/places/locations", (req, res) => {
  res.json({ locations: loadLocations() });
});

/**
 * Xác định Phân khúc cần tìm cho request Google Places.
 * Ưu tiên:
 *  1. `segmentCode` người dùng chọn từ dropdown, nếu khớp bảng mã sheet "Mã KH" -> dùng đúng mã đó.
 *  2. `customSegment` người dùng tự gõ (loại hình KHÔNG có trong bảng mã) -> code = null.
 *  3. Phân khúc nhận diện được từ câu query tự nhiên (rule-based, theo SEGMENT_KEYWORDS).
 *  4. Không nhận diện được -> code = null, dùng phần văn bản còn lại của query làm từ khóa tìm.
 * Khi code = null: kết quả VẪN được xếp vào Master Data (sheet 1) nhưng để TRỐNG
 * cột Phân khúc và Mã KH, theo đúng yêu cầu — không tự ý gán CP hay mã nào khác.
 */
function resolveSegment({ segmentCode, customSegment, parsed }) {
  if (segmentCode && isValidSegmentCode(segmentCode)) {
    return {
      code: segmentCode,
      label: SEGMENT_CODES[segmentCode],
      segmentText: SEGMENT_SEARCH_LABEL[segmentCode],
    };
  }
  if (customSegment && customSegment.trim()) {
    return { code: null, label: null, segmentText: customSegment.trim() };
  }
  if (parsed.segment) {
    return {
      code: parsed.segment,
      label: SEGMENT_CODES[parsed.segment],
      segmentText: SEGMENT_SEARCH_LABEL[parsed.segment],
    };
  }
  return { code: null, label: null, segmentText: parsed.freeSegmentText || parsed.rawQuery };
}

// POST /api/places/search — CHỈ gọi khi người dùng chọn "Tìm thêm (địa điểm mới)"
// Body: { city, districts: string[], wards: string[], segmentCode?, customSegment?, keywordText? }
// city/districts/wards do người dùng CHỌN từ dropdown (không gõ tự do) -> đảm bảo đúng tên hành chính.
router.post("/places/search", async (req, res) => {
  try {
    const {
      city = "",
      districts = [],
      wardsByDistrict = {},
      segmentCode = "",
      customSegment = "",
      keywordText = "",
    } = req.body;

    if (!city) {
      return res.status(400).json({ error: "Vui lòng chọn Thành phố." });
    }
    if (!districts.length) {
      return res.status(400).json({ error: "Vui lòng chọn ít nhất 1 Quận/Huyện." });
    }

    const parsed = parseQuery(keywordText);
    const resolved = resolveSegment({ segmentCode, customSegment, parsed });
    const masterRows = getMasterDataCache();

    const candidates = await searchPlaces({
      city,
      districts,
      wardsByDistrict,
      keywords: parsed.keywords,
      segmentText: resolved.segmentText,
      rawQuery: keywordText,
    });
    const { uniqueNew, duplicates } = dedupeAgainstMasterData(candidates, masterRows);

    let proposed = uniqueNew.map((item) => ({
      maKH: null,
      suggestedSegmentCode: resolved.code, // null nếu Phân khúc không có trong bảng mã
      segmentLabel: resolved.label || "", // để trống nếu không thuộc bảng mã
      tenDoanhNghiep: item.name,
      loaiHinh: "",
      thanhPho: item.city || "",
      diaChi: item.address,
      salesPIC: "",
      website: item.website || "",
      placeId: item.placeId,
      needsReview: !resolved.code, // đánh dấu để người dùng kiểm tra nếu chưa có mã Phân khúc
    }));

    // Sắp xếp ĐÚNG theo thứ tự quận người dùng chọn (quận chọn trước hiện trước),
    // không tự sắp tăng/giảm dần.
    proposed = sortByDistrictOrder(proposed, districts);

    // Gán TRƯỚC Mã KH theo đúng thứ tự hiển thị ở trên (chỉ khi Phân khúc có trong bảng mã) —
    // để người dùng thấy mã ngay khi xem/xuất Excel, không phải đợi tới lúc "Xác nhận & lưu".
    // Mã CHÍNH THỨC vẫn được cấp lại (đảm bảo không trùng) tại bước /places/confirm bên dưới,
    // vì Master Data có thể đã thay đổi kể từ lúc xem trước.
    if (resolved.code) {
      let previewSeq = generateNextCode(masterRows, resolved.code);
      for (const p of proposed) {
        p.maKH = previewSeq;
        p.phanKhuc = resolved.label;
        previewSeq = generateNextCode([...masterRows, { maKH: previewSeq }], resolved.code);
      }
    }

    res.json({
      source: getProviderName(),
      attribution: getAttribution(),
      resolvedSegment: resolved,
      total: proposed.length,
      newBusinesses: proposed,
      duplicatesSkipped: duplicates.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/places/confirm — người dùng xác nhận thêm doanh nghiệp mới.
// Nếu suggestedSegmentCode hợp lệ (có trong bảng mã sheet "Mã KH") -> cấp Mã KH đúng mã đó.
// Nếu không (Phân khúc tự do, không có trong bảng mã) -> Mã KH và Phân khúc để TRỐNG.
// Đồng thời ghi thẳng vào file DATA B2B LADO.xlsx (sheet Master Data) trên server.
router.post("/places/confirm", async (req, res) => {
  try {
    const { items = [] } = req.body;
    const masterRows = getMasterDataCache();
    const confirmed = [];

    for (const item of items) {
      const code = item.suggestedSegmentCode;
      const hasValidCode = code && isValidSegmentCode(code);

      if (code && !hasValidCode) {
        return res.status(400).json({ error: `Mã Phân khúc không hợp lệ: ${code}` });
      }

      const maKH = hasValidCode ? generateNextCode([...masterRows, ...confirmed], code) : "";

      confirmed.push({
        maKH,
        tenDoanhNghiep: item.tenDoanhNghiep,
        phanKhuc: hasValidCode ? SEGMENT_CODES[code] : "",
        loaiHinh: item.loaiHinh || "",
        thanhPho: item.thanhPho || "",
        diaChi: item.diaChi || "",
        salesPIC: item.salesPIC || "",
        website: item.website || "",
      });
    }

    const updatedRows = await appendRowsToMasterData(confirmed);
    setMasterDataCache(updatedRows);

    res.json({ confirmed, total: updatedRows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
