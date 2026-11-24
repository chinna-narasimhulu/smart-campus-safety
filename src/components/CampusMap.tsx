import L from 'leaflet';
import { ExternalLink, MapPin } from 'lucide-react';
import { useEffect, useRef } from 'react';

export interface MapMarkerItem {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  priority?: string;
  isSos?: boolean | number;
  accuracyMeters?: number | null;
}

interface CampusMapProps {
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  markers?: MapMarkerItem[];
  interactivePicker?: boolean;
  onPickLocation?: (lat: number, lng: number) => void;
  heightClass?: string;
  showExternalNav?: boolean;
}

function createPinIcon(color: string) {
  return L.divIcon({
    className: 'campus-map-pin',
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.45);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

export function CampusMap({
  centerLat = 37.4275,
  centerLng = -122.1697,
  zoom = 16,
  markers = [],
  interactivePicker = false,
  onPickLocation,
  heightClass = 'h-72',
  showExternalNav = false,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    if (interactivePicker && onPickLocation) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onPickLocation(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    for (const item of markers) {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
      const color =
        item.isSos || item.priority === 'critical'
          ? '#DC2626'
          : item.priority === 'high'
          ? '#D97706'
          : '#0F172A';

      const marker = L.marker([item.lat, item.lng], { icon: createPinIcon(color) });
      const popupEl = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = item.label;
      popupEl.appendChild(strong);
      if (item.sublabel) {
        const sub = document.createElement('div');
        sub.style.fontSize = '12px';
        sub.style.marginTop = '4px';
        sub.textContent = item.sublabel;
        popupEl.appendChild(sub);
      }
      marker.bindPopup(popupEl);
      marker.addTo(group);

      if (item.accuracyMeters && item.accuracyMeters > 0) {
        L.circle([item.lat, item.lng], {
          radius: Math.min(item.accuracyMeters, 500),
          color: '#0F172A',
          fillColor: '#0F172A',
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(group);
      }
    }

    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], zoom);
    } else if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
    } else {
      map.setView([centerLat, centerLng], zoom);
    }
  }, [markers, centerLat, centerLng, zoom]);

  const primaryMarker = markers[0];

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`w-full ${heightClass} rounded-lg border border-slate-200 overflow-hidden bg-slate-100`}
        aria-label="Campus Incident Map"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
          {interactivePicker
            ? 'Click anywhere on the campus map to set an approximate location pin.'
            : 'GPS coordinates are approximate and require explicit reporter consent.'}
        </span>
        {showExternalNav && primaryMarker && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
              `${primaryMarker.lat},${primaryMarker.lng}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-slate-900 underline hover:text-red-700"
          >
            <span>Open in External Navigation</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
