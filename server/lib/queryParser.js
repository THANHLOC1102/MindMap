import { SEGMENT_KEYWORDS, isValidSegmentCode, SEGMENT_CODES } from "./segmentCodes.js";

// Chuẩn hóa chuỗi: bỏ dấu, lowercase, trim khoảng trắng thừa
export function normalize(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

// Chuẩn hóa tên thành phố về mã ngắn (HCM, HN, DN, ...)
const CITY_ALIASES = {
  hcm: "HCM",
  tphcm: "HCM",
  "tp hcm": "HCM",
  "tp.hcm": "HCM",
  "ho chi minh": "HCM",
  "thanh pho ho chi minh": "HCM",
  saigon: "HCM",
  "sai gon": "HCM",
  hn: "HN",
  hanoi: "HN",
  "ha noi": "HN",
  dn: "DN",
  danang: "DN",
  "da nang": "DN",
};

export function normalizeCity(rawCity) {
  const n = normalize(rawCity);
  if (CITY_ALIASES[n]) return CITY_ALIASES[n];
  // thử match không khoảng trắng
  const compact = n.replace(/\s+/g, "");
  for (const [key, value] of Object.entries(CITY_ALIASES)) {
    if (key.replace(/\s+/g, "") === compact) return value;
  }
  return rawCity ? rawCity.trim() : rawCity;
}

// Trích số quận theo ĐÚNG thứ tự người dùng nhập (không sort)
export function extractDistrictOrder(query) {
  const matches = [...query.matchAll(/(?:quận|quan|q)\.?\s*(\d+)/gi)].map((m) =>
    Number(m[1])
  );
  return [...new Set(matches)];
}

function extractCity(query) {
  const n = normalize(query);
  const cityPatterns = [
    { re: /tp\.?\s*hcm|tphcm|thanh pho ho chi minh|ho chi minh|sai gon|\bhcm\b/, code: "HCM" },
    { re: /ha noi|\bhn\b/, code: "HN" },
    { re: /da nang|\bdn\b/, code: "DN" },
  ];
  for (const { re, code } of cityPatterns) {
    if (re.test(n)) return code;
  }
  return null;
}

function extractSegment(query) {
  const n = normalize(query);
  for (const [code, keywords] of Object.entries(SEGMENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (n.includes(normalize(kw))) {
        return code;
      }
    }
  }
  // Cho phép người dùng gõ trực tiếp mã (vd "HT")
  const upper = query.toUpperCase().match(/\b([A-Z]{2})\b/);
  if (upper && isValidSegmentCode(upper[1])) return upper[1];
  return null;
}

// Phần văn bản còn lại sau khi loại bỏ thành phố / quận / "sao" — dùng làm từ khóa
// Phân khúc tự do khi người dùng tìm một loại hình KHÔNG có trong bảng mã sheet "Mã KH"
// (vd "phòng gym", "trường mầm non"). Kết quả này chỉ dùng để gửi Google Places,
// KHÔNG được gán vào cột "Phân khúc" / "Mã KH" (phải để trống theo yêu cầu).
function extractFreeSegmentText(query) {
  let text = query || "";
  text = text.replace(/(?:quận|quan|q)\.?\s*\d+/gi, " ");
  text = text.replace(/tp\.?\s*hcm|tphcm|thành phố hồ chí minh|hồ chí minh|sài gòn|\bhcm\b/gi, " ");
  text = text.replace(/hà nội|\bhn\b|đà nẵng|\bdn\b/gi, " ");
  text = text.replace(/\d\s*sao/gi, " ");
  text = text.replace(/,/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

// Từ khóa phụ (vd "5 sao") — những cụm còn lại sau khi loại city/district/segment keyword
function extractKeywords(query) {
  const keywords = [];
  const starMatch = query.match(/(\d)\s*sao/i);
  if (starMatch) keywords.push(`${starMatch[1]} sao`);
  return keywords;
}

/**
 * Phân tích câu truy vấn tự nhiên bằng rule-based JS (không dùng AI API).
 * Ví dụ: "khách sạn 5 sao quận 1, quận 3 TPHCM"
 * => { segment: "HT", city: "HCM", districts: [1,3], keywords: ["5 sao"], rawQuery }
 */
export function parseQuery(query) {
  const rawQuery = query || "";
  return {
    rawQuery,
    segment: extractSegment(rawQuery),
    freeSegmentText: extractFreeSegmentText(rawQuery),
    city: extractCity(rawQuery),
    districts: extractDistrictOrder(rawQuery),
    keywords: extractKeywords(rawQuery),
  };
}

export { CITY_ALIASES, SEGMENT_CODES };
