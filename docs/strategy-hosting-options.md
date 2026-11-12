# Hosting options

Two candidate hosts for limicon-app: Cloudflare and Vercel. The app needs to be fast and cheap to run, with logging, alerting and email. Usage is seasonal: one or two busy months a year, and much less the rest of the year. The team provisionally chose Cloudflare on 2026-11-11.

The database is a separate choice, compared in [`strategy-database-selection.md`](strategy-database-selection.md); all its candidates work with both hosts. The framework is compared in [`strategy-frontend-selection.md`](strategy-frontend-selection.md).

Status: Prices checked against vendor docs on 2026-11-04 to 2026-11-06. Runtime, framework, placement and deploy details checked on 2026-11-11. Prices are USD per month, before tax. Figures marked *(estimate)* weren't on the vendor pages that were read; confirm them before relying on them.

## The options

- **Cloudflare.** Code runs on Cloudflare's own runtime, in data centres worldwide, with almost no startup delay. One vendor covers hosting, logs, alerts and email.
- **Vercel.** Code runs as full Node functions in one chosen region. Vercel makes Next.js. Logs, error alerts and email come from separate services: Axiom, Sentry and Resend.

## Side by side

| | Cloudflare | Vercel |
|---|---|---|
| **How the app runs** | Workers: Cloudflare's runtime, not Node. Most Node APIs work through its compatibility layer, on by default for compatibility dates from 2026-08-04; `fs`, `net`, `http` and `https` are fully supported. Native modules don't load, and `child_process` is a non-working stub. Code that needs full Node goes in Containers. | Vercel Functions run full Node, start on demand and scale to zero when idle. Fluid compute lets one instance serve several requests at once and pre-warms production functions. |
| **Limits** | Free: 10 ms of CPU per request, 100,000 requests a day. Paid: 30 seconds of CPU per request by default, up to 5 minutes. 128 MB of memory per instance. 64 MiB uncompressed code size. | 300 seconds per request by default, up to 800 on Pro. Up to 4 GB of memory. 250 MB code size. |
| **Frameworks** | React Router runs natively through Cloudflare's Vite plugin, which also runs server code in the Workers runtime during development. Next.js runs through an adapter: OpenNext, which doesn't support Node.js middleware, while Next.js 16's `proxy.ts` always runs on Node.js; or vinext, Cloudflare's own reimplementation of the Next.js API, which Cloudflare recommends for new apps and its docs label beta. | Next.js natively. React Router with server rendering or as a single-page app, through Vercel's preset. |
| **Where code runs** | By default, in the data centre nearest each visitor. A placement hint such as `aws:us-east-1` runs it in the data centre closest to the database instead. Static files are always served from the nearest data centre. | In the function region set for the project, such as Washington D.C. (`iad1`), next to a database in North Virginia (`us-east-1`). Static files are served from Vercel's CDN worldwide. |
| **Connecting to Postgres** | Hyperdrive pools connections and caches read queries, for 60 seconds by default. Caching can be turned off per configuration. | Through the database's pooler. Supabase is a Vercel Marketplace integration, which adds the connection details to the project. |
| **Preview deploys** | Each uploaded version gets a Version URL. Previews cover branch and pull-request testing. | A preview deployment for every push and pull request. |
| **Old tabs during a deploy** | No built-in skew protection found in Cloudflare's docs. OpenNext has experimental support for Next.js. | Skew Protection, on Pro and on by default for new projects: an open page keeps talking to the deployment that served it, for 12 hours by default. Supported for Next.js and React Router. |
| **Logging** | Workers Logs, kept 7 days on the Paid plan. | Axiom, kept 30 days on its free plan. Vercel itself keeps 1 day on Pro. Sending logs to Axiom needs a Vercel Pro drain at $0.50/GB. |
| **Alerting** | Custom alerts on logs and traces, in beta since October 2026. | Sentry alerts on errors, by email on the free plan and also to Slack and similar tools on Team. Axiom can alert on logs. Vercel's own anomaly alerts need its Observability Plus add-on. |
| **Email** | Email Sending, in beta, on the Workers Paid plan: 3,000 emails/month included, then $0.35 per 1,000. Sends through a Workers binding, a REST API or SMTP. | Resend: 3,000/month free, capped at 100 a day. Pro is $20 for 50,000. |
| **Cheapest production setup** | $5: Workers Paid. | $20: Vercel Pro. Axiom, Sentry and Resend fit their free plans at low volume. |
| **Expected cost, busy month** *(estimate)* | About $7.50: Workers Paid at $5, with requests and CPU well inside the allowance, plus about $2.50 of email for the 7,000 above the included 3,000. Logs fit the included volume, and Workers bandwidth is free. | About $40: Vercel Pro at $20, since compute, invocations and the log drain come to under $1 of its $20 credit. Resend Pro adds $20. |
| **Expected cost, quiet month** *(estimate)* | About $5: Workers Paid. Email fits the included 3,000. | About $20: Vercel Pro stays on, because Hobby is non-commercial only. Resend's free plan covers the email. |
| **Expected cost per year** *(estimate)* | About $65. | About $280. |

