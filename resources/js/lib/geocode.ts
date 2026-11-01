export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/** Busca de endereço/cidade via Nominatim (OpenStreetMap). */
export async function searchPlaces(query: string): Promise<Place[]> {
  if (query.trim().length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=pt-BR&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return data.map((d) => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
}
