/** Small pieces shared by the admin console's pages. */

export const card = "rounded-lg border border-[#C9DADC] bg-white p-5 dark:border-[#24363B] dark:bg-[#12201F]";

export const inputClass =
  "w-full rounded border border-[#9DB5B9] bg-white px-3 py-2 dark:border-[#3A5359] dark:bg-[#0F1C1E] aria-[invalid=true]:border-[#B3261E]";

export const primaryButton =
  "rounded bg-[#15383F] px-4 py-2 font-semibold text-[#F3E6D7] disabled:opacity-50 dark:bg-[#F3E6D7] dark:text-[#15383F]";

export const secondaryButton =
  "rounded border border-[#15383F] px-3 py-1.5 text-sm font-semibold hover:bg-[#15383F]/5 dark:border-[#8CC7D3] dark:hover:bg-white/5";

export const dangerButton = "rounded px-3 py-1.5 text-sm font-semibold text-[#B3261E] hover:bg-[#B3261E]/10 dark:text-[#F2B8B5]";

export function PageHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-semibold">{title}</h1>
      {children && <div className="mt-2 max-w-[68ch]">{children}</div>}
    </header>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm font-medium text-[#B3261E] dark:text-[#F2B8B5]">
      {message}
    </p>
  );
}

/** A confirmation or problem after a post, announced to screen readers. */
export function Notice({ tone = "ok", children }: { tone?: "ok" | "problem"; children: React.ReactNode }) {
  const colors =
    tone === "ok"
      ? "border-[#8CC7D3] bg-[#E6F5F6] text-[#15383F]"
      : "border-[#E8B4B0] bg-[#FCEDEC] text-[#5C1712]";
  return (
    <div role={tone === "ok" ? "status" : "alert"} className={`mb-6 rounded-lg border p-4 ${colors}`}>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "green" | "amber" | "gray" | "blue"; children: React.ReactNode }) {
  const colors = {
    green: "bg-[#CDEBE3] text-[#0F4A3C]",
    amber: "bg-[#F9DCBD] text-[#5A3612]",
    gray: "bg-[#E2E8E9] text-[#2F4447]",
    blue: "bg-[#D6E6F5] text-[#173A5C]",
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${colors}`}>{children}</span>;
}

/**
 * A date, in UTC unless `options.timeZone` says otherwise, so the server-rendered page and the
 * browser agree.
 */
export function formatWhen(value: Date | string, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(value));
}
