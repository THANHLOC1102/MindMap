import { useEffect, useState } from "react";
import SearchBox from "./components/SearchBox.jsx";
import ResultTable from "./components/ResultTable.jsx";
import FilterPanel from "./components/FilterPanel.jsx";
import { CUSTOM_VALUE } from "./components/SegmentSelect.jsx";
import { emptyLocationValue } from "./components/LocationSelect.jsx";

export default function App() {
  const [location, setLocation] = useState(emptyLocationValue());
  const [keywordText, setKeywordText] = useState("");
  const [segments, setSegments] = useState({});
  const [segmentCode, setSegmentCode] = useState("");
  const [customSegment, setCustomSegment] = useState("");
  const [results, setResults] = useState([]);
  const [filters, setFilters] = useState(null);
  const [source, setSource] = useState("master-data");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusNote, setStatusNote] = useState("");

  useEffect(() => {
    fetch("/api/places/segments")
      .then((res) => res.json())
      .then((data) => setSegments(data.segments || {}))
      .catch(() => {});
  }, []);

  function effectiveSegmentCode() {
    return segmentCode === CUSTOM_VALUE ? "" : segmentCode;
  }
  function effectiveCustomSegment() {
    return segmentCode === CUSTOM_VALUE ? customSegment : "";
  }

  function locationPayload() {
    return {
      city: location.city,
      districts: location.districts,
      wardsByDistrict: location.wardsByDistrict,
    };
  }

  async function searchMasterData() {
    setLoading(true);
    setError("");
    setStatusNote("");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...locationPayload(),
          segmentCode: effectiveSegmentCode(),
          keywordText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");

      setResults(data.results);
      setFilters(data.filters);
      setSource("master-data");
      setStatusNote(`Tìm thấy ${data.total} kết quả trong Master Data.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function searchGoogle() {
    if (!location.city) {
      setError("Vui lòng chọn Thành phố trước khi tìm địa điểm mới.");
      return;
    }
    if (!location.districts.length) {
      setError(
        "Vui lòng chọn ít nhất 1 Quận/Huyện trước khi tìm địa điểm mới.",
      );
      return;
    }
    setLoading(true);
    setError("");
    setStatusNote("");
    try {
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...locationPayload(),
          segmentCode: effectiveSegmentCode(),
          customSegment: effectiveCustomSegment(),
          keywordText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");

      setResults(data.newBusinesses);
      setSource(data.source || "places-api");
      const segmentNote = data.resolvedSegment?.code
        ? `Phân khúc: ${data.resolvedSegment.label} (${data.resolvedSegment.code}).`
        : `Phân khúc "${data.resolvedSegment?.segmentText || ""}" không có trong bảng mã — sẽ để trống Mã KH/Phân khúc khi lưu.`;
      setStatusNote(
        `Tìm được ${data.total} doanh nghiệp mới (đã bỏ qua ${data.duplicatesSkipped} trùng với Master Data). ${segmentNote} Vui lòng kiểm tra và bấm "Xác nhận & lưu" trước khi thêm vào Master Data.`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndSave() {
    if (!results.length || source === "master-data") return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/places/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: results }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");

      setStatusNote(
        `Đã lưu ${data.confirmed.length} doanh nghiệp mới vào Master Data (DATA B2B LADO.xlsx trên server, tổng cộng ${data.total} dòng).`,
      );
      setResults(data.confirmed);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
    if (!results.length) return;
    try {
      const res = await fetch("/api/search/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
      if (!res.ok) throw new Error("Xuất Excel thất bại");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "DATA B2B LADO.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>MapAgent</h1>
        <p>Tìm kiếm, lọc và bổ sung dữ liệu doanh nghiệp từ Vietmap.</p>
      </div>

      <SearchBox
        location={location}
        onLocationChange={setLocation}
        keywordText={keywordText}
        onKeywordTextChange={setKeywordText}
        onSearchMasterData={searchMasterData}
        onSearchGoogle={searchGoogle}
        loading={loading}
        segments={segments}
        segmentCode={segmentCode}
        onSegmentCodeChange={setSegmentCode}
        customSegment={customSegment}
        onCustomSegmentChange={setCustomSegment}
      />

      {source === "master-data" && <FilterPanel filters={filters} />}
      {statusNote && <div className="status-line">{statusNote}</div>}
      {error && <div className="error-banner">{error}</div>}

      <div className="results-panel">
        <div className="results-header">
          <h2>
            Kết quả{" "}
            {source !== "master-data" ? "(Chưa lưu vào Master Data)" : ""}
          </h2>
          <div className="results-actions">
            {source !== "master-data" && (
              <button
                className="btn-primary"
                onClick={confirmAndSave}
                disabled={!results.length || loading}
              >
                Xác nhận &amp; lưu vào Master Data
              </button>
            )}
            <button
              className="btn-export"
              onClick={exportExcel}
              disabled={!results.length}
            >
              Xuất Excel
            </button>
          </div>
        </div>
        <ResultTable results={results} source={source} />
        {source !== "master-data" && results.length > 0 && (
          <div className="preview-note">
            * Mã KH hiển thị ở trên là mã dự kiến — chỉ chính thức sau khi bấm
            "Xác nhận &amp; lưu vào Master Data".
          </div>
        )}
      </div>
    </div>
  );
}
