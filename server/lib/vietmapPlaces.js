// Module tìm doanh nghiệp mới bằng Vietmap Autocomplete API v3.0 (maps.vietmap.vn).
// Dùng thay Google Places API vì Google chặn billing account gắn ngân hàng/địa chỉ Việt Nam
// (Việt Nam nằm trong "Prohibited Territories" của Google Maps Platform từ 21/3/2022).
//
// Cần biến môi trường VIETMAP_API_KEY (đặt trong server/.env, KHÔNG đưa lên frontend).
// Đăng ký / lấy key tại: https://maps.vietmap.vn
//
// Lưu ý khác biệt so với Google Places:
//  - Vietmap Autocomplete v3 là API tìm kiếm địa điểm/địa chỉ theo văn bản, không có khái niệm
//    "business type" chuyên biệt như Google Text Search, nên độ chính xác khi tìm theo phân khúc
//    (vd "khách sạn") phụ thuộc vào việc dữ liệu POI có gắn từ khóa/danh mục phù hợp hay không.
//  - Theo tài liệu chính thức của Vietmap (Autocomplete v3 + Place v3), response KHÔNG có field
//    website — cột Website trong kết quả gần như luôn để trống (đã thử đọc phòng trường hợp một
//    số POI đặc biệt có trả, nhưng không đảm bảo). Muốn có website đầy đủ, cần nguồn dữ liệu khác
//    (Google Places, hoặc nhập tay).
//  - Mỗi request tối đa trả về 10 kết quả (giới hạn của Vietmap, không có tham số page/limit).

import { loadLocations } from "./locations.js";

const AUTOCOMPLETE_URL = "https://maps.vietmap.vn/api/autocomplete/v3";
const PLACE_URL = "https://maps.vietmap.vn/api/place/v3"; // dùng để lấy toạ độ (lat/lng) thật của 1 địa điểm theo ref_id

// Vietmap Autocomplete luôn trả về tối đa 10 kết quả/lần gọi. Khi 1 lần gọi trả về
// ĐÚNG con số này, nhiều khả năng còn kết quả bị cắt bớt (chưa chắc hết địa điểm thật).
const VIETMAP_PAGE_LIMIT = 10;

// Giới hạn số tầng chia nhỏ theo TOẠ ĐỘ (sau khi đã chia hết theo Quận -> Phường mà vẫn còn
// đầy 10 kết quả). Mỗi tầng chia 1 vùng tròn thành 4 vùng tròn nhỏ hơn (logic ẩn, không cho
// người dùng chọn) — 2 tầng là đủ xử lý các phường siêu đông đúc mà không gọi API quá nhiều.
const MAX_GEO_SPLIT_DEPTH = 2;
// Dưới bán kính này (mét) thì coi vùng đã đủ nhỏ, không chia tiếp nữa dù vẫn đầy 10 kết quả.
const MIN_SPLIT_RADIUS_METERS = 150;
// Chỉ lấy toạ độ của tối đa 6/10 kết quả (đủ để ước lượng tâm + bán kính vùng) thay vì cả 10,
// để giảm số lần gọi Place API khi phải chia nhỏ theo vị trí.
const GEO_SAMPLE_SIZE = 6;

// Giãn cách tối thiểu (mili-giây) giữa 2 lần gọi Vietmap LIÊN TIẾP (áp dụng chung cho cả
// Autocomplete lẫn Place API, vì cùng 1 apikey/tài khoản bị tính chung hạn mức). Có thể chỉnh
// qua biến môi trường VIETMAP_MIN_INTERVAL_MS nếu gói Vietmap của bạn cho phép nhanh/chậm hơn.
const MIN_REQUEST_INTERVAL_MS = Number(process.env.VIETMAP_MIN_INTERVAL_MS || 350);
// Số lần thử lại tối đa khi Vietmap trả về lỗi 429 "Too Many Request" trước khi bỏ cuộc.
const MAX_RETRIES_ON_429 = 4;

// GIỚI HẠN CHÍNH THỨC của Vietmap Autocomplete API: tối đa 200 request/phút. Có thể chỉnh qua
// biến môi trường VIETMAP_RATE_LIMIT_PER_MIN nếu gói bạn đang dùng có hạn mức khác.
const RATE_LIMIT_PER_MIN = Number(process.env.VIETMAP_RATE_LIMIT_PER_MIN || 200);
const RATE_WINDOW_MS = 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Lưu thời điểm (ms) của các lần gọi Vietmap gần đây (cửa sổ trượt 60 giây), để TỰ CHỦ ĐỘNG
// không bao giờ vượt quá RATE_LIMIT_PER_MIN — thay vì đợi Vietmap trả 429 rồi mới xử lý.
const requestTimestamps = [];
let lastRateLimitWarningAt = 0;

