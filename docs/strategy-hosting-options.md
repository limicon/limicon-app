# Hosting options

Six candidate stacks for limicon-app. The app needs to be fast and cheap to run on Node, with a traditional (relational) database, logging, alerting and email. Usage is seasonal: one or two busy months a year, and much less the rest of the year. Nothing is chosen yet.

Status: Prices and features checked against vendor docs on 2026-11-04 to 2026-11-06. Prices are USD per month, before tax. Figures marked *(estimate)* weren't on the vendor pages that were read; confirm them before relying on them.

## The options

The six fall into three groups by how the app runs.

**Code runs near each visitor, worldwide**

- **Cloudflare.** One vendor for everything except the database. The database is PlanetScale Postgres, created from Cloudflare's dashboard.

**The app is an ordinary always-on server, with Postgres hosted next to it**

- **Railway.** Billed by the resources the app actually uses.
- **Render.** Much like Railway, but each server and database has a fixed monthly price.
- **Fly.io.** Servers can run in many regions at once. Its managed Postgres is the most expensive of the six at small sizes.
- **AWS.** Amazon's own services cover all five functions. It's the most flexible and the most work to set up.

**The app starts on demand, with one specialist service per function**

- **Vercel + Supabase + Axiom + Sentry + Resend.**

Sentry and Resend work with any host. Railway, Render and Fly.io all recommend an email service such as Resend instead of sending directly, and Sentry can be added to any of the six for error alerts. AWS's email service, SES, can also be used from any host. So the real differences are hosting, the database, logs, and alerting that's built in.

## Side by side

