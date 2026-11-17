import { ComingSoon } from "~/components/coming-soon";
import type { Route } from "./+types/schedule";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Schedule · Members · Limicon" }];
}

export default function Schedule() {
  return (
    <ComingSoon title="Schedule">
      The calendar of sessions, shown in your own time zone, and My Schedule with the sessions
      you've joined.
    </ComingSoon>
  );
}
