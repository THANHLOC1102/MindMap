import { useEffect, useState } from "react";

const CITY_LABELS = { HCM: "Hồ Chí Minh", HN: "Hà Nội", DN: "Đà Nẵng" };

/**
 * Chọn địa điểm bắt buộc theo dropdown: Thành phố -> Quận/Huyện (chọn nhiều) ->
 * Phường/Xã (chọn nhiều, theo từng quận đã chọn). Không cho gõ tự do nữa,
 * tránh sai/thiếu dấu tên quận/phường khi gửi lên Vietmap.
 *
 * value: { city: "HCM", districts: ["Quận 1", ...], wardsByDistrict: { "Quận 1": ["Phường Bến Nghé"] } }
 * onChange(value)
 */
export default function LocationSelect({ value, onChange }) {
  const [locations, setLocations] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/places/locations")
      .then((res) => res.json())
      .then((data) => setLocations(data.locations || {}))
      .catch(() => setError("Không tải được danh sách Quận/Huyện/Phường."));
  }, []);

  const { city, districts, wardsByDistrict } = value;

  function setCity(newCity) {
    onChange({ city: newCity, districts: [], wardsByDistrict: {} });
  }

  function toggleDistrict(district) {
    const isSelected = districts.includes(district);
    if (isSelected) {
      const nextWards = { ...wardsByDistrict };
      delete nextWards[district];
      onChange({
        city,
        districts: districts.filter((d) => d !== district),
        wardsByDistrict: nextWards,
      });
    } else {
      onChange({ city, districts: [...districts, district], wardsByDistrict });
    }
  }

  function toggleWard(district, ward) {
    const current = wardsByDistrict[district] || [];
    const isSelected = current.includes(ward);
    const nextForDistrict = isSelected
      ? current.filter((w) => w !== ward)
      : [...current, ward];
    onChange({
      city,
      districts,
      wardsByDistrict: { ...wardsByDistrict, [district]: nextForDistrict },
    });
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!locations)
    return (
      <div className="location-select-loading">
        Đang tải danh sách địa điểm...
      </div>
    );

  const cityData = city ? locations[city] : null;
  const districtOptions = cityData ? Object.keys(cityData.districts) : [];
  const hasWardData =
    cityData &&
    districtOptions.length > 0 &&
    cityData.districts[districtOptions[0]]?.length > 0;

  return (
    <div className="location-select">
      <label className="location-city">
        Thành phố
        <select value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">— Chọn thành phố —</option>
          {Object.keys(locations)
            .filter(
              (code) =>
                Object.keys(locations[code]?.districts || {}).length > 0,
            )
            .map((code) => (
              <option key={code} value={code}>
                {locations[code]?.name || CITY_LABELS[code] || code}
              </option>
            ))}
        </select>
      </label>

      {city && districtOptions.length === 0 && (
        <div className="location-hint">
          Chưa có dữ liệu Quận/Huyện/Phường cho {CITY_LABELS[city] || city}. Vui
          lòng bổ sung file <code>server/data/wards.json</code>.
        </div>
      )}

      {city && districtOptions.length > 0 && (
        <div className="location-districts">
          <div className="location-group-label">
            Quận/Huyện (chọn 1 hoặc nhiều)
          </div>
          <div className="checkbox-grid">
            {districtOptions.map((d) => (
              <label key={d} className="checkbox-item">
                <input
                  type="checkbox"
                  checked={districts.includes(d)}
                  onChange={() => toggleDistrict(d)}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
      )}

      {districts.length > 0 && (
        <div className="location-wards">
          {districts.map((d) => {
            const wardOptions = cityData.districts[d] || [];
            if (!wardOptions.length) return null;
            return (
              <div key={d} className="location-ward-group">
                <div className="location-group-label">
                  Phường/Xã thuộc {d}{" "}
                  <span className="optional-hint">
                    (để trống = tìm cả quận)
                  </span>
                </div>
                <div className="checkbox-grid">
                  {wardOptions.map((w) => (
                    <label key={w} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={(wardsByDistrict[d] || []).includes(w)}
                        onChange={() => toggleWard(d, w)}
                      />
                      {w}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {city && !hasWardData && districtOptions.length > 0 && (
        <div className="location-hint">
          Quận/huyện đã chọn chưa có dữ liệu phường/xã chi tiết — hệ thống sẽ
          tìm theo cả quận.
        </div>
      )}
    </div>
  );
}

export function emptyLocationValue() {
  return { city: "", districts: [], wardsByDistrict: {} };
}
