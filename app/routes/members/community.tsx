import { ComingSoon } from "~/components/coming-soon";
import type { Route } from "./+types/community";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Community · Members · Limicon" }];
}

export default function Community() {
  return (
    <ComingSoon title="Community">
      The member directory and messages, so you can find other members and talk with them.
    </ComingSoon>
  );
}