| | Cloudflare | Railway | Render | Fly.io | AWS | Vercel + Supabase + Axiom + Sentry + Resend |
|---|---|---|---|---|---|---|
| **Node web app** | Workers runs most Node code through a compatibility layer, in data centres worldwide, with almost no startup delay. Code that needs full Node, such as native modules, goes in Containers. | A normal Node server, always on, in one region. Billed by the CPU and memory actually used. | A normal Node server, always on, in one region. Each instance size has a fixed monthly price. Free servers shut down after 15 minutes without traffic and take about a minute to wake. | A normal Node server on Fly's lightweight virtual machines. Servers can run in several regions at once, and can stop when idle and restart on the next request. | Two routes. ECS Express Mode runs a container behind a load balancer AWS sets up, always on. Lambda runs on demand and scales to zero. App Runner, AWS's simplest route, stopped taking new customers on 2026-04-30. | Vercel Functions run full Node, start on demand and scale to zero when idle. |
| **Database** | PlanetScale Postgres, connected through Cloudflare's Hyperdrive, which pools connections and caches queries. Cloudflare's own D1 is SQLite. | Postgres on Railway's private network. One server by default; a cluster with automatic failover is optional. | Render Postgres. Paid databases can be restored to any point in the last 3 days on Hobby or 7 days on Pro. The free database expires after 30 days. | Fly Managed Postgres: a cluster with automatic failover, backups and support, from $38/month. Major Postgres versions can't be upgraded in place. | RDS Postgres, or Aurora Postgres, which can shut itself down when idle. Aurora takes a while to wake *(estimate: around 15 seconds)*. | Supabase Postgres, with daily backups kept 7 days on Pro. Also offers sign-in and file storage. |
| **Logging** | Workers Logs, kept 7 days on the Paid plan. | Built in, kept 7 days on Hobby and 30 on Pro. Sending logs elsewhere needs a forwarding tool such as Vector. | Built in, kept 7 days on Hobby, 14 on Pro and 30 on Scale. Log streams send logs to an outside service. | Live tail, plus search in Fly's hosted Grafana, kept 7 days. The Fly Log Shipper sends logs to an outside service. | CloudWatch Logs: 5 GB a month free, then $0.50/GB taken in. Retention is configurable. | Axiom, kept 30 days on its free plan. Vercel itself keeps 1 day on Pro. Sending logs to Axiom needs a Vercel Pro drain at $0.50/GB. |
| **Alerting** | Custom alerts on logs and traces, in beta since October 2026. | Pro only: alerts when CPU, memory, disk or egress cross a threshold. No alerts on error rates. | Email or Slack when a deploy fails, a service becomes unhealthy, or disk passes 80% full. No CPU, memory or error-rate alerts. | Nothing built in found in Fly's docs. Managed Postgres emails about maintenance but sends no CPU or storage alerts. Add Sentry, or ship logs to a service that alerts. | CloudWatch Alarms on any metric, including error rates: 10 free, then $0.10 per metric a month. Notifications go through SNS to email, SMS or webhooks. | Sentry alerts on errors, by email on the free plan and also to Slack and similar tools on Team. Axiom can alert on logs. Vercel's own anomaly alerts need its Observability Plus add-on. |
| **Email** | Email Sending, in beta: 3,000 emails/month included, then $0.35 per 1,000. | Nothing built in, and SMTP is blocked below Pro. Use an email service such as Resend. | Nothing built in. SMTP is blocked on free servers only. Use an email service such as Resend. | Nothing built in. Fly recommends an email service such as Resend, Postmark or SendGrid. | SES: $0.10 per 1,000 emails, the cheapest of the six. New accounts start in a sandbox that only sends to verified addresses until AWS approves production use. | Resend: 3,000/month free, capped at 100 a day. Pro is $20 for 50,000. |
| **Cheapest production setup** | About $10: Workers Paid at $5, plus PlanetScale from $5. | About $5–20: Hobby is $5 including $5 of usage, and the app and database use more on top. Pro at $20 adds alerting. | About $13 on the free Hobby workspace: the smallest always-on server plus the smallest paid database. Pro workspace is $25 flat, for longer logs and point-in-time restore. | About $42: a 512 MB server at $3.69, plus Managed Postgres Basic at $38. Storage is $0.28/GB on top. | About $30–60 *(estimate)* for ECS Express Mode with RDS: load balancer, smallest database and smallest container. Lambda with Aurora can cost much less, at the price of slow wake-ups. New accounts get up to $200 in credits within a 6-month free plan. | About $20: Vercel Pro at $20. The database fits Supabase Free if you run your own backups; Supabase Pro, with automated backups, makes it $45. Axiom, Sentry and Resend fit their free plans at low volume. |
| **Expected cost, busy month** *(estimate)* | About $13: Workers Paid at $5, with requests and CPU well inside the allowance. Email is about $2.50 for the 7,000 above the included 3,000. PlanetScale's smallest database is $5. Logs fit the included volume, and Workers bandwidth is free. | About $26: Hobby at $5 plus about $1 more usage. The servers run all month whatever the traffic. Assuming the app and database sit at about 0.5 GB of RAM together, that's $5 of RAM plus about $1 of CPU, with storage and egress under $0.50. Resend Pro adds $20. On Pro, the $20 fee covers the same usage, so about $40. | About $33: the smallest always-on server at $7, the smallest paid database at $6 and a few cents of storage. Resend Pro adds $20. The Pro workspace, for 14-day logs and 7-day restore, adds $25. | About $62: a 512 MB server at $3.69, Managed Postgres Basic at $38, and Resend Pro at $20. Storage and egress are a few cents each. | About $48–52 with ECS Express Mode: the container about $9, the load balancer about $17, the smallest RDS database with its minimum storage about $14, public IP addresses about $7–11 and SES $1. Logs and data sent to users fit the free allowances. Lambda with Aurora could come to about $25 if the database pauses overnight, at the price of a slow first request after each pause. | About $40–65: Vercel Pro at $20, since compute, invocations and the log drain come to under $1 of its $20 credit. Resend Pro adds $20. The 200 MB database fits Supabase Free. Supabase Pro, for automated backups and a guarantee against pausing, adds $25. Axiom and Sentry stay on their free plans. |
| **Expected cost, quiet month** *(estimate)* | About $10: Workers Paid at $5 and PlanetScale at $5. Email fits the included 3,000. | About $5: the servers still run all month, but near-idle usage fits inside Hobby's included $5. Resend's free plan covers the email. Staying on Pro for its alerting makes it $20. | About $13: the same server and database as a busy month, because Render charges per instance, not per use. Resend's free plan covers the email. | About $40–42: Managed Postgres Basic stays at $38. The server can stop when idle, which saves at most its $3.69. | About $47–51 with ECS Express Mode: the load balancer, database and IP addresses cost the same whatever the traffic. Lambda with Aurora could drop to about $5–15, since the database would be paused most of the time. | About $20: Vercel Pro stays on, because Hobby is non-commercial only. The database is on Supabase Free, and a quiet month's traffic keeps it from pausing. Resend's free plan covers the email. |
| **Expected cost per year** *(estimate)* | About $125. | About $100 on Hobby. About $280 on Pro all year. | About $195. | About $525–545. | About $565–615 with ECS Express Mode, or about $100–200 with Lambda and Aurora. | About $280 on Supabase Free all year, or about $330 with Supabase Pro in the busy months only. |

**Cheapest production setup** is the lowest bill that's fit for production. The expected costs assume a year with one or two busy months and ten quiet ones. **A busy month** looks like this:

