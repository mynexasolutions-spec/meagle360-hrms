/** Current browser position as { latitude, longitude, accuracy_m }, or rejects with a readable Error. */
export function getCurrentPosition(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported by this browser.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      }),
      (err) => reject(new Error(
        err.code === 1
          ? 'Location permission denied. Please allow location access in your browser.'
          : 'Could not get your location. Please try again.',
      )),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
  });
}
