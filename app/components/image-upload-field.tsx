import { useEffect, useRef, useState } from "react";

import { secondaryButton, dangerButton } from "~/components/admin-ui";
import { PhotoCropper } from "~/components/photo-cropper";
import { IMAGE_ACCEPT, mediaKeyFromUrl, mediaUrl } from "~/lib/media";

/**
 * An image picker for a form: "Upload image" until there is one, then a preview with Change and
 * Delete. It uploads straight away and posts the stored file's key in a hidden field `name`; the
 * form's own Save keeps or discards the change. Admin pages upload to /admin/upload; members'
 * photos go to /upload/photo, which takes smaller images only. With `crop`, the member first
 * places the photo in the square (or circle) it's shown in, and the square result uploads.
 */
export function ImageUploadField({
  name,
  initialKey,
  label,
  endpoint = "/admin/upload",
  help = "PNG, JPEG, GIF or WebP, up to 10 MB. A wide image, about 1600 × 900, looks best.",
  uploadLabel = "Upload image",
  previewClassName = "max-h-64 w-full max-w-xl object-cover",
  describedBy,
  crop,
}: {
  name: string;
  initialKey: string | null;
  /** The preview's alt text. */
  label: string;
  endpoint?: string;
  help?: string;
  uploadLabel?: string;
  previewClassName?: string;
  /** Ids of text that explains the field, read out with its buttons. */
  describedBy?: string;
  /** Opens the photo cropper before uploading, with a square or circular frame. */
  crop?: "square" | "circle";
}) {
  const [key, setKey] = useState(initialKey ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const helpId = [describedBy, `${name}-upload-help`].filter(Boolean).join(" ");

  // Saving mid-upload would save the form without the new image, so the form waits for it. The
  // listener runs before React Router's own submit handler, which skips a prevented submit.
  const waiting = busy || Boolean(cropping);
  useEffect(() => {
    const form = input.current?.form;
    if (!form || !waiting) return;
    const hold = (event: SubmitEvent) => {
      event.preventDefault();
      setProblem(cropping ? "Finish placing your photo, or cancel it, then save." : "Wait for the photo to finish uploading, then save.");
      // The Save button may be far below, so bring the message into view.
      input.current?.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    form.addEventListener("submit", hold);
    return () => form.removeEventListener("submit", hold);
  }, [waiting, cropping]);

  async function upload(file: File) {
    setProblem(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("images", "1");
      const response = await fetch(endpoint, { method: "POST", body });
      const result = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      const uploaded = result?.url ? mediaKeyFromUrl(result.url) : null;
      if (!response.ok || !uploaded) throw new Error(result?.error ?? "The upload didn't work. Try again.");
      setKey(uploaded);
      setProblem(null);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={key} />
      {key ? (
        <div className="grid gap-3">
          <img src={mediaUrl(key)} alt={label} className={`${previewClassName} rounded border border-[#C9DADC] object-cover dark:border-[#24363B]`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className={secondaryButton} aria-describedby={helpId}>
              Change
            </button>
            <button type="button" disabled={busy} onClick={() => setKey("")} className={`${dangerButton} border border-current`}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={secondaryButton} aria-describedby={helpId}>
          {uploadLabel}
        </button>
      )}
      {busy && <p role="status" className="mt-2 text-sm">Uploading…</p>}
      {problem && <p role="alert" className="mt-2 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">{problem}</p>}
      <p id={`${name}-upload-help`} className="mt-2 text-sm opacity-80">{help}</p>
      <input
        ref={input}
        type="file"
        // The cropper redraws the photo as a JPEG, so any photo the browser can open will do.
        accept={crop ? "image/*" : IMAGE_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file && crop) setCropping(file);
          else if (file) void upload(file);
        }}
      />
      {cropping && crop && (
        <PhotoCropper
          file={cropping}
          shape={crop}
          onDone={(photo) => {
            setCropping(null);
            if (photo) void upload(photo);
          }}
        />
      )}
    </div>
  );
}
