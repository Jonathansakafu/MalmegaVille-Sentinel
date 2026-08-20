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

export type RouteOption = {
  points: [number, number][];
  distanceKm: number;
  durationMin: number;
};

export async function fetchRouteOptions(
  originLat: number,
  originLon: number,
  targetLat: number,
  targetLon: number
): Promise<RouteOption[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${targetLon},${targetLat}?overview=full&geometries=geojson&alternatives=true`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const body = await response.json();
    const routes: any[] = body?.routes ?? [];
    return routes.map((route) => ({
      // GeoJSON is [lon, lat]; Leaflet wants [lat, lon].
      points: (route.geometry?.coordinates ?? []).map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]),
      distanceKm: (route.distance ?? 0) / 1000,
      durationMin: (route.duration ?? 0) / 60
    }));
  } catch {
    return [];
  }
}

function RouteMap({
  targetLat,
  targetLon,
  origin,
  routes,
  selectedRouteIndex,
  onSelectRoute
}: {
  targetLat: number;
  targetLon: number;
  origin: { lat: number; lon: number } | null;
  routes: RouteOption[];
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const routeLinesRef = useRef<L.Polyline[]>([]);
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;

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

  // Moves the origin marker on every position update without re-fetching
  // routes or re-fitting the view, so live tracking feels smooth rather than
  // jumpy - route redraw/fit only happens when `routes` itself changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!origin) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }

    if (originMarkerRef.current) {
      originMarkerRef.current.setLatLng([origin.lat, origin.lon]);
    } else {
      originMarkerRef.current = L.marker([origin.lat, origin.lon], { icon: originIcon }).addTo(map).bindPopup('You are here');
    }
  }, [origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    routeLinesRef.current.forEach((line) => line.remove());
    routeLinesRef.current = [];

    if (routes.length === 0 || !origin) return;

    routes.forEach((route, index) => {
      const isSelected = index === selectedRouteIndex;
      const line = L.polyline(route.points, {
        color: isSelected ? '#7ed957' : '#64748b',
        weight: isSelected ? 5 : 3,
        opacity: isSelected ? 0.9 : 0.5,
        dashArray: route.points.length === 0 ? '8 8' : undefined
      }).addTo(map);
      line.on('click', () => onSelectRouteRef.current(index));
      if (!isSelected) line.bringToBack();
      routeLinesRef.current.push(line);
    });

    const bounds = L.latLngBounds([
      [targetLat, targetLon],
      [origin.lat, origin.lon]
    ]);
    map.fitBounds(bounds, { padding: [32, 32] });
    // Only re-fit when the route set itself changes, not on every live position tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, selectedRouteIndex]);

  return <div ref={containerRef} className="h-64 w-full" />;
}

export default RouteMap;
