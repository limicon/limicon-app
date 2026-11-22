// Connects the app to team@limicon.org's Google Calendar (docs/feature-calendaring.md → Google
// Calendar). Run it once with `npm run calendar:connect`, and again to replace the access.
//
// It asks for the "limicon-app (Calendar)" OAuth client's ID and secret, opens Google's consent
// page to sign in as team@limicon.org, then:
// - finds or creates the public "Limicon Schedule" calendar and the "Limicon" invites calendar,
// - puts their ids in wrangler.jsonc,
// - saves the client and refresh token as Worker secrets, through `wrangler secret put`, so no
//   secret is printed or written to a file.
//
// --dry-run stops after signing in and finding the calendars: nothing is created or saved.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createInterface } from "node:readline";

const DRY_RUN = process.argv.includes("--dry-run");
const ACCOUNT = "team@limicon.org";
const SCHEDULE = { summary: "Limicon Schedule", marker: "limicon-app:schedule" };
const INVITES = { summary: "Limicon", marker: "limicon-app:invites" };

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Shows nothing as the secret is typed or pasted.
      rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function signIn(clientId, clientSecret) {
  const state = randomBytes(16).toString("hex");
  const { code, redirectUri } = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/") return res.writeHead(404).end();
      const error = url.searchParams.get("error");
      const ok = !error && url.searchParams.get("state") === state && url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(ok ? "<p>Done. You can close this tab and go back to the terminal.</p>" : "<p>That didn't work. Go back to the terminal.</p>");
      server.close();
      if (ok) resolve({ code: url.searchParams.get("code"), redirectUri: `http://127.0.0.1:${port}` });
      else reject(new Error(`Google sign-in didn't finish: ${error ?? "unexpected reply"}`));
    });
    let port;
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/calendar",
        access_type: "offline",
        prompt: "consent",
        login_hint: ACCOUNT,
        state,
      }).toString();
      console.log(`\nOpening Google in your browser. Sign in as ${ACCOUNT} and allow access.`);
      console.log(`If no browser opens, open this address:\n${auth}\n`);
      spawn("open", [auth.toString()], { stdio: "ignore" }).on("error", () => {});
    });
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const tokens = await response.json();
  if (!response.ok) throw new Error(`Google refused the sign-in: ${tokens.error ?? response.status}`);
  if (!tokens.refresh_token) throw new Error("Google sent no refresh token. Run this again: it asks for consent each time.");
  return tokens;
}

async function google(token, method, path, body) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`Google Calendar ${method} ${path} failed: ${json?.error?.message ?? response.status}`);
  return json;
}

async function findOrCreate(token, calendars, { summary, marker }, description) {
  const found = calendars.find((c) => c.accessRole === "owner" && c.description?.includes(marker));
  if (found) {
    console.log(`Found "${found.summary}": ${found.id}`);
    return found.id;
  }
  if (DRY_RUN) {
    console.log(`Would create "${summary}".`);
    return "";
  }
  const created = await google(token, "POST", "/calendars", {
    summary,
    description: `${description}\n\n(${marker})`,
    timeZone: "UTC",
  });
  console.log(`Created "${summary}": ${created.id}`);
  return created.id;
}

function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["wrangler", "secret", "put", name], { stdio: ["pipe", "inherit", "inherit"] });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`wrangler secret put ${name} failed`))));
    child.stdin.end(value);
  });
}

function setVar(name, value) {
  const path = new URL("../wrangler.jsonc", import.meta.url);
  const text = readFileSync(path, "utf8");
  const next = text.replace(new RegExp(`("${name}":\\s*)"[^"]*"`), `$1${JSON.stringify(value)}`);
  if (next === text && !text.includes(`"${name}": ${JSON.stringify(value)}`)) throw new Error(`${name} isn't in wrangler.jsonc`);
  writeFileSync(path, next);
}

const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || (await ask("Client ID: "));
const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || (await ask("Client secret (hidden as you paste it): ", { hidden: true }));
if (!clientId || !clientSecret) throw new Error("The client ID and secret are both needed.");

const tokens = await signIn(clientId, clientSecret);
const primary = await google(tokens.access_token, "GET", "/calendars/primary");
if (primary.id.toLowerCase() !== ACCOUNT) {
  throw new Error(`You signed in as ${primary.id}. Run this again and sign in as ${ACCOUNT}.`);
}
console.log(`Signed in as ${primary.id}.`);

const { items: calendars = [] } = await google(tokens.access_token, "GET", "/users/me/calendarList?maxResults=250");
const scheduleId = await findOrCreate(
  tokens.access_token,
  calendars,
  SCHEDULE,
  "Every session on the Limicon schedule. The Limicon app keeps it up to date: don't edit its events here, edit the sessions in the app.",
);
const invitesId = await findOrCreate(
  tokens.access_token,
  calendars,
  INVITES,
  "Members' invites to the sessions they RSVP to, one event per member, kept by the Limicon app. Hide this calendar rather than edit it.",
);

if (DRY_RUN) {
  console.log("\nDry run: nothing created or saved.");
  process.exit(0);
}

try {
  await google(tokens.access_token, "POST", `/calendars/${encodeURIComponent(scheduleId)}/acl`, { role: "reader", scope: { type: "default" } });
  console.log(`"${SCHEDULE.summary}" is public, so anyone can subscribe to it.`);
} catch (error) {
  console.log(`\nCouldn't make "${SCHEDULE.summary}" public (${error.message}).`);
  console.log("In Google Calendar, open its Settings and sharing, and tick Make available to public.\n");
}

setVar("GOOGLE_CALENDAR_ID", scheduleId);
setVar("GOOGLE_INVITES_CALENDAR_ID", invitesId);
console.log("Saved both calendar ids in wrangler.jsonc. Commit and deploy that change.");

const save = await ask("\nSave the client and refresh token as the live app's secrets now? (y/n) ");
if (save.toLowerCase().startsWith("y")) {
  await putSecret("GOOGLE_CALENDAR_CLIENT_ID", clientId);
  await putSecret("GOOGLE_CALENDAR_CLIENT_SECRET", clientSecret);
  await putSecret("GOOGLE_CALENDAR_REFRESH_TOKEN", tokens.refresh_token);
  console.log("Saved. The calendar sync starts once the app with these calendar ids is deployed.");
} else {
  console.log("Nothing saved. Run this again when you're ready.");
}
