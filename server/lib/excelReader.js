import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_FILE_PATH = path.join(__dirname, "..", "data", "DATA B2B LADO.xlsx");
export const SHEET_NAME = "Master Data";

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v.text) return String(v.text).trim(); // rich text
  if (typeof v === "object" && v.hyperlink) return String(v.text || v.hyperlink).trim();
  return String(v).trim();
}

/**
 * Đọc Sheet "Master Data" (Sheet 1) từ file DATA B2B LADO.xlsx.
 * Giữ nguyên đúng 8 cột theo spec: Mã KH, Tên doanh nghiệp, Phân khúc,
 * Loại hình, Thành phố, Địa chỉ, Sales PIC, Website.
 */
export async function loadMasterData(filePath = DATA_FILE_PATH) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Không tìm thấy sheet "${SHEET_NAME}" trong file Excel.`);
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const maKH = cellText(row.getCell(1));
    if (!maKH) return; // bỏ qua dòng trống

    rows.push({
      maKH,
      tenDoanhNghiep: cellText(row.getCell(2)),
      phanKhuc: cellText(row.getCell(3)),
      loaiHinh: cellText(row.getCell(4)),
      thanhPho: cellText(row.getCell(5)),
      diaChi: cellText(row.getCell(6)),
      salesPIC: cellText(row.getCell(7)),
      website: cellText(row.getCell(8)),
    });
  });

  return rows;
}

// Tìm mã KH lớn nhất hiện có cho một mã Phân khúc (vd "HT" -> 13 nếu có HT013)
export function getMaxSequence(rows, segmentCode) {
  let max = 0;
  const re = new RegExp(`^${segmentCode}(\\d+)$`, "i");
  for (const row of rows) {
    const m = (row.maKH || "").match(re);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > max) max = num;
    }
  }
  return max;
}

// Sinh Mã KH tiếp theo cho một Phân khúc, không trùng với dữ liệu hiện có
export function generateNextCode(rows, segmentCode) {
  const next = getMaxSequence(rows, segmentCode) + 1;
  return `${segmentCode}${String(next).padStart(3, "0")}`;
}

/**
 * Ghi thêm các dòng đã xác nhận vào chính file DATA B2B LADO.xlsx trên server
 * (sheet "Master Data"), GIỮ NGUYÊN các sheet khác (Contact Person, Sales Pipeline, Mã KH)
 * và style/cấu trúc cột hiện có. Không tự ý đổi tên cột, không tạo mã trùng.
 * Trả về toàn bộ danh sách Master Data sau khi ghi (đọc lại từ file).
 */
export async function appendRowsToMasterData(newRows, filePath = DATA_FILE_PATH) {
  if (!newRows?.length) return loadMasterData(filePath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Không tìm thấy sheet "${SHEET_NAME}" trong file Excel.`);
  }

  for (const row of newRows) {
    sheet.addRow([
      row.maKH || "",
      row.tenDoanhNghiep || "",
      row.phanKhuc || "",
      row.loaiHinh || "",
      row.thanhPho || "",
      row.diaChi || "",
      row.salesPIC || "",
      row.website || "",
    ]);
  }

  await workbook.xlsx.writeFile(filePath);
  return loadMasterData(filePath);
}