Costs exclude the database; see [`strategy-database-selection.md`](strategy-database-selection.md).

**Cheapest production setup** is the lowest bill that's fit for production. The expected costs assume a year with one or two busy months and ten quiet ones. **A busy month** looks like this:

- one developer seat
- 100,000 requests a month (about one every 26 seconds on average), each using 20 ms of CPU
- about 2 GB a month of data sent to users, and about 0.3 GB of logs, both scaled to the request count
- 10,000 emails a month
- fewer than 5,000 errors a month, so Sentry's free plan covers both options

**A quiet month** is assumed to be about a tenth of a busy one: 10,000 requests and 1,000 emails. Usage costs hardly change between the two, so the quiet-month figure is mostly each option's fixed monthly floor. Email is the exception. If a quiet month sends more than Resend's free 3,000 emails, or more than 100 in a day, Resend Pro's $20 applies then too.

**Per year** is two busy months plus ten quiet ones. It assumes Resend Pro is switched on only for the busy months.

Resend and Sentry work with either host, so the email and alerting rows can be mixed. Sentry Team, for Slack alerts and more than one user, would add $29 to either option. Vercel Hobby is for non-commercial personal use only, so Vercel needs Pro all year.

## Trade-offs

### Cloudflare

- **Cheapest.** $5 covers 10 million requests a month, and Workers bandwidth is free.
- **Fast near the database, or near the visitor.** With a placement hint, the app runs next to the database, and each page costs visitors one long round trip instead of one per query. Without it, the app runs near each visitor, and every query crosses to the database.
- **Not Node.** Most npm packages work, but anything using native modules needs another route: Cloudflare Images instead of `sharp`, for example, or a Container.
- **Next.js is second-class.** It runs through an adapter or a reimplementation, both behind Next.js itself. React Router runs natively.
- **Newest pieces.** Alerting and email are in beta. Log pricing switches on 2026-12-01 to volume-based: 50 GB taken in and 10 GB stored included, then $0.25/GB taken in.
- **No skew protection** for React Router. After a deploy, a page left open can request code that no longer exists until it reloads.
- **Hardest to leave.** The app is written for Workers' own runtime and config.

### Vercel

- **Least friction for Next.js.** Every Next.js feature works on the day it ships, and React Router is fully supported too.
- **Full Node.** No runtime differences between development and production.
- **Five of everything.** Vercel, Axiom, Sentry, Resend and the database: five accounts, five bills, five dashboards and five sets of credentials.
- **Same region matters.** Speed depends on putting the function region next to the database's.
- **Short built-in logs.** Vercel keeps 1 day on Pro, which is why Axiom is in the stack.
- **Higher floor.** $20 a month all year, against Cloudflare's $5.

## Questions that decide it

1. **Next.js or React Router?** Next.js favours Vercel. React Router runs well on both. See [`strategy-frontend-selection.md`](strategy-frontend-selection.md).
2. **Does anything need full Node?** Native modules or heavy server work favour Vercel.
3. **One vendor, or one service for each job?** Cloudflare covers every function alone, with alerting and email in beta. Vercel means five accounts, each a leader in its field.
4. **How much does the fixed floor matter?** With ten quiet months a year, Cloudflare's $5 against Vercel's $20 is most of the difference.
5. **How much does being able to leave matter?** Vercel runs ordinary Node. Cloudflare's runtime and config tie the app to it.

## Sources

- Cloudflare: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Placement](https://developers.cloudflare.com/workers/configuration/placement/), [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/), [Version URLs and previews](https://developers.cloudflare.com/workers/configuration/previews/), [React Router](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/), [OpenNext](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Observability update and new log pricing](https://blog.cloudflare.com/one-observability-platform/), [Email Service](https://developers.cloudflare.com/email-service/) and [its pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [Containers limits](https://developers.cloudflare.com/containers/platform-details/limits/)
- OpenNext: [Skew protection](https://opennext.js.org/cloudflare/howtos/skew)
- Vercel: [Pro plan](https://vercel.com/docs/plans/pro-plan), [Hobby plan](https://vercel.com/docs/plans/hobby), [Functions pricing](https://vercel.com/docs/functions/usage-and-pricing), [Fluid compute](https://vercel.com/docs/fluid-compute), [Skew Protection](https://vercel.com/docs/skew-protection), [React Router on Vercel](https://vercel.com/docs/frameworks/frontend/react-router), [Next.js on Vercel vs Cloudflare](https://vercel.com/kb/guide/next-js-on-vercel-vs-cloudflare), [Postgres on Vercel](https://vercel.com/docs/postgres), [Runtime logs](https://vercel.com/docs/logs/runtime), [Alerts](https://vercel.com/docs/alerts), [Pricing (drains)](https://vercel.com/docs/pricing)
- [Axiom pricing](https://axiom.co/pricing), [Sentry pricing](https://sentry.io/pricing/), [Resend pricing](https://resend.com/pricing)
