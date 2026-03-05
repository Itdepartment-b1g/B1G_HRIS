/**
 * Haversine formula: distance in meters between two lat/lng points
 */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface WorkLocation {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  allow_anywhere: boolean;
}

/**
 * Check if user (lat, lng) is within any of the work locations.
 * allow_anywhere locations always pass.
 */
export function isWithinWorkLocation(
  userLat: number,
  userLng: number,
  locations: WorkLocation[]
): { inside: boolean; matchedLocation?: WorkLocation } {
  for (const loc of locations) {
    if (loc.allow_anywhere) {
      return { inside: true, matchedLocation: loc };
    }
    if (loc.latitude != null && loc.longitude != null && loc.radius_meters != null) {
      const dist = distanceMeters(userLat, userLng, loc.latitude, loc.longitude);
      if (dist <= loc.radius_meters) {
        return { inside: true, matchedLocation: loc };
      }
    }
  }
  return { inside: false };
}
