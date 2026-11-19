import { useRef, useState } from "react";

import { secondaryButton, dangerButton } from "~/components/admin-ui";
import { IMAGE_ACCEPT, mediaKeyFromUrl, mediaUrl } from "~/lib/media";

/**
 * An image picker for a form: "Upload image" until there is one, then a preview with Change and
 * Delete. It uploads straight away and posts the stored file's key in a hidden field `name`; the
 * form's own Save keeps or discards the change.
 */
export function ImageUploadField({ name, initialKey, label }: { name: string; initialKey: string | null; label: string }) {
  const [key, setKey] = useState(initialKey ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setProblem(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("images", "1");
      const response = await fetch("/admin/upload", { method: "POST", body });
      const result = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      const uploaded = result?.url ? mediaKeyFromUrl(result.url) : null;
      if (!response.ok || !uploaded) throw new Error(result?.error ?? "The upload didn't work. Try again.");
      setKey(uploaded);
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
          <img src={mediaUrl(key)} alt={label} className="max-h-64 w-full max-w-xl rounded border border-[#C9DADC] object-cover dark:border-[#24363B]" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className={secondaryButton}>
              Change
            </button>
            <button type="button" disabled={busy} onClick={() => setKey("")} className={`${dangerButton} border border-current`}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={secondaryButton}>
          Upload image
        </button>
      )}
      {busy && <p role="status" className="mt-2 text-sm">Uploading…</p>}
      {problem && <p role="alert" className="mt-2 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">{problem}</p>}
      <p className="mt-2 text-sm opacity-80">PNG, JPEG, GIF or WebP, up to 10 MB. A wide image, about 1600 × 900, looks best.</p>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
