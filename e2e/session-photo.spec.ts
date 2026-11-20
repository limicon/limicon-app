import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { giveTicket, newEmail, publishSession, setName, signIn } from "./support";

const png = { name: "photo.png", mimeType: "image/png", buffer: readFileSync("public/logo-square.png") };

test("a session shows the logo, then its host's picture, then its own photo", async ({ page, request }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const email = newEmail();
  await signIn(page, request, email);
  await giveTicket(email);
  await setName(email, "Ada", `Lovelace-${run}`);
  const title = `Photo ${run}`;
  const id = await publishSession({
    hostEmail: email,
    title,
    theme: "Personal Growth and Inner Work",
    startsAt: "2027-03-17T16:00:00Z",
    minutes: 60,
    timeZone: "America/Toronto",
  });
  const card = () => page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });

  // No photo and no profile picture: the logo.
  await page.goto(`/members/schedule?q=${run}`);
  await expect(card().getByRole("img", { name: "Limicon logo" })).toBeVisible();

  // A file that isn't really an image is refused.
  await page.goto("/account");
  await page.locator('input[type="file"]').setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<html>") });
  await expect(page.getByRole("alert")).toContainText("isn't the image its name says");

  // The host's profile picture stands in.
  await page.locator('input[type="file"]').setInputFiles(png);
  await expect(page.getByRole("img", { name: `Ada Lovelace-${run}'s profile picture` })).toBeVisible();
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.goto(`/members/schedule?q=${run}`);
  await expect(card().getByRole("img", { name: `Ada Lovelace-${run}, the host` })).toBeVisible();

  // The session's own photo wins.
  await page.goto(`/members/host/${id}`);
  await page.locator('input[type="file"]').setInputFiles(png);
  await expect(page.getByRole("img", { name: `Photo for ${title}` })).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved, and on the calendar.")).toBeVisible();
  await page.goto(`/members/schedule?q=${run}`);
  const photo = card().getByRole("img", { name: `Photo for ${title}` });
  await expect(photo).toBeVisible();
  expect((await request.get((await photo.getAttribute("src"))!)).headers()["content-type"]).toBe("image/png");

  await page.goto(`/members/schedule/${id}`);
  await expect(page.getByRole("img", { name: `Photo for ${title}` })).toBeVisible();
});
