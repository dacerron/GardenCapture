let mapsPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  // Type-safe presence check; no `any`
  if (window.google?.maps) return Promise.resolve();

  if (!mapsPromise) {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) throw new Error("Missing VITE_GOOGLE_MAPS_API_KEY");

    mapsPromise = new Promise((resolve, reject) => {
      // avoid double-injecting the script
      if (document.querySelector('script[data-google-maps]')) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.async = true;
      script.setAttribute("data-google-maps", "true");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google Maps"));
      document.head.appendChild(script);
    });
  }
  return mapsPromise;
}
