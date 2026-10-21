/**
 * Get current browser position as { latitude, longitude, accuracy_m }.
 * Tries high-accuracy (GPS) first; if that times out or fails (common on laptops/PCs),
 * automatically falls back to low-accuracy (Wi-Fi / IP-based geolocation).
 */
export function getCurrentPosition(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Geolocation is not supported by this browser.'));
    }

    const onPos = (pos) => resolve({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy,
    });

    // 1st attempt: High accuracy
    navigator.geolocation.getCurrentPosition(
      onPos,
      (err) => {
        // If permission explicitly denied by user, don't retry
        if (err.code === 1) {
          return reject(new Error('Location permission denied. Please allow location access in browser site settings.'));
        }

        // 2nd attempt: Low accuracy (network / Wi-Fi fallback for laptops/desktops)
        navigator.geolocation.getCurrentPosition(
          onPos,
          (err2) => {
            let msg = 'Could not get your location.';
            if (err2.code === 1) {
              msg = 'Location permission denied. Please allow location access in your browser.';
            } else if (err2.code === 2) {
              msg = 'Device location is turned off. Please turn on Location in Windows/device settings.';
            } else if (err2.code === 3) {
              msg = 'Location request timed out. Please check your internet/GPS signal and try again.';
            }
            reject(new Error(msg));
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      },
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    );
  });
}