// Xin 1 "chỗ trống" trong hạn mức trước khi thực sự gọi API. Nếu đã đủ RATE_LIMIT_PER_MIN
// lần gọi trong 60 giây gần nhất -> CHỜ tới khi lần gọi cũ nhất "hết hạn" rồi mới cho đi tiếp,
// đồng thời in cảnh báo (không spam log, tối đa 1 lần / 5 giây) để bạn biết đang bị chặn tốc độ.
async function waitForRateLimitSlot() {
  for (;;) {
    const now = Date.now();
    while (requestTimestamps.length && now - requestTimestamps[0] >= RATE_WINDOW_MS) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length < RATE_LIMIT_PER_MIN) {
      requestTimestamps.push(now);
      return;
    }

    const waitMs = RATE_WINDOW_MS - (now - requestTimestamps[0]) + 20; // +20ms đệm an toàn
    if (now - lastRateLimitWarningAt > 5000) {
      lastRateLimitWarningAt = now;
      console.warn(
        `[Vietmap] ⚠️ CẢNH BÁO: đã đạt giới hạn ${RATE_LIMIT_PER_MIN} request/phút của Vietmap Autocomplete API. ` +
          `Đang tạm dừng tìm kiếm ~${Math.ceil(waitMs / 1000)}s để tránh bị chặn (429), khu vực tìm kiếm rất lớn/đông đúc nên cần nhiều lượt gọi.`
      );
    }
    await sleep(waitMs);
  }
}

// Hàng đợi dùng chung để MỌI lệnh gọi Vietmap (autocomplete + place) đi tuần tự, cách nhau
// tối thiểu MIN_REQUEST_INTERVAL_MS, KHÔNG vượt quá RATE_LIMIT_PER_MIN request/phút, và tự
// động thử lại (backoff tăng dần) nếu vẫn bị 429. Nhờ vậy toàn bộ logic chia nhỏ theo
// Quận/Phường/Toạ độ ở trên không cần biết gì về giới hạn tốc độ — chỉ cần gọi qua hàm này.
let vietmapQueue = Promise.resolve();

function scheduleVietmapRequest(doFetch) {
  const run = async () => {
    await waitForRateLimitSlot();

    let attempt = 0;
    for (;;) {
      const res = await doFetch();
      if (res.status !== 429) return res;

      attempt += 1;
      if (attempt > MAX_RETRIES_ON_429) {
        console.error(
          `[Vietmap] ⚠️ CẢNH BÁO: vẫn bị lỗi 429 sau ${MAX_RETRIES_ON_429} lần thử lại — bỏ qua truy vấn này, ` +
            `kết quả trả về có thể chưa đầy đủ. Cân nhắc hạ VIETMAP_RATE_LIMIT_PER_MIN hoặc tăng VIETMAP_MIN_INTERVAL_MS trong server/.env.`
        );
        return res; // hết lượt thử -> để nơi gọi tự xử lý/log lỗi
      }

      const retryAfterSec = Number(res.headers?.get?.("retry-after"));
      const backoffMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : 800 * 2 ** (attempt - 1); // 800ms -> 1.6s -> 3.2s -> 6.4s nếu Vietmap không gợi ý thời gian chờ
      console.warn(`[Vietmap] Bị giới hạn tốc độ (429), thử lại lần ${attempt}/${MAX_RETRIES_ON_429} sau ${backoffMs}ms...`);
      await sleep(backoffMs);
    }
  };

  const scheduled = vietmapQueue.then(async () => {
    const res = await run();
    await sleep(MIN_REQUEST_INTERVAL_MS); // giữ nhịp cho request tiếp theo trong hàng đợi
    return res;
  });
  // Hàng đợi phải tiếp tục dù request này lỗi, để các request xếp sau vẫn chạy đúng nhịp.
  vietmapQueue = scheduled.catch(() => {});
  return scheduled;
}

