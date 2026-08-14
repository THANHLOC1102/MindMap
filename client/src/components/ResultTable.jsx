import { useEffect, useState } from "react";

const PAGE_SIZE = 10;

export default function ResultTable({ results, source }) {
  const [page, setPage] = useState(1);

  // Mỗi khi có bộ kết quả mới (search khác) thì quay lại trang 1
  useEffect(() => {
    setPage(1);
  }, [results]);

  if (!results.length) {
    return <div className="empty-state">Chưa có kết quả. Hãy nhập yêu cầu tìm kiếm ở trên.</div>;
  }

  const isGoogleMode = source !== "master-data";
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = results.slice(start, start + PAGE_SIZE);

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Mã KH</th>
            <th>Tên doanh nghiệp</th>
            <th>Phân khúc</th>
            <th>Loại hình</th>
            <th>Thành phố</th>
            <th>Địa chỉ</th>
            <th>Sales PIC</th>
            <th>Website</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, idx) => (
            <tr key={row.maKH || row.placeId || start + idx}>
              <td>{row.maKH || "—"}</td>
              <td>
                {row.tenDoanhNghiep}
                {isGoogleMode && row.needsReview && (
                  <span className="needs-review">cần kiểm tra</span>
                )}
              </td>
              <td>{row.segmentLabel || row.phanKhuc || "—"}</td>
              <td>{row.loaiHinh}</td>
              <td>{row.thanhPho}</td>
              <td>{row.diaChi}</td>
              <td>{row.salesPIC}</td>
              <td className="website">
                {row.website ? (
                  <a href={row.website} target="_blank" rel="noreferrer">
                    Link
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn-page"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            ← Trang trước
          </button>
          <span className="pagination-info">
            Trang {safePage}/{totalPages} — {results.length} kết quả (hiển thị {start + 1}
            {"-"}
            {Math.min(start + PAGE_SIZE, results.length)})
          </span>
          <button
            className="btn-page"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            Trang sau →
          </button>
        </div>
      )}
    </>
  );
}
