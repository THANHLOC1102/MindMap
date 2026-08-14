export default function FilterPanel({ filters }) {
  if (!filters) return null;

  const { segment, city, districts, keywords } = filters;
  const hasAny = segment || city || districts?.length || keywords?.length;
  if (!hasAny) return null;

  return (
    <div className="status-line">
      Đã hiểu:{" "}
      {segment && <>Phân khúc <b>{segment}</b> · </>}
      {city && <>Thành phố <b>{city}</b> · </>}
      {districts?.length > 0 && (
        <>
          Quận (theo thứ tự nhập) <b>{districts.join(", ")}</b> ·{" "}
        </>
      )}
      {keywords?.length > 0 && <>Từ khóa <b>{keywords.join(", ")}</b></>}
    </div>
  );
}
