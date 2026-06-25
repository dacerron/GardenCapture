import { useCallback, useRef } from "react";
import {
  formatCoordinateForInput,
  isCoordinateDraft,
  parseCoordinateDraft,
  roundCoordinate,
} from "@soil/shared/markers/editorCoordinates";

const SCRUB_DRAG_THRESHOLD_PX = 3;

function getScrubSensitivity(event: PointerEvent): number {
  if (event.shiftKey) return 0.1;
  if (event.altKey || event.ctrlKey) return 0.001;
  return 0.01;
}

type ScrubAxisInputProps = {
  axis: "x" | "y" | "z";
  value: string;
  onChange: (value: string) => void;
  /** Live numeric updates while click-dragging (Unity-style scrub). */
  onScrubValue?: (value: number) => void;
  onCommit?: () => void;
  onScrubActiveChange?: (active: boolean) => void;
  disabled?: boolean;
};

export function ScrubAxisInput({
  axis,
  value,
  onChange,
  onScrubValue,
  onCommit,
  onScrubActiveChange,
  disabled = false,
}: ScrubAxisInputProps) {
  const scrubStateRef = useRef<{
    pointerId: number;
    startX: number;
    lastX: number;
    currentValue: number;
    scrubbing: boolean;
  } | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const stepCommitPendingRef = useRef(false);

  const SPINNER_HIT_WIDTH_PX = 28;

  const isNumberInputStepperHit = (event: React.PointerEvent<HTMLInputElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX >= rect.right - SPINNER_HIT_WIDTH_PX;
  };

  const applyInputValue = useCallback(
    (next: string) => {
      if (!isCoordinateDraft(next)) return;
      onChange(next);
    },
    [onChange],
  );

  const commitStepValue = useCallback(
    (raw: string) => {
      const parsed = parseCoordinateDraft(raw);
      if (parsed === null) return;
      const rounded = roundCoordinate(parsed);
      if (onScrubValue) {
        onScrubValue(rounded);
      } else {
        onCommit?.();
      }
    },
    [onCommit, onScrubValue],
  );

  const handleValueUpdate = useCallback(
    (next: string) => {
      applyInputValue(next);
      if (!stepCommitPendingRef.current) return;
      stepCommitPendingRef.current = false;
      commitStepValue(next);
    },
    [applyInputValue, commitStepValue],
  );

  const endScrub = useCallback(() => {
    const state = scrubStateRef.current;
    if (!state) return;
    const wasScrubbing = state.scrubbing;
    scrubStateRef.current = null;
    document.body.style.cursor = "";
    document.body.classList.remove("is-axis-scrubbing");
    onScrubActiveChange?.(false);
    if (wasScrubbing) {
      // Values are committed live via onScrubValue during the drag. Do not call
      // onCommit here — parent draft state is often still stale on pointerup.
      skipNextBlurCommitRef.current = true;
    }
  }, [onScrubActiveChange]);

  const beginScrubSession = useCallback(
    (event: React.PointerEvent, origin: "label" | "input") => {
      if (disabled || event.button !== 0) return;

      const parsed = parseCoordinateDraft(value);
      if (parsed === null) return;

      if (origin === "input") {
        (event.currentTarget as HTMLInputElement).focus();
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      scrubStateRef.current = {
        pointerId,
        startX,
        lastX: startX,
        currentValue: parsed,
        scrubbing: origin === "label",
      };

      if (origin === "label") {
        document.body.style.cursor = "ew-resize";
        document.body.classList.add("is-axis-scrubbing");
        onScrubActiveChange?.(true);
        event.preventDefault();
      }

      const onPointerMove = (moveEvent: PointerEvent) => {
        const state = scrubStateRef.current;
        if (!state || moveEvent.pointerId !== state.pointerId) return;

        if (!state.scrubbing) {
          if (Math.abs(moveEvent.clientX - state.startX) < SCRUB_DRAG_THRESHOLD_PX) {
            return;
          }
          state.scrubbing = true;
          document.body.style.cursor = "ew-resize";
          document.body.classList.add("is-axis-scrubbing");
          onScrubActiveChange?.(true);
          window.getSelection()?.removeAllRanges();
        }

        moveEvent.preventDefault();

        const deltaX = moveEvent.clientX - state.lastX;
        state.lastX = moveEvent.clientX;
        const rounded = roundCoordinate(
          state.currentValue + deltaX * getScrubSensitivity(moveEvent),
        );
        state.currentValue = rounded;

        const formatted = formatCoordinateForInput(rounded);
        if (onScrubValue) {
          onScrubValue(rounded);
        } else {
          onChange(formatted);
        }
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        endScrub();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [disabled, endScrub, onChange, onScrubActiveChange, onScrubValue, value],
  );

  return (
    <label className="scrubAxisInput">
      <span
        className="scrubAxisInput-label"
        onPointerDown={(event) => beginScrubSession(event, "label")}
      >
        {axis.toUpperCase()}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={0.01}
        className="scrubAxisInput-value"
        value={value}
        disabled={disabled}
        onChange={(event) => handleValueUpdate(event.target.value)}
        onInput={(event) => handleValueUpdate(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            stepCommitPendingRef.current = true;
          }
          if (event.key === "Enter") {
            onCommit?.();
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (skipNextBlurCommitRef.current) {
            skipNextBlurCommitRef.current = false;
            return;
          }
          onCommit?.();
        }}
        onPointerDown={(event) => {
          if (isNumberInputStepperHit(event)) {
            stepCommitPendingRef.current = true;
            return;
          }
          beginScrubSession(event, "input");
        }}
      />
    </label>
  );
}
