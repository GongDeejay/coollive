export function formatLocation(location) {
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return ''
  }
  const lat = location.lat.toFixed(5)
  const lng = location.lng.toFixed(5)
  const acc = Number.isFinite(location.accuracy)
    ? ` · ±${Math.round(location.accuracy)}m`
    : ''
  return `${lat}, ${lng}${acc}`
}

export function getBrowserLocation(timeoutMs = 10000) {
  if (!('geolocation' in navigator)) {
    return Promise.reject(new Error('geolocation_unavailable'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          captured_at: new Date().toISOString(),
          source: 'browser',
        })
      },
      err => reject(err),
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: 5 * 60 * 1000,
      },
    )
  })
}
