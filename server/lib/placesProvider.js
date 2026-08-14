// Chọn nhà cung cấp tìm địa điểm qua biến môi trường PLACES_PROVIDER.
// Mặc định dùng Vietmap (Google Places bị chặn với billing account Việt Nam).
// Đặt PLACES_PROVIDER=google trong server/.env nếu sau này bạn có billing account
// nước ngoài hợp lệ và muốn quay lại dùng Google Places API.

import { searchVietmapPlaces, isVietmapConfigured, VIETMAP_ATTRIBUTION } from "./vietmapPlaces.js";
import { searchGooglePlaces, isGooglePlacesConfigured, GOOGLE_ATTRIBUTION } from "./googlePlaces.js";

function currentProvider() {
  const p = (process.env.PLACES_PROVIDER || "vietmap").toLowerCase();
  return p === "google" ? "google" : "vietmap";
}

export function getProviderName() {
  return currentProvider();
}

export function isPlacesConfigured() {
  return currentProvider() === "google" ? isGooglePlacesConfigured() : isVietmapConfigured();
}

export function getAttribution() {
  return currentProvider() === "google" ? GOOGLE_ATTRIBUTION : VIETMAP_ATTRIBUTION;
}

export async function searchPlaces(filters) {
  return currentProvider() === "google" ? searchGooglePlaces(filters) : searchVietmapPlaces(filters);
}
