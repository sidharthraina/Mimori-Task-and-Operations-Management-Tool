export interface GeoPosition {
  lat: number
  lng: number
  accuracy: number | null
}

/**
 * Best-effort geolocation — resolves to `null` instead of throwing on denied
 * permission, unsupported browser, or timeout. Soft feature: a missing
 * position should never block a task-photo upload, only skip the geofence
 * flag for that submission.
 */
export function getCurrentPosition(timeoutMs = 6000): Promise<GeoPosition | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    )
  })
}

/** Great-circle distance between two lat/lng points, in meters (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
