import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  lat: number;
  lng: number;
  radiusM: number;
  draggable?: boolean;
  onMove?: (lat: number, lng: number) => void;
  height?: number;
}

export function MiniMap({ lat, lng, radiusM, draggable, onMove, height = 260 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // Inisialisasi peta sekali
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  // Sinkronisasi marker & lingkaran saat koordinat berubah
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isFinite(lat) || !isFinite(lng)) return;

    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });

    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { icon, draggable: !!draggable }).addTo(map);
      if (draggable) {
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current!.getLatLng();
          onMoveRef.current?.(pos.lat, pos.lng);
        });
      }
    } else {
      markerRef.current.setLatLng([lat, lng]);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle([lat, lng], {
        radius: radiusM,
        color: '#C8791A',
        fillColor: '#C8791A',
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng([lat, lng]);
      circleRef.current.setRadius(radiusM);
    }

    map.setView([lat, lng], Math.max(map.getZoom(), 17));
  }, [lat, lng, radiusM, draggable]);

  return <div ref={containerRef} style={{ height, width: '100%' }} className="rounded-lg border border-border z-0" />;
}