- one developer seat
- 100,000 requests a month (about one every 26 seconds on average), each using 20 ms of CPU
- a 200 MB database
- about 2 GB a month of data sent to users, and about 0.3 GB of logs, both scaled to the request count
- 10,000 emails a month
- fewer than 5,000 errors a month, so Sentry's free plan covers every option

**A quiet month** is assumed to be about a tenth of a busy one: 10,000 requests and 1,000 emails, with the database still 200 MB. Usage costs hardly change between the two, so the quiet-month figure is mostly each option's fixed monthly floor. Email is the exception. If a quiet month sends more than Resend's free 3,000 emails, or more than 100 in a day, Resend Pro's $20 applies then too.

**Per year** is two busy months plus ten quiet ones. It assumes Resend Pro is switched on only for the busy months.

The expected costs are worked out from each vendor's published rates, plus remembered rates where a page didn't list them: RDS, the AWS load balancer, AWS public IP addresses, Aurora's per-hour rate and AWS's free data allowance. Check them in each vendor's pricing calculator before relying on them.

At this volume, usage barely registers. The totals are mostly fixed monthly fees, plus email. Resend Pro is $20 because 10,000 emails is over its free 3,000, and it's in four of the six columns. For Railway and Render it's the biggest single item. AWS SES would send the same 10,000 for about $1 from any host. Sentry Team, for Slack alerts and more than one user, would add $29 to any option.

Vercel Hobby is for non-commercial personal use only, so the Vercel stack needs Vercel Pro all year.

Supabase Free can work for this app, with conditions:

- **Size.** 200 MB is under Free's 500 MB limit.
- **Pausing.** Supabase pauses a Free project after a week of too little database activity. Its guidance is that a few real requests a day usually prevent that.
- **Backups.** Free has no automated backups. A scheduled `pg_dump` to private storage covers the gap.
- **Project slots.** Each person gets two active free projects across every organisation they own or administer.
- **Organisations.** Supabase doesn't mix plans within an organisation, so moving this app to Pro for busy months needs an organisation of its own.

Supabase is plain Postgres, so it can also be the database for Cloudflare (through Hyperdrive), Railway or Render. On Cloudflare, Supabase Free in place of PlanetScale would bring a quiet month to about $5. [`strategy-database-selection.md`](strategy-database-selection.md) compares the databases on their own.

Render's free server and free database won't do for production: the server sleeps after 15 minutes without traffic, and the database expires after 30 days.

## Trade-offs

### Cloudflare

- **Fastest for users spread worldwide.** Code runs near each visitor, with almost no startup delay. The database sits in one place, so pages that query it gain less. Hyperdrive's caching narrows that gap.
- **Cheapest.** $5 covers 10 million requests a month, and Workers bandwidth is free.
- **Hardest to leave.** The app is written for Workers' own APIs and config.
- **Newest pieces.** Alerting and email are in beta. Log pricing switches on 2026-12-01 to volume-based: 50 GB taken in and 10 GB stored included, then $0.25/GB taken in.
- **Two bills.** At the April 2026 launch of the integration, PlanetScale billed separately.

### Railway

- **Most conventional.** Any Node framework runs unchanged. The database is on the same private network, so queries are quick. Everything runs in one region.
- **Pays for idle time.** There are no startup delays, but the server runs and is billed even when nobody is using it. RAM is $10/GB a month and CPU is $20/vCPU a month, charged on actual use.
- **Weakest at alerting and email.** It has resource alerts only, on Pro only. Sentry and Resend fill the gap.
- **Easy to leave.** A standard Node service and plain Postgres move to any host.

### Render

- **Railway with fixed prices.** The same setup: an always-on server and Postgres in one region. The bill is set by the instance sizes you pick, so it's predictable, but you pay for the size even when the app uses less.
- **Database recovery on the cheapest paid setup.** Paid databases can be restored to any point in the last 3 days, even on the free Hobby workspace.
- **Alerts cover failures, not load.** Deploy failures, unhealthy services and full disks go to email or Slack. Error rates need Sentry.
- **Easy to leave.** Same as Railway.

### Fly.io

- **Servers in many regions.** The only server-based option built to run the same app close to users in several regions. Cloudflare covers the same need more cheaply, but only if the app is written for Workers.
- **Cheap servers, expensive database.** A small server is a few dollars a month, but Managed Postgres starts at $38. That's the main reason it costs more than Railway or Render at small scale.
- **Bring your own alerting.** Fly gives you logs and metrics but no built-in alerts. Sentry, or logs shipped to Axiom, fill the gap.
- **Easy to leave.** It runs ordinary containers and Postgres.

### AWS

