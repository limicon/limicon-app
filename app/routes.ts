import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in", "routes/sign-in.tsx"),
  route("auth/callback", "routes/auth-callback.tsx"),
  route("sign-out", "routes/sign-out.tsx"),
  route("account", "routes/account.tsx"),
] satisfies RouteConfig;
