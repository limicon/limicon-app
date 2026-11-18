import { expect, test } from "@playwright/test";

import { giveTicket, newEmail, signIn } from "./support";

test("a member accepts the guidelines, then drafts, publishes and deletes a session", async ({ page, request }) => {
  const email = newEmail();
  await signIn(page, request, email);
  await giveTicket(email);

  // The guidelines come first, and Accept waits until the member reaches the end.
  await page.goto("/members/host");
  const accept = page.getByRole("button", { name: "I've read the guidelines and accept them" });
  await expect(accept).toBeDisabled();
  await page.getByText("Have a wonderful session fostering collaboration").scrollIntoViewIfNeeded();
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page).toHaveURL("/members/host/new");

  // A draft needs only a title.
  await page.getByLabel("Session title").fill("Thresholds and transitions");
  await expect(page.getByText("26 of 60 characters")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Saved as a draft. Only you can see it.")).toBeVisible();

  // Publishing asks for what's missing.
  await page.getByRole("button", { name: "Publish to the calendar" }).click();
  await expect(page.getByText("Choose a theme to publish.")).toBeVisible();
  await expect(page.getByText("Choose at least one session type to publish.")).toBeVisible();

  await page.getByLabel("Theme").selectOption("Personal Growth and Inner Work");
  await page.getByRole("checkbox", { name: /Dialog\/Inquiry/ }).check();
  await page.getByLabel("Date").fill("2027-03-17");
  await page.getByLabel("Start time").fill("12:00");
  await page.getByLabel("Length in minutes").fill("90");
  await page.getByLabel("Time zone").selectOption("America/Toronto");
  await page.getByLabel(/Meeting link/).fill("https://zoom.us/j/123");
  await page.getByRole("radio", { name: /^No: I won't record it/ }).check();
  await page.getByRole("button", { name: "Publish to the calendar" }).click();
  await expect(page.getByText("Saved, and on the calendar.")).toBeVisible();

  // The host's list shows it, at the time they entered, in their zone.
  await page.getByRole("link", { name: "Back to your sessions" }).click();
  const listed = page.getByRole("link", { name: /Thresholds and transitions/ });
  await expect(listed).toContainText("On the calendar");
  await expect(listed).toContainText("Mar 17");
  await expect(listed).toContainText("12:00");

  await listed.click();
  await page.getByText("Delete this session").click();
  await page.getByRole("button", { name: "Delete for good" }).click();
  await expect(page).toHaveURL(/\/members\/host/);
  await expect(page.getByText("You haven't created a session yet.")).toBeVisible();
});
