const CUSTOM_VALUE = "__custom__";

export default function SegmentSelect({ segments, segmentCode, onSegmentCodeChange, customSegment, onCustomSegmentChange }) {
  const isCustom = segmentCode === CUSTOM_VALUE;

  return (
    <div className="segment-select">
      <label>
        Phân khúc mong muốn
        <select
          value={segmentCode}
          onChange={(e) => onSegmentCodeChange(e.target.value)}
        >
          <option value="">— Tự nhận diện từ câu tìm kiếm —</option>
          {Object.entries(segments).map(([code, label]) => (
            <option key={code} value={code}>
              {label} ({code})
            </option>
          ))}
          <option value={CUSTOM_VALUE}>Khác (không có trong bảng mã)...</option>
        </select>
      </label>

      {isCustom && (
        <input
          type="text"
          className="segment-custom-input"
          placeholder='Nhập loại hình muốn tìm, vd: "phòng gym", "trường mầm non"'
          value={customSegment}
          onChange={(e) => onCustomSegmentChange(e.target.value)}
        />
      )}
      {isCustom && (
        <div className="segment-hint">
          Phân khúc này không có trong bảng mã (sheet "Mã KH") nên khi lưu vào Master Data,
          cột Phân khúc và Mã KH sẽ để trống — bạn tự bổ sung sau nếu cần.
        </div>
      )}
    </div>
  );
}

export { CUSTOM_VALUE };
