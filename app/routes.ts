import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // The public website: a typical site with one Members link in its menu.
  layout("routes/public/layout.tsx", [
    index("routes/public/home.tsx"),
    route("sign-in", "routes/public/sign-in.tsx"),
    route("account", "routes/public/account.tsx"),
    route("tickets", "routes/public/tickets.tsx"),
    route("members-only", "routes/public/members-only.tsx"),
  ]),

  // The Members area: a site of its own, open only to ticket holders and admins.
  ...prefix("members", [
    layout("routes/members/layout.tsx", [
      index("routes/members/home.tsx"),
      route("updates", "routes/members/updates.tsx"),
      route("schedule", "routes/members/schedule.tsx"),
      route("community", "routes/members/community.tsx"),
      route("host", "routes/members/host.tsx"),
      route("host/guidelines", "routes/members/host-guidelines.tsx"),
      route("host/new", "routes/members/host-new.tsx"),
      route("host/:sessionId", "routes/members/host-edit.tsx"),
    ]),
  ]),

  route("auth/callback", "routes/auth-callback.tsx"),
  route("sign-out", "routes/sign-out.tsx"),
] satisfies RouteConfig;
