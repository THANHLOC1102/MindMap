import { normalize } from "./queryParser.js";
import { stripAdminPrefix } from "./locations.js";

// So khớp linh hoạt: thử cả tên đầy đủ ("Quận Ba Đình") lẫn tên đã bỏ tiền tố ("Ba Đình"),
// vì địa chỉ trong Master Data không phải lúc nào cũng ghi kèm "Quận"/"Huyện"/"Phường"/"Xã".
function addressIncludesName(address, name) {
  const n = normalize(address);
  return n.includes(normalize(name)) || n.includes(normalize(stripAdminPrefix(name)));
}

export function filterBusinesses(rows, filters) {
  const { city, districts, wards, segment, keywords } = filters;

  return rows.filter((row) => {
    const cityMatch = !city || normalize(row.thanhPho).includes(normalize(city));

    const districtMatch =
      !districts?.length || districts.some((d) => addressIncludesName(row.diaChi, d));

    const wardMatch = !wards?.length || wards.some((w) => addressIncludesName(row.diaChi, w));

    const segmentMatch =
      !segment ||
      normalize(row.maKH).startsWith(normalize(segment)) ||
      normalize(row.phanKhuc).includes(normalize(segment));

    const keywordMatch =
      !keywords?.length ||
      keywords.every((kw) =>
        normalize(`${row.tenDoanhNghiep} ${row.loaiHinh} ${row.diaChi}`).includes(
          normalize(kw)
        )
      );

    return cityMatch && districtMatch && wardMatch && segmentMatch && keywordMatch;
  });
}

// Trả về quận đầu tiên (theo đúng thứ tự người dùng chọn) khớp với địa chỉ, dùng để sort
function firstMatchingDistrict(address, districtOrder) {
  for (const d of districtOrder) {
    if (addressIncludesName(address, d)) return d;
  }
  return null;
}

// Sắp xếp kết quả theo ĐÚNG thứ tự quận người dùng chọn (không tự sort tăng dần)
export function sortByDistrictOrder(rows, districtOrder) {
  if (!districtOrder?.length) return rows;

  return [...rows].sort((a, b) => {
    const da = firstMatchingDistrict(a.diaChi, districtOrder);
    const db = firstMatchingDistrict(b.diaChi, districtOrder);
    const ia = da === null ? districtOrder.length : districtOrder.indexOf(da);
    const ib = db === null ? districtOrder.length : districtOrder.indexOf(db);
    return ia - ib;
  });
}
