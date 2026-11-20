import { useEffect, useId, useRef, useState } from "react";

import { primaryButton, secondaryButton } from "~/components/admin-ui";
import { FIT_BACKGROUND, initialCrop, layout, moveBy, OUTPUT_SIZE, ZOOM_MAX, zoomTo, type Crop } from "~/lib/photo-crop";

/** The frame's share of the stage: the dimmed margin around it shows what's cut off. */
const FRAME = 0.75;
const INSET = (1 - FRAME) / 2;
const pct = (frames: number) => `${(INSET + frames * FRAME) * 100}%`;

/**
 * Lets a member place a photo in the square the schedule shows before it uploads: zoom, drag or
 * use the arrow keys to move it inside the dotted frame, or fit the whole photo on Limicon's teal.
 * `shape` "circle" draws the frame as the circle profile pictures appear in. Calls `onDone` with a
 * square JPEG, or null when the member cancels.
 */
export function PhotoCropper({
  file,
  shape = "square",
  onDone,
}: {
  file: File;
  shape?: "square" | "circle";
  onDone: (photo: File | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [saving, setSaving] = useState(false);
  const id = useId();

  useEffect(() => {
    dialog.current?.showModal();
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    img
      .decode()
      .then(() => {
        setImage(img);
        setCrop(initialCrop({ width: img.naturalWidth, height: img.naturalHeight }));
      })
      .catch(() => setProblem("This browser can't open that photo. Try a JPEG or PNG."));
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const natural = image ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  const place = natural && crop ? layout(natural, crop) : null;

  /** Pixels on screen to frames. */
  const toFrames = (pixels: number) => pixels / ((stage.current?.getBoundingClientRect().width ?? 1) * FRAME);

  async function finish() {
    if (!image || !place) return;
    setSaving(true);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d")!;
    // The teal also shows through any transparent parts of the photo.
    context.fillStyle = FIT_BACKGROUND;
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, place.x * OUTPUT_SIZE, place.y * OUTPUT_SIZE, place.width * OUTPUT_SIZE, place.height * OUTPUT_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    setSaving(false);
    if (!blob) {
      setProblem("The photo couldn't be prepared. Try another.");
      return;
    }
    close(new File([blob], "photo.jpg", { type: "image/jpeg" }));
  }

  function close(photo: File | null) {
    dialog.current?.close();
    onDone(photo);
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-lg bg-white p-5 text-[#15383F] backdrop:bg-black/60 dark:bg-[#12201F] dark:text-[#E3EEF0]"
      onCancel={(event) => {
        event.preventDefault();
        close(null);
      }}
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">Place your photo</h2>
      <p id={`${id}-help`} className="mt-1 text-sm">
        The dotted {shape === "circle" ? "circle" : "square"} shows what members will see. Drag the photo, or use the arrow keys,
        to move it, and zoom in with the slider.
      </p>

      {problem ? (
        <p role="alert" className="mt-4 font-medium text-[#B3261E] dark:text-[#F2B8B5]">{problem}</p>
      ) : (
        <>
          <div
            ref={stage}
            role="group"
            tabIndex={crop?.fit ? -1 : 0}
            aria-label="Photo position"
            aria-describedby={`${id}-help`}
            className="relative mx-auto mt-4 aspect-square w-full max-w-80 touch-none select-none overflow-hidden rounded-md bg-[#0B1417] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#15383F] dark:focus-visible:outline-[#8CC7D3] data-[movable=true]:cursor-grab data-[movable=true]:active:cursor-grabbing"
            data-movable={Boolean(crop && !crop.fit)}
            onPointerDown={(event) => {
              if (!crop || crop.fit) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (!start || !natural || !crop) return;
              drag.current = { x: event.clientX, y: event.clientY };
              setCrop(moveBy(natural, crop, toFrames(event.clientX - start.x), toFrames(event.clientY - start.y)));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(event) => {
              if (!natural || !crop || crop.fit) return;
              const step = event.shiftKey ? 0.1 : 0.02;
              const moves: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
              };
              const move = moves[event.key];
              if (!move) return;
              event.preventDefault();
              setCrop(moveBy(natural, crop, ...move));
            }}
          >
            {crop?.fit && (
              <div aria-hidden="true" className="absolute" style={{ inset: `${INSET * 100}%`, background: FIT_BACKGROUND }} />
            )}
            {image && place ? (
              <img
                src={image.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{ left: pct(place.x), top: pct(place.y), width: `${place.width * FRAME * 100}%`, height: `${place.height * FRAME * 100}%` }}
              />
            ) : (
              <p role="status" className="absolute inset-0 grid place-items-center text-sm text-[#F3E6D7]">Opening the photo…</p>
            )}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute border-2 border-dashed border-white shadow-[0_0_0_999px_rgba(0,0,0,0.55)] ${shape === "circle" ? "rounded-full" : ""}`}
              style={{ inset: `${INSET * 100}%` }}
            />
          </div>

          <div className="mt-4 grid gap-3">
            <div>
              <label htmlFor={`${id}-zoom`} className="block text-sm font-medium">Zoom</label>
              <input
                id={`${id}-zoom`}
                type="range"
                min={1}
                max={ZOOM_MAX}
                step={0.01}
                value={crop?.zoom ?? 1}
                disabled={!crop || crop.fit}
                onChange={(event) => natural && crop && setCrop(zoomTo(natural, crop, Number(event.target.value)))}
                className="mt-1 w-full accent-[#15383F] disabled:opacity-50 dark:accent-[#8CC7D3]"
              />
            </div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={crop?.fit ?? false}
                disabled={!crop}
                onChange={(event) => crop && setCrop({ ...crop, fit: event.target.checked })}
                className="mt-1 size-4 shrink-0 accent-[#15383F] dark:accent-[#8CC7D3]"
              />
              <span>
                <span className="block font-medium">Fit the whole photo</span>
                <span className="block text-sm">Shows all of it, with Limicon's teal filling the space around it.</span>
              </span>
            </label>
          </div>
        </>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => void finish()} disabled={!place || saving || Boolean(problem)} className={primaryButton}>
          {saving ? "Preparing…" : "Use this photo"}
        </button>
        <button type="button" onClick={() => close(null)} className={secondaryButton}>Cancel</button>
      </div>
    </dialog>
  );
}
