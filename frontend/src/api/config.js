const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export function apiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }

  return `${API_BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}