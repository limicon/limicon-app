import { useEffect, useRef, useState } from "react";

import { secondaryButton } from "~/components/admin-ui";
import { VOICE_ACCEPT, VOICE_MAX_BYTES, VOICE_MAX_SECONDS, voiceNoteUrl } from "~/lib/voice-notes";

type Stage = "idle" | "recording" | "uploading" | "ready";

/** Minutes and seconds, such as "2:05". */
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The recording type this browser makes: WebM in Chrome and Firefox, MP4 in Safari. */
function recordingType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/**
 * Records a voice note in the browser, or takes an audio file such as a phone's voice memo, and
 * uploads it straight away. The form then posts only the stored key, in a hidden `name` input.
 * `onBusy` tells the form to hold Send while a recording is running or uploading.
 */
export function VoiceNoteField({
  name,
  label,
  help,
  initialKey,
  error,
  onBusy,
}: {
  name: string;
  label: string;
  help: string;
  initialKey: string | null;
  error?: string;
  onBusy: (busy: boolean) => void;
}) {
  const [key, setKey] = useState(initialKey);
  const [stage, setStage] = useState<Stage>(initialKey ? "ready" : "idle");
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [canRecord, setCanRecord] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Recording needs the browser's MediaRecorder; uploading a file works everywhere.
  useEffect(() => setCanRecord(recordingType() !== null && !!navigator.mediaDevices?.getUserMedia), []);
  useEffect(() => onBusy(stage === "recording" || stage === "uploading"), [stage, onBusy]);

  useEffect(() => {
    if (stage !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    if (stage === "recording" && seconds >= VOICE_MAX_SECONDS) recorder.current?.stop();
  }, [stage, seconds]);

  // Stops the microphone if the member leaves the page mid-recording.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((track) => track.stop()), []);

  async function upload(blob: Blob, filename: string) {
    if (blob.size > VOICE_MAX_BYTES) {
      setProblem("Voice notes can be up to 25 MB, about 25 minutes from a phone.");
      setStage(key ? "ready" : "idle");
      return;
    }
    setStage("uploading");
    const body = new FormData();
    body.append("file", blob, filename);
    try {
      const response = await fetch("/members/feedback/voice", { method: "POST", body });
      const result = (await response.json()) as { key?: string; error?: string };
      if (!response.ok || !result.key) throw new Error(result.error ?? "The upload didn't finish. Try again.");
      setKey(result.key);
      setStage("ready");
    } catch (failure) {
      setProblem(failure instanceof Error ? failure.message : "The upload didn't finish. Try again.");
      setStage(key ? "ready" : "idle");
    }
  }

  async function start() {
    setProblem(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProblem("Your browser didn't let the page use your microphone. Allow it in the browser's address bar, or upload a recording instead.");
      return;
    }
    const type = recordingType() ?? "";
    const media = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    media.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      const blob = new Blob(chunks, { type: media.mimeType });
      void upload(blob, media.mimeType.includes("mp4") ? "voice-note.m4a" : "voice-note.webm");
    };
    recorder.current = media;
    setSeconds(0);
    media.start(1000);
    setStage("recording");
  }

  function remove() {
    if (!confirm("Remove this voice note? It's gone for good when you send the form.")) return;
    setKey(null);
    setStage("idle");
    setProblem(null);
  }

  const shown = problem ?? error;
  return (
    <fieldset className="rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]">
      <legend className="float-left w-full font-medium">{label}</legend>
      <div className="clear-left grid gap-3 pt-2">
        <span className="block text-sm opacity-80">{help}</span>
        <input type="hidden" name={name} value={key ?? ""} />

        {stage === "idle" && (
          <div className="flex flex-wrap items-center gap-3">
            {canRecord && (
              <button type="button" onClick={start} className={secondaryButton}>
                ● Record a voice note
              </button>
            )}
            <button type="button" onClick={() => fileInput.current?.click()} className={canRecord ? "text-sm underline" : secondaryButton}>
              {canRecord ? "or upload a recording" : "Upload a recording"}
            </button>
          </div>
        )}

        {stage === "recording" && (
          <div className="flex flex-wrap items-center gap-3">
            <span role="status" className="flex items-center gap-2 font-semibold">
              <span aria-hidden className="inline-block size-3 animate-pulse rounded-full bg-[#B3261E]" />
              Recording {clock(seconds)}
            </span>
            <button type="button" onClick={() => recorder.current?.stop()} className={secondaryButton}>
              ■ Stop
            </button>
            <span className="text-sm opacity-80">Up to {VOICE_MAX_SECONDS / 60} minutes.</span>
          </div>
        )}

        {stage === "uploading" && <p role="status">Saving your voice note…</p>}

        {stage === "ready" && key && (
          <div className="grid gap-2">
            <audio controls preload="metadata" src={voiceNoteUrl(key)} className="w-full max-w-md">
              Your browser can't play this recording.
            </audio>
            <div className="flex flex-wrap gap-3 text-sm">
              {canRecord && (
                <button type="button" onClick={start} className="underline">
                  Record again
                </button>
              )}
              <button type="button" onClick={() => fileInput.current?.click()} className="underline">
                Upload a different recording
              </button>
              <button type="button" onClick={remove} className="font-semibold text-[#B3261E] underline dark:text-[#F2B8B5]">
                Remove voice note
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept={VOICE_ACCEPT}
          aria-label="Upload a recording"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              setProblem(null);
              void upload(file, file.name);
            }
          }}
        />
        {shown && <p role="alert" className="text-sm font-semibold text-[#B3261E] dark:text-[#F2B8B5]">{shown}</p>}
      </div>
    </fieldset>
  );
}
