// Kiểm tra trùng dữ liệu trước khi thêm doanh nghiệp mới (từ Google) vào Master Data.
// Thứ tự kiểm tra theo spec: placeId -> tên+địa chỉ -> tên chuẩn hóa -> website.

export function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeAddress(address) {
  return normalizeName(address);
}

function normalizeWebsite(url) {
  if (!url) return "";
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .trim();
}

/**
 * Trả về { isDuplicate, matchedRow, reason } khi đối chiếu 1 candidate (từ Google Places)
 * với danh sách Master Data hiện có.
 */
export function checkDuplicate(candidate, masterRows, placeIdIndex = {}) {
  // 1. placeId (nếu hệ thống có lưu/được phép sử dụng)
  if (candidate.placeId && placeIdIndex[candidate.placeId]) {
    return {
      isDuplicate: true,
      matchedRow: placeIdIndex[candidate.placeId],
      reason: "placeId",
    };
  }

  const candName = normalizeName(candidate.name);
  const candAddr = normalizeAddress(candidate.address);
  const candWebsite = normalizeWebsite(candidate.website);

  for (const row of masterRows) {
    const rowName = normalizeName(row.tenDoanhNghiep);
    const rowAddr = normalizeAddress(row.diaChi);
    const rowWebsite = normalizeWebsite(row.website);

    // 2. Tên + địa chỉ
    if (candName && candAddr && rowName === candName && rowAddr === candAddr) {
      return { isDuplicate: true, matchedRow: row, reason: "name+address" };
    }

    // 3. Tên chuẩn hóa
    if (candName && rowName && rowName === candName) {
      return { isDuplicate: true, matchedRow: row, reason: "name" };
    }

    // 4. Website
    if (candWebsite && rowWebsite && rowWebsite === candWebsite) {
      return { isDuplicate: true, matchedRow: row, reason: "website" };
    }
  }

  return { isDuplicate: false, matchedRow: null, reason: null };
}

// Lọc ra danh sách doanh nghiệp mới (không trùng) từ danh sách candidate Google Places
export function dedupeAgainstMasterData(candidates, masterRows) {
  const uniqueNew = [];
  const duplicates = [];

  for (const candidate of candidates) {
    const result = checkDuplicate(candidate, masterRows);
    if (result.isDuplicate) {
      duplicates.push({ candidate, ...result });
    } else {
      uniqueNew.push(candidate);
    }
  }

  return { uniqueNew, duplicates };
}
