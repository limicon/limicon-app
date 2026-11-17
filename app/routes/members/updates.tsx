import { ComingSoon } from "~/components/coming-soon";
import type { Route } from "./+types/updates";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Updates · Members · Limicon" }];
}

export default function Updates() {
  return (
    <ComingSoon title="Updates">
      News and announcements from the Organizing Team will appear here.
    </ComingSoon>
  );
}
