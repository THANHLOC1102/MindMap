import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WARDS_FILE = path.join(__dirname, "..", "data", "wards.json");

// { HN: { name, districts: { "Quận Ba Đình": ["Phường Phúc Xá", ...] } }, HCM: {...}, DN: {...} }
let cache = null;

export function loadLocations() {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(WARDS_FILE, "utf-8"));
  }
  return cache;
}

// Bỏ tiền tố hành chính (Quận/Huyện/Thị trấn/Phường/Xã) để so khớp linh hoạt hơn
// với cách địa chỉ thường được ghi trong Master Data (không phải lúc nào cũng có tiền tố)
export function stripAdminPrefix(name) {
  return (name || "")
    .replace(/^(quận|huyện|thị trấn|thị xã|thành phố)\s+/i, "")
    .replace(/^(phường|xã)\s+/i, "")
    .trim();
}

export function isValidCity(cityCode) {
  return Boolean(loadLocations()[cityCode]);
}

export function isValidDistrict(cityCode, districtName) {
  const city = loadLocations()[cityCode];
  return Boolean(city && city.districts[districtName]);
}

export function isValidWard(cityCode, districtName, wardName) {
  const city = loadLocations()[cityCode];
  const wards = city?.districts?.[districtName];
  return Boolean(wards && wards.includes(wardName));
}
