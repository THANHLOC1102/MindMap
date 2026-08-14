// Bảng mã Phân khúc — KHÔNG được tự ý thêm/sửa mã mới ngoài spec.
export const SEGMENT_CODES = {
  HT: "Khách sạn (Hotel)",
  RS: "Resort",
  RT: "Nhà hàng (Restaurant)",
  CP: "Doanh nghiệp (Corporate)",
  BK: "Ngân hàng (Bank)",
  RE: "Bất động sản (Real Estate)",
  EA: "Công ty tổ chức sự kiện (Event Agency)",
  CB: "Chuỗi Café & Bakery",
  SP: "Spa & Wellness Center",
  IN: "Bảo hiểm (Insurance)",
  WP: "Wedding Planner",
  AL: "Hãng hàng không (Airline)",
};

// Từ khóa nhận diện Phân khúc theo tên/loại hình doanh nghiệp (rule-based, không AI)
export const SEGMENT_KEYWORDS = {
  HT: ["hotel", "khách sạn", "khach san"],
  RS: ["resort"],
  RT: ["restaurant", "nhà hàng", "nha hang", "dining"],
  BK: ["bank", "ngân hàng", "ngan hang"],
  RE: ["real estate", "bất động sản", "bat dong san", "property"],
  EA: ["event agency", "event", "sự kiện", "su kien"],
  CB: ["cafe", "café", "bakery", "coffee"],
  SP: ["spa", "wellness"],
  IN: ["insurance", "bảo hiểm", "bao hiem"],
  WP: ["wedding planner", "wedding"],
  AL: ["airline", "airlines", "hàng không", "hang khong"],
  CP: ["corporate", "doanh nghiệp", "doanh nghiep", "company", "co., ltd", "jsc"],
};

export function isValidSegmentCode(code) {
  return Object.prototype.hasOwnProperty.call(SEGMENT_CODES, code);
}

// Từ khóa tiếng Việt tự nhiên dùng khi gửi truy vấn text search sang Google Places
// (Google cần biết "tìm cái gì", chỉ có quận/thành phố là không đủ để ra kết quả đúng loại hình)
export const SEGMENT_SEARCH_LABEL = {
  HT: "khách sạn",
  RS: "resort",
  RT: "nhà hàng",
  CP: "doanh nghiệp",
  BK: "ngân hàng",
  RE: "bất động sản",
  EA: "công ty tổ chức sự kiện",
  CB: "cafe bakery",
  SP: "spa wellness",
  IN: "công ty bảo hiểm",
  WP: "wedding planner",
  AL: "hãng hàng không",
};

/**
 * Đoán mã Phân khúc từ chuỗi text (tên doanh nghiệp / loại hình / types Google Places).
 * Trả về { code, confident } — confident=false nghĩa là fallback về CP, cần người dùng
 * kiểm tra thủ công thay vì tự động kết luận.
 */
export function guessSegmentCode(text) {
  const normalized = (text || "").toLowerCase();

  for (const [code, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
    if (code === "CP") continue; // CP là fallback, xét sau cùng
    if (keywords.some((kw) => normalized.includes(kw))) {
      return { code, confident: true };
    }
  }

  const cpKeywords = SEGMENT_KEYWORDS.CP;
  if (cpKeywords.some((kw) => normalized.includes(kw))) {
    return { code: "CP", confident: true };
  }

  return { code: "CP", confident: false };
}
