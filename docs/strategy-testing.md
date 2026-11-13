# Testing

How limicon-app is tested: the test pyramid, and what kinds of test to write for this app.

## The test pyramid

The "test pyramid" is the industry standard model for automated test coverage.
At the bottom of the pyramid are many small fast tests.
At the top of the pyramid are few big slow tests.

The layers go like this, from bottom to top:
-  Unit tests: Side-effect-free in-process logic tests. Average runtime: .1-1ms
-  Integration (aka functional) tests: Can call the database (backend) or manipulate DOM (frontend). Average runtime: 10-50ms
-  Acceptance (aka "end-to-end") tests: Drives through user-level actions, exercises the full stack. Average runtime: 1-2s
-  Extra tests: Perf suites, test-data refreshing suites, fuzzing, etc. Average runtime: 1-5m

Unit and integration tests get written and run often, in TDD cycles and during development.
Acceptance tests (and all lower layers) must run and pass for any code going to main. (This exempts safe docs-only changes.)
Extra tests get run only on-demand or on a regular cadence (e.g. weekly).

## Our test heuristics

We start by aiming for at least 50% unit tests, with <40% integration tests and <10% acceptance tests.
Try to avoid "testing the database" or "testing the browser" - those products have their own tests. Our tests focus on our logic and our usage of these products.
Try to make business logic testable less by mocking and more by dependency injection. Functional (as in FP, functional programming) code is very testable.
We use Vitest for the lower layers of the pyramid, and Playwright for browser-based e2e tests.
Our suites (groups of tests, independently runnable) shall aim towards: "server", "client", and "e2e", plus any extra suites.
Only the middleware may import `cloudflare:workers`; everything else gets handed context/arguments. The e2e suite will exercise the cloudflare-specific middleware.
Some teams put unit tests in a dedicated suite with DB/DOM access disabled. We allow them to be mixed with integration tests.

### Reliability

Every test failure must be taken seriously, investigated, and speedily fixed in order to maintain overall integrity of the tests.
Every test should be written so that it will fail spuriously less than 1 in 100,000 runs. (And that's good enough while we're under 2,000 total tests. This is conceptual napkin math, that in practice means "no spurious failures allowed".)