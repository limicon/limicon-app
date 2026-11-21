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

  // A saved draft's button grays out until something changes, and again if the change is undone.
  const savedDraft = page.getByRole("button", { name: "Draft saved" });
  await expect(savedDraft).toBeDisabled();
  await page.getByLabel("Session title").fill("Thresholds and transitions, revised");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await page.getByLabel("Session title").fill("Thresholds and transitions");
  await expect(savedDraft).toBeDisabled();

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
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete for good" }).click();
  await expect(page).toHaveURL(/\/members\/host/);
  await expect(page.getByText("You haven't created a session yet.")).toBeVisible();
});

test("a host publishes a series in parts, each with its own title, and the schedule marks them recurring", async ({ page, request }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const email = newEmail();
  await signIn(page, request, email);
  await giveTicket(email);
  await page.goto("/members/host");
  await page.getByText("Have a wonderful session fostering collaboration").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "I've read the guidelines and accept them" }).click();
  await expect(page).toHaveURL("/members/host/new");

  await page.getByLabel("Session title").fill(`Part 1 ${run}`);
  await page.getByLabel("Theme").selectOption("Personal Growth and Inner Work");
  await page.getByRole("checkbox", { name: /Dialog\/Inquiry/ }).check();
  await page.getByLabel("Date", { exact: true }).fill("2027-03-17");
  await page.getByLabel("Start time", { exact: true }).fill("12:00");
  await page.getByLabel("Time zone").selectOption("America/Toronto");
  await page.getByRole("radio", { name: /^No: I won't record it/ }).check();
  await page.getByRole("radio", { name: "On other dates I choose" }).check();
  await page.getByLabel("Date 2", { exact: true }).fill("2027-03-24");
  await page.getByLabel("Start time").nth(1).fill("12:00");
  // A new row starts at the last row's time.
  await page.getByRole("button", { name: "+ Add another date" }).click();
  await page.getByLabel("Date 3", { exact: true }).fill("2027-03-31");

  // Unchecking "same title and description" opens a box for each further date.
  await page.getByRole("checkbox", { name: /All sessions have the same title and description/ }).uncheck();
  const boxes = page.getByRole("list", { name: "Each session's title and description" }).getByRole("listitem");
  await expect(boxes).toHaveCount(2);
  await expect(boxes.first()).toContainText("Session 2: Wednesday, March 24");
  await boxes.first().getByLabel("Title").fill(`Part 2 ${run}`);
  await boxes.nth(1).getByLabel("Title").fill(`Part 3 ${run}`);
  await boxes.nth(1).getByLabel("Description").fill("The last part.");
  await page.getByRole("button", { name: "Publish to the calendar" }).click();
  await expect(page.getByText("Saved, and on the calendar.")).toBeVisible();

  await page.goto(`/members/schedule?q=${run}`);
  for (const part of [1, 2, 3]) {
    const card = page.getByRole("article", { name: `Part ${part} ${run}` });
    await expect(card).toContainText("Recurring session");
  }
  await page.getByRole("link", { name: `Part 3 ${run}` }).click();
  await expect(page.getByRole("heading", { name: `Part 3 ${run}`, level: 1 })).toBeVisible();
  await expect(page.getByText("Recurring session")).toBeVisible();
  await expect(page.getByText("The last part.")).toBeVisible();
});
