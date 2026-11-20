import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { giveTicket, newEmail, publishSession, setName, signIn } from "./support";

// A wide photo, so the cropper has something to trim.
const wide = { name: "wide.png", mimeType: "image/png", buffer: readFileSync("design/knot-cutout-clean-1600x1080.png") };

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

  // The upload refuses a file that isn't really an image, and the cropper one it can't open.
  const fake = { name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<html>") };
  const refused = await page.request.post("/upload/photo", { multipart: { file: fake } });
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toMatchObject({ error: expect.stringContaining("isn't the image its name says") });
  await page.goto("/account");
  await page.locator('input[type="file"]').setInputFiles(fake);
  const cropper = page.getByRole("dialog", { name: "Place your photo" });
  await expect(cropper.getByRole("alert")).toContainText("can't open that photo");
  await cropper.getByRole("button", { name: "Cancel" }).click();
  await expect(cropper).toBeHidden();

  // The host's profile picture stands in: the whole wide photo, fitted.
  await page.locator('input[type="file"]').setInputFiles(wide);
  await cropper.getByRole("checkbox", { name: /Fit the whole photo/ }).check();
  await expect(cropper.getByLabel("Zoom")).toBeDisabled();
  await cropper.getByRole("button", { name: "Use this photo" }).click();
  await expect(page.getByRole("img", { name: `Ada Lovelace-${run}'s profile picture` })).toBeVisible();
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.goto(`/members/schedule?q=${run}`);
  await expect(card().getByRole("img", { name: `Ada Lovelace-${run}, the host` })).toBeVisible();

  // The session's own photo wins: zoomed in and moved.
  await page.goto(`/members/host/${id}`);
  await page.locator('input[type="file"]').setInputFiles(wide);
  await cropper.getByLabel("Zoom").fill("2");
  await cropper.getByRole("group", { name: "Photo position" }).press("ArrowLeft");
  // A slow upload: saving before it finishes waits, rather than saving without the photo.
  await page.route("**/upload/photo", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await cropper.getByRole("button", { name: "Use this photo" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wait for the photo to finish uploading, then save.");
  await expect(page.getByRole("img", { name: `Photo for ${title}` })).toBeVisible();
  await expect(page.getByRole("alert")).toBeHidden();
  await page.unroute("**/upload/photo");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved, and on the calendar.")).toBeVisible();
  await page.goto(`/members/schedule?q=${run}`);
  const photo = card().getByRole("img", { name: `Photo for ${title}` });
  await expect(photo).toBeVisible();
  expect((await request.get((await photo.getAttribute("src"))!)).headers()["content-type"]).toBe("image/jpeg");

  await page.goto(`/members/schedule/${id}`);
  await expect(page.getByRole("img", { name: `Photo for ${title}` })).toBeVisible();
});
