import SegmentSelect from "./SegmentSelect.jsx";
import LocationSelect from "./LocationSelect.jsx";

export default function SearchBox({
  location,
  onLocationChange,
  keywordText,
  onKeywordTextChange,
  onSearchMasterData,
  onSearchGoogle,
  loading,
  segments,
  segmentCode,
  onSegmentCodeChange,
  customSegment,
  onCustomSegmentChange,
}) {
  function handleKeyDown(e) {
    if (e.key === "Enter") onSearchMasterData();
  }

  return (
    <div>
      <SegmentSelect
        segments={segments}
        segmentCode={segmentCode}
        onSegmentCodeChange={onSegmentCodeChange}
        customSegment={customSegment}
        onCustomSegmentChange={onCustomSegmentChange}
      />

      <LocationSelect value={location} onChange={onLocationChange} />

      <div className="search-box">
        <input
          type="text"
          placeholder='Từ khóa thêm (không cần nhập thành phố/quận/phường nữa), vd: "5 sao"'
          value={keywordText}
          onChange={(e) => onKeywordTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="mode-buttons">
        <button className="btn-primary" onClick={onSearchMasterData} disabled={loading}>
          Tìm trong Master Data
        </button>
        <button className="btn-secondary" onClick={onSearchGoogle} disabled={loading}>
          Tìm thêm (tìm địa điểm mới)
        </button>
      </div>
    </div>
  );
}
