import { expect, test } from "@playwright/test";

test("public pages and the 404 page send the security headers, and their scripts run under the CSP", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });

  // An address no route matches skips the middleware, so the server entry adds the headers.
  for (const [path, status] of [["/", 200], ["/sign-in", 200], ["/members/no/such/page", 404]] as const) {
    const response = await page.goto(path);
    expect(response!.status()).toBe(status);
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // React Router's inline scripts carry the nonce and ran, so the page hydrated.
    await page.waitForFunction(() => "__reactRouterContext" in globalThis && "__reactRouterRouteModules" in globalThis);
  }

  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(violations).toEqual([]);
});
