import ExcelJS from "exceljs";
import { SEGMENT_CODES } from "./segmentCodes.js";

// Cấu trúc + định dạng cột PHẢI khớp với file mẫu DATA B2B LADO.xlsx.
// File xuất ra luôn có đủ 4 sheet giống file gốc: Master Data, Contact Person,
// Sales Pipeline, Mã KH — không chỉ riêng Master Data.

const MASTER_COLUMNS = [
  { header: "Mã KH", key: "maKH", width: 6.13 },
  { header: "Tên doanh nghiệp", key: "tenDoanhNghiep", width: 29.5 },
  { header: "Phân khúc", key: "phanKhuc", width: 8.88 },
  { header: "Loại hình", key: "loaiHinh", width: 7.88 },
  { header: "Thành phố", key: "thanhPho", width: 9.0 },
  { header: "Địa chỉ", key: "diaChi", width: 45.13 },
  { header: "Sales PIC", key: "salesPIC", width: 8.38 },
  { header: "Website", key: "website", width: 8.5 },
];

const CONTACT_COLUMNS = [
  { header: "Mã KH", key: "maKH", width: 6.13 },
  { header: "Tên doanh nghiệp", key: "tenDoanhNghiep", width: 29.5 },
  { header: "Người liên hệ", key: "nguoiLienHe", width: 18 },
  { header: "Chức vụ", key: "chucVu", width: 14 },
  { header: "Bộ phận", key: "boPhan", width: 14 },
  { header: "Email", key: "email", width: 20 },
  { header: "Điện thoại", key: "dienThoai", width: 14 },
];

const PIPELINE_COLUMNS = [
  { header: "Mã KH", key: "maKH", width: 6.13 },
  { header: "Tên doanh nghiệp", key: "tenDoanhNghiep", width: 29.5 },
  { header: "Phân khúc", key: "phanKhuc", width: 8.88 },
  { header: "Sales PIC", key: "salesPIC", width: 8.38 },
  { header: "Người liên hệ", key: "nguoiLienHe", width: 18 },
  { header: "Email", key: "email", width: 20 },
  { header: "Điện thoại", key: "dienThoai", width: 14 },
  { header: "Sản phẩm", key: "sanPham", width: 14 },
  { header: "Giá trị dự kiến", key: "giaTriDuKien", width: 14 },
  { header: "Ngày tiếp cận", key: "ngayTiepCan", width: 14 },
  { header: "Follow-up", key: "followUp", width: 12 },
  { header: "Stage", key: "stage", width: 10 },
  { header: "Xác suất", key: "xacSuat", width: 10 },
  { header: "Doanh thu kỳ vọng", key: "doanhThuKyVong", width: 16 },
];

const MAKH_COLUMNS = [
  { header: "Mã", key: "ma", width: 8 },
  { header: "Phân khúc", key: "phanKhuc", width: 32 },
];

function addHeaderRow(sheet, columns) {
  const row = sheet.addRow(columns.map((c) => c.header));
  row.eachCell((cell) => {
    cell.font = { name: "Arial", bold: true, color: { argb: "FF000000" } };
  });
}

/**
 * Xuất kết quả (Master Data hiện có hoặc doanh nghiệp mới tìm được) ra file Excel
 * ĐỦ 4 SHEET đúng cấu trúc file mẫu DATA B2B LADO.xlsx, không chỉ riêng Master Data.
 * `rows` phải đã có `maKH`/`phanKhuc` được gán sẵn (nếu Phân khúc hợp lệ) trước khi gọi.
 */
export async function exportToExcel(rows) {
  const workbook = new ExcelJS.Workbook();

  // --- Sheet 1: Master Data ---
  const masterSheet = workbook.addWorksheet("Master Data");
  masterSheet.columns = MASTER_COLUMNS.map(({ key, width }) => ({ key, width }));
  addHeaderRow(masterSheet, MASTER_COLUMNS);
  for (const row of rows) {
    masterSheet.addRow({
      maKH: row.maKH || "",
      tenDoanhNghiep: row.tenDoanhNghiep || "",
      phanKhuc: row.phanKhuc || "",
      loaiHinh: row.loaiHinh || "",
      thanhPho: row.thanhPho || "",
      diaChi: row.diaChi || "",
      salesPIC: row.salesPIC || "",
      website: row.website || "",
    });
  }

  // --- Sheet 2: Contact Person (đúng theo mẫu: chỉ điền sẵn Mã KH + Tên doanh nghiệp,
  // các cột liên hệ để trống vì chưa có thông tin) ---
  const contactSheet = workbook.addWorksheet("Contact Person");
  contactSheet.columns = CONTACT_COLUMNS.map(({ key, width }) => ({ key, width }));
  addHeaderRow(contactSheet, CONTACT_COLUMNS);
  for (const row of rows) {
    contactSheet.addRow({
      maKH: row.maKH || "",
      tenDoanhNghiep: row.tenDoanhNghiep || "",
    });
  }

  // --- Sheet 3: Sales Pipeline (chỉ tạo header, chưa có dữ liệu pipeline cho DN mới) ---
  const pipelineSheet = workbook.addWorksheet("Sales Pipeline");
  pipelineSheet.columns = PIPELINE_COLUMNS.map(({ key, width }) => ({ key, width }));
  addHeaderRow(pipelineSheet, PIPELINE_COLUMNS);

  // --- Sheet 4: Mã KH (bảng mã cố định, giữ nguyên như spec) ---
  const makhSheet = workbook.addWorksheet("Mã KH");
  makhSheet.columns = MAKH_COLUMNS.map(({ key, width }) => ({ key, width }));
  addHeaderRow(makhSheet, MAKH_COLUMNS);
  for (const [code, label] of Object.entries(SEGMENT_CODES)) {
    makhSheet.addRow({ ma: code, phanKhuc: label });
  }

  return workbook.xlsx.writeBuffer();
}
