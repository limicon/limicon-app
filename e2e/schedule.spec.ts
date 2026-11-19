import { expect, test } from "@playwright/test";

import { createAccount, giveTicket, newEmail, publishSession, setName, signIn } from "./support";

// A member in London, looking at sessions a Toronto host entered.
test.use({ timezoneId: "Europe/London" });

test("members browse, search and open sessions in their own time zone, and see new ones appear", async ({ page, request }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const email = newEmail();
  await signIn(page, request, email);
  await giveTicket(email);
  await setName(email, "Ada", `Lovelace-${run}`);

  // 12:00 in Toronto on 17 March 2027 (daylight time) is 16:00 in London (still GMT).
  const id = await publishSession({
    hostEmail: email,
    title: `Thresholds ${run}`,
    theme: "Personal Growth and Inner Work",
    startsAt: "2027-03-17T16:00:00Z",
    minutes: 90,
    timeZone: "America/Toronto",
    meetingLink: "https://zoom.us/j/123",
  });
  await publishSession({
    hostEmail: email,
    title: `Games ${run}`,
    theme: "Play, Games and Experimentation",
    startsAt: "2027-03-18T16:00:00Z",
    minutes: 60,
    timeZone: "America/Toronto",
  });

  await page.goto("/members/schedule");
  // The page learns the browser's zone on its first visit.
  await expect(page.getByText("Times are shown in Europe/London")).toBeVisible();
  await expect(page.getByRole("group").filter({ hasText: "Theme colors" })).toContainText("Consciousness Exploration");

  // Search by host name.
  await page.getByLabel("Search").fill(`lovelace-${run}`);
  await page.getByRole("button", { name: "Search" }).click();
  const thresholds = page.getByRole("article", { name: `Thresholds ${run}` });
  await expect(thresholds).toContainText("4:00");
  await expect(thresholds).toContainText("5:30 PM");
  await expect(thresholds).toContainText("Personal Growth and Inner Work");
  await expect(thresholds).toContainText(`With Ada Lovelace-${run}`);
  await expect(page.getByRole("heading", { name: "Wednesday, March 17" })).toBeVisible();

  // Filter by theme.
  await page.getByLabel("Theme", { exact: true }).selectOption("Play, Games and Experimentation");
  await expect(page.getByRole("article", { name: `Games ${run}` })).toBeVisible();
  await expect(thresholds).toHaveCount(0);

  // A session's page shows the link, and the host's own time beside the viewer's.
  await page.goto(`/members/schedule/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: `Thresholds ${run}` })).toBeVisible();
  await expect(page.getByText(/Wednesday, March 17.*4:00.*5:30\sPM GMT/)).toBeVisible();
  await expect(page.getByText(/Host's time: .*12:00.*1:30\sPM EDT/)).toBeVisible();
  await expect(page.getByRole("link", { name: "https://zoom.us/j/123" })).toBeVisible();
  // Sessions default to recordings shared with this edition's members.
  await expect(page.getByText(/^Recorded, shared with Limicon \d{4} members$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit this session" })).toBeVisible();

  // A session published while the schedule is open appears without a reload (CAL-4).
  await page.goto(`/members/schedule?q=${run}`);
  await expect(page.getByRole("article", { name: `Thresholds ${run}` })).toBeVisible();
  await publishSession({
    hostEmail: email,
    title: `Arrived later ${run}`,
    theme: "Consciousness Exploration",
    startsAt: "2027-03-19T16:00:00Z",
    minutes: 60,
    timeZone: "America/Toronto",
  });
  await expect(page.getByRole("article", { name: `Arrived later ${run}` })).toBeVisible({ timeout: 20_000 });

  // Picking another zone saves it and re-renders the times.
  await page.getByText("Times are shown in").click();
  await page.getByLabel("Show times in").selectOption("Asia/Tokyo");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Times are shown in Asia/Tokyo")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thursday, March 18" }).first()).toBeVisible();
});

test("members RSVP in one click and find those sessions, and their own, on My Schedule", async ({ page, request }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const email = newEmail();
  // Another member hosts the sessions this one RSVPs to: hosts are going without RSVPing.
  const otherHost = newEmail();
  await createAccount(otherHost);
  await signIn(page, request, email);
  await giveTicket(email);
  const session = (title: string, startsAt: string, hostEmail = otherHost) =>
    publishSession({ hostEmail, title, theme: "Consciousness Exploration", startsAt, minutes: 60, timeZone: "UTC" });
  const id = await session(`Going ${run}`, "2027-03-17T16:00:00Z");
  await session(`Not going ${run}`, "2027-03-18T16:00:00Z");
  await session(`Hosting ${run}`, "2027-03-19T16:00:00Z", email);

  await page.goto(`/members/schedule?q=${run}`);
  const going = page.getByRole("article", { name: `Going ${run}` });
  await going.getByRole("button", { name: `RSVP for Going ${run}` }).click();
  await expect(going.getByText("Going", { exact: true })).toBeVisible();
  const hosting = page.getByRole("article", { name: `Hosting ${run}` });
  await expect(hosting.getByText("Going · You're hosting")).toBeVisible();
  await expect(hosting.getByRole("button")).toHaveCount(0);

  // My Schedule keeps the search, and shows the session RSVPed to and the one hosted.
  await page.getByRole("link", { name: "My Schedule" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My Schedule" })).toBeVisible();
  await expect(page.getByRole("article", { name: `Going ${run}` })).toBeVisible();
  await expect(page.getByRole("article", { name: `Hosting ${run}` })).toBeVisible();
  await expect(page.getByRole("article", { name: `Not going ${run}` })).toHaveCount(0);

  // The session's page counts the RSVP beside its host, and cancelling takes it off My Schedule.
  await page.goto(`/members/schedule/${id}`);
  await expect(page.getByText("1 going, plus the host")).toBeVisible();
  await page.getByRole("button", { name: `Cancel your RSVP to Going ${run}` }).click();
  await expect(page.getByText("0 going, plus the host")).toBeVisible();
  await page.goto(`/members/schedule?view=mine&q=${run}`);
  await expect(page.getByRole("heading", { level: 1, name: "My Schedule" })).toBeVisible();
  await expect(page.getByRole("article", { name: `Going ${run}` })).toHaveCount(0);
});
