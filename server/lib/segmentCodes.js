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

// Từ khóa nhận diện Phân khúc theo tên/loại hình doanh nghiệp (rule-based, không AI).
// Dùng cho 2 việc: (1) đoán Phân khúc từ câu query tự do, (2) LỌC LẠI kết quả Vietmap trả về
// (Vietmap Autocomplete là tìm kiếm văn bản tổng quát, không phải "tìm đúng loại hình X" như
// Google Places — nếu 1 khu vực không có nhiều kết quả khớp mạnh, Vietmap vẫn trả "gần đúng
// nhất" tìm được, kể cả không liên quan gì tới Phân khúc đang tìm). Vì việc lọc lại này so
// khớp qua hàm normalize() (bỏ dấu, lowercase — xem queryParser.js) nên chỉ cần viết 1 dạng
// có dấu là đủ, không cần liệt kê thêm bản không dấu song song.
export const SEGMENT_KEYWORDS = {
  HT: ["hotel", "khách sạn"],
  RS: ["resort"],
  RT: ["restaurant", "nhà hàng", "dining"],
  BK: ["bank", "ngân hàng"],
  RE: ["real estate", "bất động sản", "property"],
  EA: ["event agency", "event", "sự kiện"],
  // Thêm từ khoá tiếng Việt tự nhiên ("cà phê", "bánh") + tên 1 số chuỗi lớn thường gặp, vì
  // tên các chuỗi này (Highlands, Phúc Long, Katinat...) không nhất thiết chứa chữ "cafe"/
  // "coffee" nên trước đây dễ bị lọc nhầm là "không liên quan".
  CB: [
    "cafe",
    "café",
    "coffee",
    "cà phê",
    "bakery",
    "bánh",
    "highlands",
    "phúc long",
    "katinat",
    "the coffee house",
    "trung nguyên",
    "cộng cà phê",
    "milano",
    "urban station",
    "starbucks",
  ],
  SP: ["spa", "wellness"],
  IN: ["insurance", "bảo hiểm"],
  WP: ["wedding planner", "wedding", "cưới"],
  AL: ["airline", "airlines", "hàng không"],
  CP: ["corporate", "doanh nghiệp", "company", "co., ltd", "jsc"],
};

// Chuẩn hóa chuỗi: bỏ dấu tiếng Việt + lowercase, dùng chung cho việc đoán/lọc Phân khúc
// trong file này. Định nghĩa RIÊNG (không import từ queryParser.js) để tránh vòng lặp import,
// vì queryParser.js đang import ngược lại SEGMENT_KEYWORDS từ chính file này.
export function normalizeText(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidSegmentCode(code) {
  return Object.prototype.hasOwnProperty.call(SEGMENT_CODES, code);
}

// Từ khóa tiếng Việt tự nhiên dùng khi gửi truy vấn text search sang Vietmap/Google Places
// (cần biết "tìm cái gì", chỉ có quận/thành phố là không đủ để ra kết quả đúng loại hình)
export const SEGMENT_SEARCH_LABEL = {
  HT: "khách sạn",
  RS: "resort",
  RT: "nhà hàng",
  CP: "doanh nghiệp",
  BK: "ngân hàng",
  RE: "bất động sản",
  EA: "công ty tổ chức sự kiện",
  // Đổi từ "cafe bakery" (tiếng Anh, ít khớp dữ liệu tiếng Việt của Vietmap) sang "cà phê" —
  // từ khoá tự nhiên nhất, khớp tốt nhất với cách đặt tên POI cà phê/chuỗi cà phê ở Vietmap.
  // Kết quả là tiệm bánh vẫn được giữ lại bình thường qua bước lọc SEGMENT_KEYWORDS.CB ở trên
  // (có "bánh"/"bakery"), chỉ là không dùng "bakery" làm từ khoá tìm chính vì kém hiệu quả hơn.
  CB: "cà phê",
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
  const normalized = normalizeText(text);

  for (const [code, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
    if (code === "CP") continue; // CP là fallback, xét sau cùng
    if (keywords.some((kw) => normalized.includes(normalizeText(kw)))) {
      return { code, confident: true };
    }
  }

  const cpKeywords = SEGMENT_KEYWORDS.CP;
  if (cpKeywords.some((kw) => normalized.includes(normalizeText(kw)))) {
    return { code: "CP", confident: true };
  }

  return { code: "CP", confident: false };
}