- **Covers everything, from one vendor.** Hosting, database, logs, alerts on any metric, and the cheapest email. It's the only option here where alerting on error rates is built in and generally available.
- **Most setup and upkeep.** You configure networking, permissions and usually infrastructure-as-code yourself. ECS Express Mode handles some of this, but only deploys container images. That ongoing work is the real cost for a small team.
- **Fixed costs at small scale.** A load balancer and a database run all month whether or not anyone uses the app. A NAT gateway, needed when private servers call out to the internet, adds more *(estimate: about $32/month)*.
- **The free offer is temporary.** Accounts created since July 2025 get a 6-month free plan and up to $200 in credits. After that, everything is billed.
- **Fits a later stage.** It makes most sense if a customer or compliance requirement says AWS, the company already runs there, or the app outgrows the others.

### Vercel + Supabase + Axiom + Sentry + Resend

- **Strong at each function.** Every piece has a free plan, so prototyping costs nothing.
- **Five of everything.** Five accounts, five bills, five dashboards and five sets of credentials.
- **Same region matters.** Speed depends on putting Vercel Functions and Supabase in the same region, for example Vercel's Washington D.C. (`iad1`) next to Supabase's North Virginia (`us-east-1`).
- **Short built-in logs.** Vercel keeps 1 day on Pro, which is why Axiom is in the stack.

## Questions that decide it

1. **Where are the users?** Spread worldwide favours Cloudflare, or Fly.io for an ordinary server. If they're mostly in one region, all six are fast.
2. **How much does being able to leave matter?** Railway, Render and Fly.io are easiest to leave. Cloudflare is hardest.
3. **Predictable bill, or pay for what's used?** Render and Fly.io's database have fixed prices. Railway, Cloudflare, AWS and Vercel bill by usage. With ten quiet months a year, what matters most is the fixed floor paid every month. Railway Hobby, Cloudflare and Render have the lowest floors, and AWS does too in its Lambda-and-Aurora form.
4. **One vendor, or one service for each job?** Cloudflare and AWS can cover all five functions alone. The Vercel stack means five accounts, each a leader in its field.
5. **How much setup work is acceptable?** AWS needs the most. The others handle networking and deploys for you.
6. **Are beta features acceptable?** Cloudflare's alerting and email are both in beta.

## Sources

- Cloudflare: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Observability update and new log pricing](https://blog.cloudflare.com/one-observability-platform/), [Email Service](https://developers.cloudflare.com/email-service/) and [its pricing](https://developers.cloudflare.com/email-service/platform/pricing/), [Containers limits](https://developers.cloudflare.com/containers/platform-details/limits/), [PlanetScale Postgres with Workers](https://blog.cloudflare.com/deploy-planetscale-postgres-with-workers)
- Railway: [Plans](https://docs.railway.com/reference/pricing/plans), [Postgres](https://docs.railway.com/databases/postgresql), [Outbound networking (SMTP)](https://docs.railway.com/reference/outbound-networking), [Observability](https://docs.railway.com/observability), [Logs](https://docs.railway.com/observability/logs)
- Render: [Pricing](https://render.com/pricing), [Free plan limits](https://render.com/docs/free), [Compute plans](https://render.com/docs/compute-plans), [Logging](https://render.com/docs/logging), [Notifications](https://render.com/docs/notifications), [Postgres backups](https://render.com/docs/postgresql-backups), [Workspace plan changes](https://render.com/changelog/updated-plans-for-render-workspaces), [Small business hosting costs](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses)
- Fly.io: [Pricing](https://docs.fly.io/about/pricing), [Managed Postgres](https://docs.fly.io/mpg/), [Monitoring](https://docs.fly.io/monitoring/), [Logging](https://docs.fly.io/monitoring/logging-overview/), [Troubleshooting (email)](https://docs.fly.io/getting-started/troubleshooting)
- AWS: [App Runner availability change](https://docs.aws.amazon.com/ja_jp/apprunner/latest/dg/apprunner-availability-change.html), [ECS Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html), [Aurora Serverless](https://aws.amazon.com/rds/aurora/serverless/), [RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/), [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/), [SES pricing](https://aws.amazon.com/ses/pricing/), [Free Tier FAQs](https://aws.amazon.com/free/faqs/)
- Vercel: [Pro plan](https://vercel.com/docs/plans/pro-plan), [Hobby plan](https://vercel.com/docs/plans/hobby), [Functions pricing](https://vercel.com/docs/functions/usage-and-pricing), [Runtime logs](https://vercel.com/docs/logs/runtime), [Alerts](https://vercel.com/docs/alerts), [Pricing (drains)](https://vercel.com/docs/pricing)
- [Supabase pricing](https://supabase.com/pricing), [Axiom pricing](https://axiom.co/pricing), [Sentry pricing](https://sentry.io/pricing/), [Resend pricing](https://resend.com/pricing)
