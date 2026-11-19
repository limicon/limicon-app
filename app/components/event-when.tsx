import { useEffect, useState } from "react";

/**
 * The event's start and end in the visitor's own time zone. The server doesn't know the zone, so
 * the first draw uses the zone the start was entered in, and the browser redraws in its own.
 */
export function EventWhen({
  startsAt,
  endsAt,
  zone,
  className = "",
}: {
  startsAt: Date | string;
  endsAt: Date | string | null;
  zone: string;
  className?: string;
}) {
  const [shownZone, setShownZone] = useState(zone);
  useEffect(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone) setShownZone(browserZone);
  }, []);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: shownZone,
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const start = new Date(startsAt);
  const text = endsAt ? format.formatRange(start, new Date(endsAt)) : format.format(start);
  return (
    <p className={className}>
      <time dateTime={start.toISOString()}>{text}</time>
    </p>
  );
}
