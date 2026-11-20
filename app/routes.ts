import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  // The public website: pages admins build, the account and registration pages, and one Members
  // link in its menu.
  layout("routes/public/layout.tsx", [
    index("routes/public/home.tsx"),
    route("sign-in", "routes/public/sign-in.tsx"),
    route("account", "routes/public/account.tsx"),
    route("tickets", "routes/public/tickets.tsx"),
    route("members-only", "routes/public/members-only.tsx"),
    route("faq", "routes/public/faq.tsx"),
    route("privacy", "routes/public/privacy.tsx"),
    route("conduct", "routes/public/conduct.tsx"),
    // Pages admins add in the website builder. Every fixed address above wins over this one.
    route(":slug", "routes/public/page.tsx"),
  ]),

  // The Members area: a site of its own, open only to ticket holders and admins.
  ...prefix("members", [
    layout("routes/members/layout.tsx", [
      index("routes/members/home.tsx"),
      route("updates", "routes/members/updates.tsx"),
      route("updates/new", "routes/members/updates-new.tsx"),
      route("updates/:postId/edit", "routes/members/updates-edit.tsx"),
      route("schedule", "routes/members/schedule.tsx"),
      route("schedule/version", "routes/members/schedule-version.ts"),
      route("schedule/:sessionId", "routes/members/schedule-session.tsx"),
      route("community", "routes/members/community.tsx"),
      route("community/mentions", "routes/members/community-mentions.ts"),
      route("notifications", "routes/members/notifications.tsx"),
      route("people", "routes/members/people.tsx"),
      route("people/:profileId", "routes/members/profile.tsx"),
      route("profile", "routes/members/profile-edit.tsx"),
      route("settings", "routes/members/settings.tsx"),
      route("host", "routes/members/host.tsx"),
      route("host/guidelines", "routes/members/host-guidelines.tsx"),
      route("host/new", "routes/members/host-new.tsx"),
      route("host/people", "routes/members/host-people.ts"),
      route("host/:sessionId", "routes/members/host-edit.tsx"),
    ]),
  ]),

  // The admin console: open only to people with an admin permission.
  ...prefix("admin", [
    layout("routes/admin/layout.tsx", [
      index("routes/admin/overview.tsx"),
      route("settings", "routes/admin/settings.tsx"),
      route("users", "routes/admin/users.tsx"),
      route("users/:userId", "routes/admin/user.tsx"),
      route("sessions/:sessionId", "routes/admin/session-edit.tsx"),
      route("sessions", "routes/admin/sessions.tsx"),
      route("orders", "routes/admin/orders.tsx"),
      route("guests", "routes/admin/guests.tsx"),
      route("settings/form", "routes/admin/registration-form.tsx"),
      route("faq", "routes/admin/faq.tsx"),
      route("policies", "routes/admin/policies.tsx"),
      route("website", "routes/admin/website.tsx"),
      route("website/:slug", "routes/admin/website-page.tsx"),
      route("policies/:slug", "routes/admin/policy-edit.tsx"),
      route("roles", "routes/admin/roles.tsx"),
      route("roles/:key", "routes/admin/role.tsx"),
      route("team", "routes/admin/team.tsx"),
    ]),
    route("users.csv", "routes/admin/users-csv.ts"),
    route("orders.csv", "routes/admin/orders-csv.ts"),
    route("guests.csv", "routes/admin/guests-csv.ts"),
    route("upload", "routes/admin/upload.ts"),
  ]),

  route("media/:key", "routes/media.ts"),
  route("upload/photo", "routes/upload-photo.ts"),
  route("auth/callback", "routes/auth-callback.tsx"),
  route("sign-out", "routes/sign-out.tsx"),
] satisfies RouteConfig;
