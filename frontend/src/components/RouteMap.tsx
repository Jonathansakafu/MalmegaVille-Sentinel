import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite doesn't resolve Leaflet's default marker image URLs automatically -
// without this the default markers silently render as broken images.
const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const originIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'hue-rotate-[220deg]'
});

async function fetchRoutePath(originLat: number, originLon: number, targetLat: number, targetLon: number): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${targetLon},${targetLat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = await response.json();
    const coords: [number, number][] | undefined = body?.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length === 0) return null;
    // GeoJSON is [lon, lat]; Leaflet wants [lat, lon].
    return coords.map(([lon, lat]) => [lat, lon]);
  } catch {
    return null;
  }
}

function RouteMap({
  targetLat,
  targetLon,
  origin
}: {
  targetLat: number;
  targetLon: number;
  origin: { lat: number; lon: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { attributionControl: true }).setView([targetLat, targetLon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.marker([targetLat, targetLon], { icon: defaultIcon }).addTo(map).bindPopup('PC location');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    routeLayerRef.current?.remove();
    routeLayerRef.current = null;

    if (!origin) {
      map.setView([targetLat, targetLon], 13);
      return;
    }

    let cancelled = false;
    const layerGroup = L.layerGroup().addTo(map);
    routeLayerRef.current = layerGroup;

    L.marker([origin.lat, origin.lon], { icon: originIcon }).addTo(layerGroup).bindPopup('You are here');

    const bounds = L.latLngBounds([
      [targetLat, targetLon],
      [origin.lat, origin.lon]
    ]);

    fetchRoutePath(origin.lat, origin.lon, targetLat, targetLon).then((path) => {
      if (cancelled || !mapRef.current) return;
      const points = path ?? [
        [origin.lat, origin.lon],
        [targetLat, targetLon]
      ];
      L.polyline(points, {
        color: '#7ed957',
        weight: 4,
        opacity: 0.85,
        dashArray: path ? undefined : '8 8'
      }).addTo(layerGroup);
      map.fitBounds(bounds, { padding: [32, 32] });
    });

    return () => {
      cancelled = true;
    };
  }, [origin, targetLat, targetLon]);

  return <div ref={containerRef} className="h-64 w-full" />;
}

export default RouteMap;
