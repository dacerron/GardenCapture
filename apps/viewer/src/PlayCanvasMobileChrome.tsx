import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PLAYCANVAS_PERF_PRESET_LABELS } from "@soil/playcanvas-viewer";
import type { PerformancePreset, SceneInfo } from "@soil/shared/three/ScreenSpace";

const MOBILE_PERF_PRESETS: PerformancePreset[] = ["low", "medium", "high"];

type PlayCanvasMobileChromeProps = {
  sceneInfo: SceneInfo;
  performancePreset: PerformancePreset;
  onPerformancePresetChange: (preset: PerformancePreset) => void;
  onReset: () => void;
};

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return coarse;
}

export default function PlayCanvasMobileChrome({
  sceneInfo,
  performancePreset,
  onPerformancePresetChange,
  onReset,
}: PlayCanvasMobileChromeProps) {
  const isCoarse = useCoarsePointer();
  const [placeCardOpen, setPlaceCardOpen] = useState(false);

  if (!isCoarse) return null;

  const title = sceneInfo.title?.trim() || "Untitled field";
  const location = sceneInfo.location?.trim() || "Location unavailable";
  const description = sceneInfo.description?.trim() || "No description available yet.";

  return (
    <>
      <div className="playCanvasMobileTopBar" aria-hidden={false}>
        <Link to="/" className="playCanvasMobileRoundBtn" aria-label="Back to home">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 4.5 8 12l7.5 7.5" />
          </svg>
        </Link>
        <div className="playCanvasMobileTopBarActions">
          <button
            type="button"
            className="playCanvasMobileRoundBtn"
            aria-label="Reset camera"
            onClick={onReset}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2.8v3" />
              <path d="M12 18.2v3" />
              <path d="M2.8 12h3" />
              <path d="M18.2 12h3" />
              <path d="M4.9 4.9l2.1 2.1" />
              <path d="M17 17l2.1 2.1" />
            </svg>
          </button>
          <button
            type="button"
            className="playCanvasMobileRoundBtn"
            aria-label="Scene information"
            aria-pressed={placeCardOpen}
            onClick={() => setPlaceCardOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 10.5v6" />
              <path d="M12 7.5h.01" />
            </svg>
          </button>
        </div>
      </div>

      {placeCardOpen ? (
        <div className="playCanvasMobilePlaceCard" role="region" aria-label="Scene information">
          <div className="playCanvasMobilePlaceHandle" aria-hidden="true" />
          <h2 className="playCanvasMobilePlaceTitle">{title}</h2>
          <p className="playCanvasMobilePlaceLocation">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span>{location}</span>
          </p>
          <p className="playCanvasMobilePlaceDescription">{description}</p>
        </div>
      ) : null}

      <div
        className="playCanvasMobileQuality"
        role="group"
        aria-label="Rendering quality"
      >
        {MOBILE_PERF_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`playCanvasMobileQualityBtn${
              performancePreset === preset ? " isActive" : ""
            }`}
            aria-pressed={performancePreset === preset}
            onClick={() => onPerformancePresetChange(preset)}
          >
            {PLAYCANVAS_PERF_PRESET_LABELS[preset]}
          </button>
        ))}
      </div>
    </>
  );
}
