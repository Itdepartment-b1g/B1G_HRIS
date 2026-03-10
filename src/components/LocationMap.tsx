import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { WorkLocation } from '@/lib/geoUtils';

// Fix default marker icon in Leaflet (broken with bundlers)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface LocationMapProps {
  userLocation: { lat: number; lng: number } | null;
  workLocations: WorkLocation[];
  withinRadius: boolean | null;
  className?: string;
  /** True when the active work-location allows time in/out from anywhere */
  isAnywhere?: boolean;
}

function getInitialCenter(userLocation: { lat: number; lng: number } | null, workLocations: WorkLocation[]) {
  if (userLocation) return [userLocation.lat, userLocation.lng] as [number, number];
  const first = workLocations.find((l) => l.latitude != null && l.longitude != null);
  if (first) return [first.latitude!, first.longitude!] as [number, number];
  return [14.5995, 120.9842] as [number, number]; // Manila fallback
}

export function LocationMap({ userLocation, workLocations, withinRadius, className = '', isAnywhere = false }: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const center = getInitialCenter(userLocation, workLocations);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView(center, 16);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current = [];

    const bounds: L.LatLngExpression[] = [];

    // Work location circles (radius)
    workLocations.forEach((loc) => {
      if (loc.allow_anywhere || loc.latitude == null || loc.longitude == null || loc.radius_meters == null) return;

      const circle = L.circle([loc.latitude, loc.longitude], {
        radius: loc.radius_meters,
        color: withinRadius ? '#22c55e' : '#94a3b8',
        fillColor: withinRadius ? '#22c55e' : '#94a3b8',
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);

      const centerMarker = L.circleMarker([loc.latitude, loc.longitude], {
        radius: 6,
        color: '#0f172a',
        fillColor: '#64748b',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);

      const label = L.tooltip({ permanent: true, direction: 'top', offset: [0, -10] })
        .setContent(`<strong>${loc.name}</strong><br/>${loc.radius_meters}m radius`)
        .setLatLng([loc.latitude, loc.longitude]);
      centerMarker.bindTooltip(label).openTooltip();

      bounds.push([loc.latitude, loc.longitude]);
      layersRef.current.push(circle, centerMarker);
    });

    // User location marker (only when we have user position)
    if (userLocation) {
      bounds.unshift([userLocation.lat, userLocation.lng]);
      const userMarker = L.marker([userLocation.lat, userLocation.lng]).addTo(map);
      const statusText = isAnywhere
        ? '✓ Anywhere allowed'
        : withinRadius === true
        ? '✓ Within radius'
        : withinRadius === false
        ? '✗ Outside radius'
        : 'Checking...';
      userMarker.bindTooltip(
        `<strong>You</strong><br/>${statusText}`,
        { permanent: true, direction: 'top', offset: [0, -25] }
      ).openTooltip();
      layersRef.current.push(userMarker);
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds as L.LatLngBoundsLiteral, { padding: [30, 30], maxZoom: 17 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0] as [number, number], 16);
    } else {
      map.setView(center, 16);
    }
  }, [userLocation, workLocations, withinRadius, center, isAnywhere]);

  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground mb-1.5 sm:mb-2 hidden sm:block">
        {isAnywhere ? 'Map shows your time in/out location' : 'Map shows work location radius and your position'}
      </p>
      <div ref={mapRef} className="h-36 sm:h-48 w-full rounded-md border bg-muted/30 z-0" />
    </div>
  );
}