// GIỚI HẠN TỔNG SỐ LẦN GỌI VIETMAP cho 1 LẦN TÌM (cộng dồn cả Autocomplete lẫn Place API,
// qua mọi phường/vùng tròn con). Không có giới hạn này, 1 Phân khúc siêu đông đúc (vd "Nhà
// hàng" — nhiều gấp chục lần "Hãng hàng không") tìm ở khu vực rộng (nhiều quận, mỗi quận
// nhiều phường, mỗi phường có thể chia tiếp 2 tầng theo toạ độ) có thể cần tới HÀNG TRĂM lần
// gọi -> mất vài phút -> trình duyệt/proxy tự ngắt kết nối giữa chừng trước khi có kết quả.
// Khi chạm giới hạn này, DỪNG tìm thêm và trả về kết quả đã thu thập được (kèm cờ
// possiblyIncomplete để route báo cho người dùng biết có thể còn sót).
const MAX_REQUESTS_PER_SEARCH = Number(process.env.VIETMAP_MAX_REQUESTS_PER_SEARCH || 200);
  "Dữ liệu doanh nghiệp từ Vietmap Place API — cần hiển thị theo chính sách của Vietmap khi dùng lại.";

export function isVietmapConfigured() {
  return Boolean(process.env.VIETMAP_API_KEY);
}

// Toạ độ trung tâm để "focus" kết quả tìm kiếm quanh khu vực đúng thành phố
const CITY_FOCUS = {
  HCM: { lat: 10.7769, lng: 106.7009 },
  HN: { lat: 21.0285, lng: 105.8542 },
  DN: { lat: 16.0544, lng: 108.2022 },
};

const CITY_FULL_NAME = { HCM: "Hồ Chí Minh", HN: "Hà Nội", DN: "Đà Nẵng" };
function cityFullName(code) {
  return CITY_FULL_NAME[code] || code || "";
}

// Ghép chuỗi text tìm kiếm gửi cho Vietmap, vd: "khách sạn, Phường Bến Nghé, Quận 1, Hồ Chí Minh"
// district/ward truyền vào là tên ĐẦY ĐỦ người dùng đã chọn từ dropdown (vd "Quận 1", "Phường Bến Nghé"),
// không phải số/text tự do -> khỏi lo sai tên/thiếu dấu.
function buildSearchText({ segmentText, district, ward, city, rawQuery, keywords }) {
  const parts = [];
  if (segmentText) parts.push(segmentText);
  if (keywords?.length) parts.push(keywords.join(" "));
  if (ward) parts.push(ward);
  if (district) parts.push(district);
  const cityName = cityFullName(city);
  if (cityName) parts.push(cityName);
  if (!parts.length) parts.push(rawQuery || "");
  return parts.filter(Boolean).join(", ");
}

function boundaryByType(boundaries = [], type) {
  return boundaries.find((b) => b.type === type);
}

// city truyền vào là MÃ THÀNH PHỐ người dùng đã chọn (HCM/HN/DN) — dùng thẳng mã này để lưu,
// KHÔNG lấy tên đầy đủ từ boundaries nữa. Lý do: Master Data hiện tại đang bị lưu 2 kiểu khác
// nhau cho cùng 1 thành phố (vd vừa có "Thành Phố Hồ Chí Minh" vừa có "HCM"), nên từ nay chuẩn
// hoá về 1 kiểu DUY NHẤT (HCM/HN/DN) cho toàn bộ dữ liệu tìm mới, để lọc/tìm kiếm sau này nhất quán.
function normalizePlace(item, cityCode) {
  const districtB = boundaryByType(item.boundaries, 1);
  return {
    name: item.name || "",
    // Ưu tiên item.address: theo tài liệu Vietmap, đây là "địa chỉ đầy đủ gồm số nhà/đường/
    // phường/quận/thành phố" nhưng KHÔNG kèm tên doanh nghiệp (khác với item.display, vốn ghép
    // thêm tên doanh nghiệp lên trước). Nhờ vậy cột Địa chỉ tự động chỉ còn "từ số nhà trở đi".
    address: item.address || item.display || "",
    city: cityCode || "",
    // Vietmap Autocomplete/Place API v3 KHÔNG có field website trong tài liệu chính thức, nhưng
    // vẫn thử đọc phòng trường hợp 1 số POI đặc biệt có trả (không đảm bảo, đa số sẽ để trống).
    website: item.website || item.homepage || item.url || "",
    placeId: item.ref_id || "",
    types: (item.categories || []).map((c) => c.name || c).filter(Boolean),
    district: districtB?.full_name || "",
  };
}

