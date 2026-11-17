import { ComingSoon } from "~/components/coming-soon";
import type { Route } from "./+types/host";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Host a session · Members · Limicon" }];
}

export default function Host() {
  return (
    <ComingSoon title="Host a session">
      Read the host guidelines, then offer a session of your own. You can save it as a draft and
      publish it to the calendar when it's ready.
    </ComingSoon>
  );
}
