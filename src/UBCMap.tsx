import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "./lib/loadGoogleMaps";

export default function UBCMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null); // holds the Map instance

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadGoogleMaps();
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: 49.2606, lng: -123.2460 }, // UBC Vancouver
          zoom: 13,
          mapTypeId: "terrain",
          streetViewControl: false,
          fullscreenControl: true,
        });
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current = null; // release reference
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "60vh", borderRadius: 12 }}
    />
  );
}