// extraGeo (tuỳ chọn) = { circleCenter: {lat,lng}, circleRadius: number(mét) } để giới hạn
// tìm kiếm trong 1 vùng tròn toạ độ cụ thể — dùng cho tầng chia nhỏ theo vị trí bên dưới.
async function callAutocomplete(text, focus, extraGeo) {
  const params = new URLSearchParams({
    apikey: process.env.VIETMAP_API_KEY,
    text,
    layers: "POI", // chỉ lấy địa điểm/doanh nghiệp, bỏ qua kết quả là địa chỉ/đường/khu vực thuần túy
  });
  if (focus) params.set("focus", `${focus.lat},${focus.lng}`);
  if (extraGeo?.circleCenter) {
    params.set("circle_center", `${extraGeo.circleCenter.lat},${extraGeo.circleCenter.lng}`);
    params.set("circle_radius", String(Math.max(1, Math.round(extraGeo.circleRadius || 0))));
  }

  const res = await scheduleVietmapRequest(() => fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`));

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Vietmap API lỗi (${res.status}): ${body || res.statusText}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Lấy toạ độ thật (lat/lng) của 1 địa điểm qua Vietmap Place API, dùng ref_id trả về từ Autocomplete.
// Autocomplete không trả toạ độ nên cần gọi thêm API này khi cần chia nhỏ vùng tìm theo vị trí.
async function fetchPlaceLatLng(refId) {
  try {
    const params = new URLSearchParams({ apikey: process.env.VIETMAP_API_KEY, refid: refId });
    const res = await scheduleVietmapRequest(() => fetch(`${PLACE_URL}?${params.toString()}`));
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.lat === "number" && typeof data?.lng === "number") {
      return { lat: data.lat, lng: data.lng };
    }
  } catch (err) {
    console.error(`[Vietmap] Lỗi lấy toạ độ cho ${refId}:`, err.message);
  }
  return null;
}

// Khoảng cách 2 điểm toạ độ (mét) — công thức Haversine.
function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function centroid(points) {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return { lat, lng };
}

function metersToLatDelta(meters) {
  return meters / 111320;
}
function metersToLngDelta(meters, atLat) {
  return meters / (111320 * Math.cos((atLat * Math.PI) / 180) || 1);
}

// Chia 1 vùng tròn (tâm + bán kính) thành 4 vùng tròn con theo 4 hướng Đông Bắc/Tây Bắc/
// Đông Nam/Tây Nam. Các vùng con có chồng lấn nhẹ lên nhau để tránh sót POI nằm gần ranh giới.
function splitCircleIntoQuadrants(center, radiusMeters) {
  const subRadius = Math.max(radiusMeters * 0.65, MIN_SPLIT_RADIUS_METERS);
  const offset = radiusMeters * 0.5;
  const dLat = metersToLatDelta(offset);
  const dLng = metersToLngDelta(offset, center.lat);
  return [
    { lat: center.lat + dLat, lng: center.lng + dLng },
    { lat: center.lat + dLat, lng: center.lng - dLng },
    { lat: center.lat - dLat, lng: center.lng + dLng },
    { lat: center.lat - dLat, lng: center.lng - dLng },
  ].map((c) => ({ center: c, radius: subRadius }));
}

/**
 * Tìm doanh nghiệp mới qua Vietmap Autocomplete API v3.
 * `filters.segmentText` là tên loại hình cần tìm (vd "khách sạn"), do route xác định
 * (theo Phân khúc đã biết trong bảng mã, hoặc theo Phân khúc tự do người dùng nhập).
 *
 * Vietmap Autocomplete LUÔN giới hạn tối đa 10 kết quả MỖI LẦN GỌI, bất kể phạm vi tìm
 * to hay nhỏ (không có tham số page/limit). Để lấy được nhiều hơn 10 kết quả thật sự,
 * hệ thống TỰ ĐỘNG chia nhỏ vùng tìm và gọi nhiều lần theo 2 tầng (đều là logic ẩn, không
 * cần người dùng chọn gì thêm ngoài Quận và Phường như hiện có):
 *
 *  Tầng 1 — theo ranh giới hành chính:
 *   - Nếu quận nào người dùng có chọn phường/xã cụ thể -> gọi riêng từng phường đó.
 *   - Nếu quận KHÔNG chọn phường nào -> coi như chọn TẤT CẢ phường/xã của quận đó (lấy từ
 *     data/wards.json) và gọi riêng cho TỪNG phường (không gọi 1 lần cho cả quận nữa — xem
 *     giải thích chi tiết ngay tại vòng lặp bên dưới).
 *
 *  Tầng 2 — theo VỊ TRÍ (toạ độ thật), áp dụng cho MỌI phường vẫn còn đầy 10 kết quả sau
 *  tầng 1 (kể cả phường người dùng tự chọn): lấy toạ độ (lat/lng) thật của 10 địa điểm vừa
 *  nhận qua Vietmap Place API, tính tâm + bán kính vùng đã thấy, rồi chia vùng đó thành 4
 *  vùng tròn nhỏ hơn (circle_center + circle_radius) để quét tiếp — đệ quy tối đa
 *  MAX_GEO_SPLIT_DEPTH tầng, dừng khi vùng đã đủ nhỏ hoặc hết đầy 10 kết quả.
 *
 * Tất cả kết quả được gộp và loại trùng theo ref_id trước khi trả về.
 * Trả về danh sách chuẩn hóa: { name, address, city, website, placeId, types, district }
 */
export async function searchVietmapPlaces(filters) {
  if (!isVietmapConfigured()) {
    throw new Error(
      "Chưa cấu hình VIETMAP_API_KEY ở backend (server/.env). Vui lòng thêm key trước khi dùng chức năng tìm địa điểm mới."
    );
  }

  const { city, districts, wardsByDistrict } = filters;
  const focus = CITY_FOCUS[city];
  const allResults = [];
  const seenIds = new Set();
  let requestCount = 0;
  let budgetExceeded = false;
  let budgetWarningLogged = false;

  function hasBudget() {
    if (requestCount >= MAX_REQUESTS_PER_SEARCH) {
      budgetExceeded = true;
      if (!budgetWarningLogged) {
        budgetWarningLogged = true;
        console.warn(
          `[Vietmap] ⚠️ Đã chạm giới hạn ${MAX_REQUESTS_PER_SEARCH} lần gọi cho 1 lần tìm (Phân khúc/khu vực quá đông đúc). ` +
            `Dừng tìm thêm, trả về ${allResults.length} kết quả đã thu thập được. Có thể tăng VIETMAP_MAX_REQUESTS_PER_SEARCH ` +
            `trong server/.env nếu muốn quét kỹ hơn (đổi lại request sẽ chạy lâu hơn).`
        );
      }
      return false;
    }
    return true;
  }

  // Giữ ĐÚNG thứ tự quận người dùng chọn, để giữ đúng thứ tự khi hiển thị/sort kết quả sau này.
  const districtList = districts?.length ? districts : [null];

  // Gọi 1 truy vấn Vietmap, gộp kết quả mới (loại trùng theo ref_id) vào allResults.
  // Trả về { rawCount, refIds }: rawCount = số kết quả thô nhận được (kể cả đã trùng) để biết
  // có nghi bị cắt bớt hay không; refIds = ref_id của TẤT CẢ kết quả lần gọi này (dùng để lấy
  // toạ độ khi cần chia nhỏ theo vị trí ở tầng 2, kể cả những item đã seen trước đó).
  async function fetchAndMerge(text, extraGeo) {
    if (!hasBudget()) return { rawCount: 0, refIds: [] };
    requestCount += 1;

    let items;
    try {
      items = await callAutocomplete(text, focus, extraGeo);
    } catch (err) {
      // Không chặn các phường/quận/vùng khác nếu một truy vấn lỗi (vd hết quota tạm thời)
      console.error(`[Vietmap] Lỗi khi tìm "${text}":`, err.message);
      return { rawCount: 0, refIds: [] };
    }

    const refIds = [];
    for (const item of items) {
      if (!item.ref_id) continue;
      refIds.push(item.ref_id);
      if (seenIds.has(item.ref_id)) continue;
      seenIds.add(item.ref_id);
      allResults.push(normalizePlace(item, city));
    }

    return { rawCount: items.length, refIds };
  }

  // Tầng 2 (ẩn): khi 1 vùng (phường hoặc vùng tròn con) vẫn đầy 10 kết quả, chia nhỏ tiếp theo
  // TOẠ ĐỘ THẬT của các kết quả vừa thấy, thay vì đoán tên đường/từ khoá.
  async function splitByLocationIfNeeded(text, refIds, depth) {
    if (depth >= MAX_GEO_SPLIT_DEPTH || !hasBudget()) return;

    const points = [];
    for (const refId of refIds.slice(0, GEO_SAMPLE_SIZE)) {
      if (!hasBudget()) break;
      requestCount += 1;
      const pt = await fetchPlaceLatLng(refId);
      if (pt) points.push(pt);
    }
    // Không đủ toạ độ để xác định vùng (vd Place API lỗi hàng loạt) -> bỏ qua, chấp nhận
    // giữ nguyên kết quả đã có thay vì đoán mò.
    if (points.length < 2) return;

    const center = centroid(points);
    const observedRadius = Math.max(...points.map((p) => distanceMeters(center, p)));
    // Nới rộng bán kính so với 10 điểm mẫu, vì mẫu bị cắt bớt nên khu vực thật có thể lớn hơn.
    const searchRadius = Math.max(observedRadius * 1.6, 400);

    if (searchRadius <= MIN_SPLIT_RADIUS_METERS) return;

    const quadrants = splitCircleIntoQuadrants(center, searchRadius);
    for (const q of quadrants) {
      if (!hasBudget()) break;
      const { rawCount, refIds: subRefIds } = await fetchAndMerge(text, {
        circleCenter: q.center,
        circleRadius: q.radius,
      });
      if (rawCount >= VIETMAP_PAGE_LIMIT) {
        await splitByLocationIfNeeded(text, subRefIds, depth + 1);
      }
    }
  }

  // Tìm cho 1 phường/xã cụ thể, tự chia nhỏ theo vị trí (tầng 2) nếu vẫn đầy 10 kết quả.
  async function searchWardExhaustive(district, ward) {
    const text = buildSearchText({ ...filters, district, ward });
    const { rawCount, refIds } = await fetchAndMerge(text);
    if (rawCount >= VIETMAP_PAGE_LIMIT) {
      await splitByLocationIfNeeded(text, refIds, 0);
    }
  }

  for (const district of districtList) {
    // Danh sách phường cần tìm: nếu người dùng đã chọn phường cụ thể -> dùng đúng danh sách đó.
    // Nếu KHÔNG chọn phường nào (chỉ chọn Quận) -> coi như "chọn TẤT CẢ phường của quận đó"
    // (lấy từ data/wards.json), rồi tìm riêng từng phường — KHÔNG gọi 1 lần cho cả quận nữa.
    //
    // Lý do đổi cách này: trước đây code chỉ chia nhỏ theo phường KHI kết quả cấp quận trả về
    // ĐÚNG 10 (nghi bị cắt). Nhưng Vietmap Autocomplete là tìm kiếm văn bản tổng quát, khi
    // 1 quận rộng không có nhiều địa điểm khớp mạnh với từ khoá, nó thường trả về DƯỚI 10 kết
    // quả (thường lẫn cả kết quả không liên quan) — nên điều kiện "đúng 10" gần như không bao
    // giờ đúng, khiến rất nhiều phường trong quận KHÔNG BAO GIỜ được tìm tới, bỏ sót hàng loạt
    // địa điểm thật (vd nhiều chi nhánh 1 chuỗi cà phê nằm rải rác ở các phường khác nhau).
    // Tìm riêng từng phường (giống hệt cách tìm khi người dùng tự chọn 1 phường, vốn đã đúng)
    // đảm bảo QUÉT HẾT, không phụ thuộc vào việc cấp quận có "bị cắt" hay không.
    const wardsInDistrict = wardsByDistrict?.[district]?.length
      ? wardsByDistrict[district]
      : district
        ? loadLocations()[city]?.districts?.[district] || []
        : [];

    if (wardsInDistrict.length) {
      for (const ward of wardsInDistrict) {
        if (!hasBudget()) break;
        await searchWardExhaustive(district, ward);
      }
    } else {
      // Không có district cụ thể (city-wide) hoặc không tra được danh sách phường -> tìm
      // nguyên vùng đó, vẫn tự chia theo vị trí (tầng 2) nếu quá đông kết quả.
      await searchWardExhaustive(district, null);
    }
  }

  // Gắn cờ vào chính mảng kết quả (không đổi kiểu dữ liệu trả về, vẫn là mảng như cũ, chỉ
  // thêm 1 thuộc tính phụ) để route phía trên biết và báo cho người dùng nếu bị dừng sớm do
  // chạm giới hạn số request — tránh im lặng trả về thiếu mà không ai biết.
  allResults.possiblyIncomplete = budgetExceeded;
  return allResults;
}