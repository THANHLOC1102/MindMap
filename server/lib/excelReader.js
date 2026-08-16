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

// Dịch các tham chiếu ô kiểu "A16" (không có dấu $ trước số dòng) sang dòng mới — dùng để
// chuyển 1 công thức DÙNG CHUNG (shared formula, vd áp dụng cho cả B16:B100) thành công thức
// ĐỘC LẬP cho từng dòng cụ thể. Không đụng tới: tham chiếu tuyệt đối có $ (vd $A$1), hoặc các
// range không có số dòng (vd 'MASTER DATA'!A:B — tham chiếu nguyên cột, không cần dịch).
function shiftFormulaRows(formula, rowDelta) {
  if (!rowDelta) return formula;
  return formula.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (match, colAbs, col, rowAbs, rowNum) => {
    if (rowAbs === "$") return match; // số dòng tuyệt đối -> giữ nguyên, không dịch
    return `${colAbs}${col}${rowAbs}${parseInt(rowNum, 10) + rowDelta}`;
  });
}

// QUAN TRỌNG: ExcelJS có lỗi khi ĐỌC RỒI GHI LẠI (round-trip) 1 file có "shared formula"
// (công thức dùng chung cho nhiều dòng, kiểu Excel hay tự tạo khi bạn kéo/copy công thức
// xuống nhiều dòng) — mỗi lần đọc-ghi lại làm hỏng dần cấu trúc công thức dùng chung đó,
// dẫn tới lỗi Excel báo "formula longer than 8192 characters" dù công thức thực tế rất ngắn.
// File DATA B2B LADO.xlsx có đúng loại công thức này ở sheet Contact Person + Sales Pipeline
// (các công thức VLOOKUP tự động điền Tên doanh nghiệp/Phân khúc... theo Mã KH).
//
// Vì code này phải đọc-ghi lại TOÀN BỘ workbook mỗi khi thêm doanh nghiệp mới (không có cách
// nào ghi CHỈ RIÊNG sheet Master Data mà giữ nguyên các sheet khác với ExcelJS), nên để tránh
// hỏng dần theo thời gian, hàm này CHỦ ĐỘNG "tách" mọi shared formula thành công thức riêng
// cho từng ô (vẫn là công thức Excel bình thường, vẫn tính đúng y hệt) TRƯỚC khi ghi file —
// nhờ vậy ExcelJS không còn phải xử lý phần "shared formula" (đúng chỗ hay lỗi) nữa.
function unshareFormulas(workbook) {
  workbook.eachSheet((sheet) => {
    const masters = new Map(); // địa chỉ ô gốc (vd "B16") -> { formula, row }

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.type !== ExcelJS.ValueType.Formula) return;
        const v = cell.value;

        if (v?.shareType === "shared" && v.formula) {
          // Ô GỐC của công thức dùng chung -> lưu lại để các ô "ăn theo" bên dưới dùng,
          // đồng thời bỏ shareType/ref để bản thân ô này cũng không còn là "shared" nữa.
          masters.set(cell.address, { formula: v.formula, row: cell.row });
          cell.value = { formula: v.formula };
        } else if (v?.sharedFormula) {
          // Ô "ăn theo" công thức gốc -> tự tính công thức riêng cho đúng dòng này.
          const master = masters.get(v.sharedFormula);
          if (master) {
            const rowDelta = cell.row - master.row;
            cell.value = { formula: shiftFormulaRows(master.formula, rowDelta) };
          }
        }
      });
    });
  });
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

  // QUAN TRỌNG: KHÔNG dùng sheet.addRow() ở đây. addRow() ghi nối tiếp theo sheet.rowCount,
  // tức "dòng cuối cùng có định dạng/style" (kể cả dòng trống nhưng đã được kẻ khung/tô màu
  // sẵn cho đẹp) — KHÔNG PHẢI dòng có dữ liệu thật cuối cùng. Nếu file có định dạng sẵn tới
  // dòng 500 dù mới chỉ có 14 dòng dữ liệu, addRow() sẽ ghi bắt đầu từ dòng 501, để lại
  // hàng trăm dòng trống ở giữa (đây chính là lỗi đã xảy ra với file hiện tại của bạn).
  // Sửa: tự quét tìm ĐÚNG dòng có Mã KH (cột 1) khác rỗng cuối cùng, rồi ghi nối tiếp
  // NGAY SAU dòng đó — không quan tâm định dạng/style bên dưới.
  let lastDataRow = 1; // dòng 1 là header, luôn tính là mốc tối thiểu
  sheet.eachRow((row, rowNumber) => {
    const maKH = cellText(row.getCell(1));
    if (maKH) lastDataRow = Math.max(lastDataRow, rowNumber);
  });

  let nextRowNumber = lastDataRow + 1;
  for (const row of newRows) {
    sheet.getRow(nextRowNumber).values = [
      row.maKH || "",
      row.tenDoanhNghiep || "",
      row.phanKhuc || "",
      row.loaiHinh || "",
      row.thanhPho || "",
      row.diaChi || "",
      row.salesPIC || "",
      row.website || "",
    ];
    nextRowNumber += 1;
  }

  // Tách shared formula TRƯỚC khi ghi, né lỗi ExcelJS làm hỏng dần công thức qua mỗi lần lưu.
  unshareFormulas(workbook);

  await workbook.xlsx.writeFile(filePath);
  return loadMasterData(filePath);
}