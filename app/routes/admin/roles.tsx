import { redirect } from "react-router";

/** Roles are listed on the Team page, each with the people who hold it. */
export function loader() {
  throw redirect("/admin/team");
}
