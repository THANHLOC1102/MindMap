import { Router } from "express";
import { parseQuery } from "../lib/queryParser.js";
import { searchPlaces, isPlacesConfigured, getAttribution, getProviderName } from "../lib/placesProvider.js";
import { sortByDistrictOrder } from "../lib/filterEngine.js";
import { dedupeAgainstMasterData } from "../lib/duplicateChecker.js";
import { SEGMENT_CODES, SEGMENT_SEARCH_LABEL, SEGMENT_KEYWORDS, normalizeText, isValidSegmentCode } from "../lib/segmentCodes.js";
import { generateNextCode, appendRowsToMasterData } from "../lib/excelReader.js";
import { loadLocations } from "../lib/locations.js";
import { getMasterDataCache, setMasterDataCache } from "./search.js";

const router = Router();

// Vietmap Autocomplete là tìm kiếm địa điểm/địa chỉ theo văn bản TỔNG QUÁT — không phải
// "tìm đúng loại hình doanh nghiệp X" như Google Places Text Search. Khi 1 khu vực nhỏ không
// có nhiều kết quả khớp mạnh với từ khoá, Vietmap vẫn trả về "gần đúng nhất" tìm được (kể cả
// không liên quan, vd trụ sở công an, cửa hàng sửa điện thoại) thay vì trả rỗng.
//
// Hàm này LỌC LẠI kết quả thô: chỉ giữ những địa điểm có TÊN (hoặc categories) chứa ít nhất
// 1 từ khoá đặc trưng của đúng Phân khúc đang tìm (vd "cà phê"/"bakery"/"highlands" cho CB).
// Nếu Phân khúc không có bảng từ khoá (CP quá chung chung, hoặc Phân khúc tự do người dùng tự
// gõ) -> KHÔNG lọc, giữ nguyên toàn bộ vì không đủ căn cứ để tự động loại bỏ.
function filterCandidatesBySegment(candidates, segmentCode) {
  const keywords = segmentCode ? SEGMENT_KEYWORDS[segmentCode] : null;
  if (!keywords?.length) return candidates;

  const normalizedKeywords = keywords.map((kw) => normalizeText(kw));
  return candidates.filter((item) => {
    const haystack = normalizeText(`${item.name} ${(item.types || []).join(" ")}`);
    return normalizedKeywords.some((kw) => haystack.includes(kw));
  });
}

// Gộp các mục CÙNG TÊN (so khớp không dấu/không phân biệt hoa-thường) thành 1 dòng duy nhất:
// - Địa chỉ: nối tất cả địa chỉ các chi nhánh vào chung 1 ô, cách nhau bởi " ; ".
// - Tên: gắn thêm "(Chuỗi - N chi nhánh)" ngay sau tên gốc, CHỈ khi có từ 2 chi nhánh trở lên.
// - Website: giữ website của chi nhánh đầu tiên có website (nếu có), vì không thể gộp nhiều
//   website vào 1 ô theo cách có ý nghĩa.
// Giữ nguyên thứ tự xuất hiện đầu tiên của mỗi tên trong danh sách gốc.
function mergeChainDuplicates(proposed) {
  const order = [];
  const groups = new Map(); // tên đã chuẩn hoá -> mảng các dòng cùng tên

  for (const p of proposed) {
    const key = normalizeText(p.tenDoanhNghiep);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(p);
  }

  return order.map((key) => {
    const items = groups.get(key);
    if (items.length === 1) return items[0];

    const merged = { ...items[0] };
    merged.tenDoanhNghiep = `${items[0].tenDoanhNghiep} (Chuỗi - ${items.length} chi nhánh)`;
    merged.diaChi = items
      .map((it) => it.diaChi)
      .filter(Boolean)
      .join(" ; ");
    const withWebsite = items.find((it) => it.website);
    if (withWebsite) merged.website = withWebsite.website;
    return merged;
  });
}

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
      segmentCode: resolved.code,
      rawQuery: keywordText,
    });

    // Loại bỏ kết quả rác không liên quan tới Phân khúc đang tìm (xem giải thích ở
    // filterCandidatesBySegment phía trên) TRƯỚC khi so trùng với Master Data.
    const relevantCandidates = filterCandidatesBySegment(candidates, resolved.code);

    const { uniqueNew, duplicates } = dedupeAgainstMasterData(relevantCandidates, masterRows);

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

    // GỘP các doanh nghiệp CÙNG TÊN (khả năng cao là nhiều chi nhánh của 1 chuỗi) thành
    // MỘT dòng duy nhất, thay vì hiển thị N dòng riêng biệt: nối tất cả địa chỉ vào chung
    // 1 ô (cách nhau bởi " ; "), và gắn nhãn "(Chuỗi - N chi nhánh)" ngay sau tên doanh
    // nghiệp để người dùng biết ngay đây là chuỗi mà không cần thêm cột riêng.
    proposed = mergeChainDuplicates(proposed);

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
      possiblyIncomplete: Boolean(candidates.possiblyIncomplete),
    });
  } catch (err) {
    console.error("[places/search] Lỗi:", err);
    // Nếu client (trình duyệt/proxy) đã tự ngắt kết nối giữa chừng vì chờ quá lâu, response
    // có thể đã bắt đầu gửi hoặc socket đã đóng — cố res.json() lần nữa lúc này sẽ ném lỗi
    // KHÁC (vd "ERR_HTTP_HEADERS_SENT"), lỗi đó nếu không được bắt sẽ làm SẬP CẢ SERVER
    // (đây chính là nguyên nhân server bị crash khi tìm Phân khúc quá đông kết quả). Kiểm
    // tra headersSent trước khi trả lỗi để tránh việc này.
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
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
    console.error("[places/confirm] Lỗi:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;