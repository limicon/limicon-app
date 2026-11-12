# Frontend selection

Which React framework limicon-app is built on: React Router or Next.js. Both are React, so components and most UI libraries carry over either way. Nothing is chosen yet.

Status: Checked against vendor docs on 2026-11-11, at React Router 8.5.1 and Next.js 16.4.6. The hosts are compared in [`strategy-hosting-options.md`](strategy-hosting-options.md).

## The options

- **React Router.** Each route has a server `loader` that reads data and an `action` that handles form posts. The first page arrives server-rendered; later navigations fetch only the new route's data and render in the browser. It can also build a single-page app with no server rendering.
- **Next.js.** The App Router renders with React Server Components: components run on the server by default, and only those marked `'use client'` ship to the browser. Server Actions handle mutations. Vercel makes it.

## Side by side

| | React Router | Next.js |
|---|---|---|
| **Rendering** | Server rendering with hydration, the default. A single-page app with `ssr: false`. Prerendering at build time. | React Server Components, with server rendering of client components. Static export, which drops server features such as `proxy.ts`. |
| **Reading data** | A `loader` per route, run on the server. With `ssr: false`, a `clientLoader` in the browser. | `async` server components fetch their own data. |
| **Changing data** | An `action` per route. After it runs, the page's loaders rerun automatically. Forms work before JavaScript loads. | Server Actions, called from forms or code. The page revalidates when the action asks it to. |
| **Code that runs before each request** | Middleware in route modules. | `proxy.ts`, which always runs on Node.js. Supabase's guide refreshes the sign-in session there. |
| **Sign-in with Supabase** | Covered in Supabase's server-side auth guide, with the session in cookies. A single-page app keeps it in the browser instead. | Covered in Supabase's server-side auth guide, with the session in cookies. |
| **On Cloudflare** | Native, through Cloudflare's Vite plugin, which runs server code in the Workers runtime during development. A single-page app is served as static files, outside the Vite plugin. No skew protection. | Through an adapter. OpenNext doesn't support Node.js middleware, which rules out `proxy.ts`. vinext is Cloudflare's own reimplementation of the Next.js API, which Cloudflare recommends for new apps and its docs label beta. |
| **On Vercel** | Supported through Vercel's preset, with streaming and Skew Protection. | Native. |
| **Model to learn** | Loaders, actions and forms: close to plain web requests. | Server and client components, and which code runs where. More to learn, and more control over what ships to the browser. |
| **Existing code to draw on** | None of the reference apps. | Both reference apps, the [Festival platform](reference-festival.md) and the [IS Web App](reference-iswebapp.md), are Next.js. |

## Things that apply to both

- **Times in the viewer's own time zone.** The server doesn't know the viewer's time zone, so a server-rendered time differs from the browser's, and React reports a mismatch when the page hydrates. The fix is a component that renders UTC on the server and the local time after hydration. A single-page app avoids the problem, because the browser renders everything.
- **Public pages and link previews.** Server rendering gives search engines and link previews real HTML. A single-page app gives them an empty shell until JavaScript runs, which matters for public session pages and admin-edited pages that people share.
- **AI coding help.** Both are widely known to AI tools. Version changes are the risk: examples for older React Router versions, or the Next.js Pages Router, get suggested for current code. Naming the version in `AGENTS.md` helps.

## Trade-offs

### React Router

- **Native on Cloudflare,** and fully supported on Vercel, so the hosting choice stays open.
- **One codebase for both kinds of page.** Server rendering covers the public pages, and navigation feels like a single-page app for members.
- **Simpler model.** Data flows through loaders and actions per route, with automatic refresh after changes.
- **Nothing to copy from the reference apps.** Their components carry over as React, but pages and data loading are rewritten.
- **No skew protection on Cloudflare.** After a deploy, a page left open can request code that no longer exists until it reloads.

### Next.js

- **Closest to the reference apps.** Code and patterns from the Festival platform and the IS Web App carry over most directly.
- **Best on Vercel,** where every feature works on the day it ships.
- **Second-class on Cloudflare.** It runs through an adapter or a reimplementation, both behind Next.js itself, and `proxy.ts` is unsupported on OpenNext.
- **More to learn.** Server and client components take longer to understand than loaders and actions.

## Questions that decide it

1. **Which host?** Cloudflare favours React Router. Vercel suits both.
2. **How much code comes from the reference apps?** A lot favours Next.js.
3. **Do public pages need search engines and link previews?** If not, React Router's single-page mode is an option, and the simplest shape on Cloudflare.
4. **Which model suits the team?** Loaders and actions, or server and client components.

## Sources

- React Router: [SPA mode](https://reactrouter.com/how-to/spa)
- Next.js: [proxy.js](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- Cloudflare: [React Router](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/), [OpenNext](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/), [Single-page applications](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/), [vinext 1.0 announcement](https://blog.cloudflare.com/vinext-nextjs-on-vite/)
- vinext: [README](https://github.com/cloudflare/vinext)
- Vercel: [React Router on Vercel](https://vercel.com/docs/frameworks/frontend/react-router), [Skew Protection](https://vercel.com/docs/skew-protection)
- Supabase: [Creating a server-side client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
