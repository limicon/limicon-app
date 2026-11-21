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
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Cancel your RSVP to Going ${run}` }).click();
  await expect(page.getByText("0 going, plus the host")).toBeVisible();
  await page.goto(`/members/schedule?view=mine&q=${run}`);
  await expect(page.getByRole("heading", { level: 1, name: "My Schedule" })).toBeVisible();
  await expect(page.getByRole("article", { name: `Going ${run}` })).toHaveCount(0);
});

test("members switch between the list, 3 Day and Monthly views, and move through the days", async ({ page, request }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const email = newEmail();
  await signIn(page, request, email);
  await giveTicket(email);
  const session = (title: string, startsAt: string, minutes = 60) =>
    publishSession({ hostEmail: email, title, theme: "Consciousness Exploration", startsAt, minutes, timeZone: "America/Toronto" });
  // Two at once on 17 March, 16:00 London time, and one the next day.
  const id = await session(`Thresholds ${run}`, "2027-03-17T16:00:00Z", 90);
  await session(`Overlap ${run}`, "2027-03-17T16:30:00Z");
  await session(`Games ${run}`, "2027-03-18T16:00:00Z");

  await page.goto(`/members/schedule?q=${run}`);
  await expect(page.getByRole("link", { name: "List", exact: true })).toHaveAttribute("aria-current", "page");

  // 3 Day keeps the search and remembers the layout and days in the URL.
  await page.getByRole("link", { name: "3 Day" }).click();
  await expect(page).toHaveURL(/layout=3day/);
  await page.goto(`/members/schedule?q=${run}&layout=3day&date=2027-03-16`);
  await expect(page.getByRole("heading", { name: "March 16 – 18, 2027" })).toBeVisible();
  const wednesday = page.getByRole("list", { name: /Wednesday, Mar 17/ });
  await expect(wednesday.getByRole("link", { name: new RegExp(`Thresholds ${run}.*4:00`) })).toBeVisible();
  await expect(wednesday.getByRole("link", { name: new RegExp(`Overlap ${run}`) })).toBeVisible();
  await expect(page.getByLabel("When")).toHaveCount(0);
  await page.getByRole("link", { name: "Next 3 days" }).click();
  await expect(page).toHaveURL(/date=2027-03-19/);
  await expect(page.getByText("No sessions on these days.")).toBeVisible();
  await page.getByRole("link", { name: "Previous 3 days" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`Games ${run}`) })).toBeVisible();

  // Monthly opens on the same month; hovering a date lists its sessions with links.
  await page.getByRole("link", { name: "Monthly" }).click();
  await expect(page).toHaveURL(/layout=month&date=2027-03-16/);
  await expect(page.getByRole("heading", { name: "March 2027" })).toBeVisible();
  const date = page.getByRole("button", { name: "Wednesday, March 17, 2 sessions" });
  await date.hover();
  const popup = page.getByRole("dialog", { name: /Wednesday, March 17/ });
  await expect(popup.getByRole("link", { name: `Thresholds ${run}` })).toBeVisible();
  await expect(popup).toContainText(/4:00\s*–\s*5:30\sPM/);
  await page.mouse.move(0, 0);
  await expect(popup).toHaveCount(0);

  // By keyboard: focus opens it, Escape closes it.
  await date.focus();
  await expect(popup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(date).toBeFocused();
  await page.keyboard.press("Enter");
  await popup.getByRole("link", { name: `Thresholds ${run}` }).click();
  await expect(page).toHaveURL(`/members/schedule/${id}`);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "March 2027" })).toBeVisible();

  // A session published while the month is open appears without a reload (CAL-4).
  await session(`Arrived later ${run}`, "2027-03-19T16:00:00Z");
  await expect(page.getByRole("button", { name: "Friday, March 19, 1 session" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("link", { name: "April" }).click();
  await expect(page.getByRole("heading", { name: "April 2027" })).toBeVisible();
  await expect(page.getByText("No sessions this month.")).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("tapping a date in the Monthly view opens its sessions, and the X closes them", async ({ page, request }) => {
    const run = crypto.randomUUID().slice(0, 8);
    const email = newEmail();
    await signIn(page, request, email);
    await giveTicket(email);
    await publishSession({
      hostEmail: email,
      title: `Phone ${run}`,
      theme: "Consciousness Exploration",
      startsAt: "2027-03-17T16:00:00Z",
      minutes: 60,
      timeZone: "UTC",
    });

    await page.goto(`/members/schedule?q=${run}&layout=month&date=2027-03-01`);
    await page.getByRole("button", { name: "Wednesday, March 17, 1 session" }).tap();
    const popup = page.getByRole("dialog", { name: /Wednesday, March 17/ });
    await expect(popup.getByRole("link", { name: `Phone ${run}` })).toBeVisible();
    await popup.getByRole("button", { name: "Close" }).tap();
    await expect(popup).toHaveCount(0);
  });
});
