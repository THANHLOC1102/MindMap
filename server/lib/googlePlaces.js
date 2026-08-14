// Module tìm doanh nghiệp mới bằng Google Places API (New) — Text Search.
// Dùng khi người dùng chọn "Tìm thêm (Google Places)".
//
// Cần biến môi trường GOOGLE_MAPS_API_KEY (đặt trong server/.env, KHÔNG đưa lên frontend).
//
// Tuân thủ nguyên tắc trong spec:
//  - Chỉ dùng Google Places API chính thức (không scrape HTML Google Maps).
//  - Field mask CHỈ xin những field thuộc gói "Basic" (rẻ/miễn phí theo hạn mức $200/tháng
//    của Google) để tối ưu chi phí: id, displayName, formattedAddress, addressComponents,
//    types, location. Trường "websiteUri" thuộc gói "Contact" (tính phí thêm) — bật/tắt qua
//    biến môi trường GOOGLE_INCLUDE_WEBSITE để người dùng tự cân nhắc chi phí.
//  - Không tự động coi mọi kết quả là hợp lệ — kết quả trả về vẫn phải qua kiểm tra trùng
//    và người dùng xác nhận trước khi ghi vào Master Data (xem routes/places.js).

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

export const GOOGLE_ATTRIBUTION =
  "Dữ liệu doanh nghiệp từ Google Places API — cần hiển thị theo chính sách của Google khi dùng lại.";

export function isGooglePlacesConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

// Basic SKU (rẻ nhất) + tùy chọn Contact SKU (websiteUri) nếu người dùng chấp nhận phát sinh phí
function buildFieldMask() {
  const basic = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.addressComponents",
    "places.types",
    "places.location",
  ];
  const includeWebsite = process.env.GOOGLE_INCLUDE_WEBSITE !== "false"; // mặc định bật
  if (includeWebsite) basic.push("places.websiteUri");
  return basic.join(",");
}

const CITY_FULL_NAME = { HCM: "Hồ Chí Minh", HN: "Hà Nội", DN: "Đà Nẵng" };
function cityFullName(code) {
  return CITY_FULL_NAME[code] || code || "";
}

// Ghép chuỗi textQuery gửi cho Google, vd: "khách sạn Quận 1, Hồ Chí Minh, Vietnam"
function buildTextQuery({ segmentText, district, city, rawQuery, keywords }) {
  const parts = [];
  if (segmentText) parts.push(segmentText);
  if (keywords?.length) parts.push(keywords.join(" "));
  if (district) parts.push(`Quận ${district}`);
  const cityName = cityFullName(city);
  if (cityName) parts.push(cityName);
  if (!parts.length) parts.push(rawQuery || "");
  parts.push("Việt Nam");
  return parts.filter(Boolean).join(", ");
}

function extractDistrictFromComponents(components = []) {
  const level3 = components.find((c) => c.types?.includes("sublocality_level_1"));
  return level3?.longText || level3?.shortText || "";
}

function normalizePlace(place, cityCode) {
  const name = place.displayName?.text || "";
  const address = place.formattedAddress || "";
  return {
    name,
    address,
    city: cityCode || "",
    website: place.websiteUri || "",
    placeId: place.id || "",
    types: place.types || [],
    district: extractDistrictFromComponents(place.addressComponents),
  };
}

async function callTextSearch(textQuery) {
  const res = await fetch(TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": buildFieldMask(),
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "vi",
      regionCode: "VN",
      maxResultCount: 20,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Places API lỗi (${res.status}): ${body || res.statusText}`);
  }

  const data = await res.json();
  return data.places || [];
}

/**
 * Tìm doanh nghiệp mới qua Google Places API (New) Text Search.
 * `filters.segmentText` là tên loại hình cần tìm (vd "khách sạn"), do route xác định
 * (theo Phân khúc đã biết trong bảng mã, hoặc theo Phân khúc tự do người dùng nhập).
 * Trả về danh sách chuẩn hóa: { name, address, city, website, placeId, types, district }
 */
export async function searchGooglePlaces(filters) {
  if (!isGooglePlacesConfigured()) {
    throw new Error(
      "Chưa cấu hình GOOGLE_MAPS_API_KEY ở backend (server/.env). Vui lòng thêm key trước khi dùng chức năng Google Places."
    );
  }

  const { city, districts, rawQuery } = filters;
  const allResults = [];
  const seenIds = new Set();

  // Nếu có nhiều quận, tìm riêng từng quận theo ĐÚNG thứ tự người dùng nhập,
  // để giữ đúng thứ tự khi hiển thị/sort kết quả sau này.
  const districtList = districts?.length ? districts : [null];

  for (const district of districtList) {
    const textQuery = buildTextQuery({ ...filters, district });

    let places;
    try {
      places = await callTextSearch(textQuery);
    } catch (err) {
      // Không chặn các quận khác nếu một truy vấn lỗi (vd hết quota tạm thời)
      console.error(`[GooglePlaces] Lỗi khi tìm "${textQuery}":`, err.message);
      continue;
    }

    for (const place of places) {
      if (!place.id || seenIds.has(place.id)) continue;
      seenIds.add(place.id);
      allResults.push(normalizePlace(place, city));
    }
  }

  return allResults;
}
