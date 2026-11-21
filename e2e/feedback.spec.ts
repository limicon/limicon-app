import { expect, test } from "@playwright/test";

import { createAccount, giveTicket, newEmail, publishSession, rsvpTo, signIn } from "./support";

test("hosts fill in Session Host Feedback after their session ends, and can edit it", async ({ page, request }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const email = newEmail();
  await signIn(page, request, email);
  await giveTicket(email);

  // Members who haven't hosted a session don't see the host box.
  await page.goto("/members");
  await expect(page.getByRole("link", { name: /Session Host Feedback/ })).toHaveCount(0);

  const ended = await publishSession({ hostEmail: email, title: `Ended ${run}`, theme: "Consciousness Exploration", startsAt: "2026-01-10T16:00:00Z", minutes: 60, timeZone: "UTC" });
  await publishSession({ hostEmail: email, title: `Upcoming ${run}`, theme: "Consciousness Exploration", startsAt: "2099-01-10T16:00:00Z", minutes: 60, timeZone: "UTC" });

  await page.goto("/members");
  const box = page.getByRole("link", { name: /Session Host Feedback/ });
  await expect(box).toContainText("1 New Form");
  await box.click();
  await expect(page.getByText(`Upcoming ${run}`)).toHaveCount(0);
  await page.getByRole("link", { name: "Fill in the form" }).click();
  await expect(page).toHaveURL(`/members/feedback/host/${ended}`);

  // The experience and tensions questions are required.
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert")).toContainText("Some answers need a look");

  await page.getByLabel("How many participants attended?").fill("9");
  await page.getByRole("checkbox", { name: "Had fun" }).check();
  // The Tension questions show only after Yes.
  await expect(page.getByText("Please select any tensions")).toHaveCount(0);
  await page.getByRole("radio", { name: "Yes", exact: true }).check();
  await page.getByRole("checkbox", { name: "Interruptions" }).check();
  await page.getByRole("radio", { name: "No, this is for feedback purposes only." }).check();
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("status")).toContainText("Your answers are saved");
  await expect(page.getByText("✓ Sent")).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("How many participants attended?")).toHaveValue("9");
  await expect(page.getByRole("checkbox", { name: "Interruptions" })).toBeChecked();
  await page.getByRole("radio", { name: "No", exact: true }).check();
  await page.getByRole("button", { name: "Update my answers" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  // The box stays, without a count, so the host can come back to their answers.
  await page.goto("/members");
  await expect(page.getByRole("link", { name: /Session Host Feedback/ })).not.toContainText("New Form");
});

test("members who RSVP'd fill in a Session Harvest after the session ends", async ({ page, request }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const host = newEmail();
  await createAccount(host);
  const email = newEmail();
  await signIn(page, request, email);
  await giveTicket(email);
  const ended = await publishSession({ hostEmail: host, title: `Harvested ${run}`, theme: "Consciousness Exploration", startsAt: "2026-01-10T16:00:00Z", minutes: 60, timeZone: "UTC" });
  await rsvpTo(email, ended);

  await page.goto("/members");
  await expect(page.getByRole("link", { name: /Session Host Feedback/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Session Harvest/ }).filter({ hasText: "1 New Form" }).click();
  await page.getByRole("link", { name: "Fill in the form" }).click();
  await page.getByLabel("What is one take away from this session?").fill("Slow down");
  await page.getByLabel("If you could sum up this session in one word, what would it be?").fill("Spacious");
  // A voice note uploaded from a file, such as a phone's voice memo.
  await page.getByLabel("Upload a recording").setInputFiles({ name: "memo.wav", mimeType: "audio/wav", buffer: silentWav() });
  const player = page.locator("audio");
  await expect(player).toHaveAttribute("src", /^\/members\/feedback\/voice\/[0-9a-f-]{36}\.wav$/);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toContainText("Your answers are saved");

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("If you could sum up this session in one word, what would it be?")).toHaveValue("Spacious");
  const src = await player.getAttribute("src");
  expect((await page.request.get(src!)).status()).toBe(200);
  // Nobody else can play it.
  expect((await request.get(src!, { maxRedirects: 0 })).status()).not.toBe(200);
});

test("members harvest a session they joined without RSVPing, from its page or the harvest page", async ({ page, request }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const host = newEmail();
  await createAccount(host);
  const email = newEmail();
  await signIn(page, request, email);
  await giveTicket(email);
  const first = await publishSession({ hostEmail: host, title: `Drop-in ${run}`, theme: "Consciousness Exploration", startsAt: "2026-01-12T16:00:00Z", minutes: 60, timeZone: "UTC" });
  const second = await publishSession({ hostEmail: host, title: `Walk-in ${run}`, theme: "Consciousness Exploration", startsAt: "2026-01-13T16:00:00Z", minutes: 60, timeZone: "UTC" });

  // From the session's own page.
  await page.goto(`/members/schedule/${first}`);
  await page.getByRole("link", { name: "Share your Session Harvest" }).click();
  await expect(page).toHaveURL(`/members/feedback/harvest/${first}`);
  await page.getByLabel("If you could sum up this session in one word, what would it be?").fill("Open");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(`Drop-in ${run}`)).toBeVisible();

  // From the picker on the harvest page, which no longer offers the one already sent.
  const picker = page.getByLabel("Harvest another session");
  await expect(picker.locator(`option[value="${first}"]`)).toHaveCount(0);
  await picker.selectOption(second);
  await page.getByRole("button", { name: "Open the form" }).click();
  await expect(page).toHaveURL(`/members/feedback/harvest/${second}`);
  await expect(page.getByText(`Walk-in ${run}`)).toBeVisible();
});

/** A tenth of a second of silence as a WAV file. */
function silentWav() {
  const samples = 800;
  const buffer = Buffer.alloc(44 + samples);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(8000, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples, 40);
  buffer.fill(128, 44);
  return buffer;
}
