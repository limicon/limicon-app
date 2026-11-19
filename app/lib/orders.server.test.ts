/// <reference types="node" />
// Vitest runs this in Node, which the app's own tsconfig doesn't include.
import postgres from "postgres";
import { afterAll, describe, expect, test } from "vitest";

import { readGuestFilters, readOrderFilters } from "./admin-tables";
import type { Db } from "./db.server";
import { getEventDetails, saveEventDetails } from "./event.server";
import { countGuests, getOrderSummary, listGuests, listOrders } from "./orders.server";
import { getSiteDocument, saveSiteDocument } from "./site-documents.server";
import { getPage, listMenuPages, movePage, savePage } from "./site-pages.server";

// Runs against the local Supabase database from `npm run db:start`.
const sql = postgres(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

async function inRolledBackTransaction(work: (tx: Db) => Promise<void>) {
  const rollback = new Error("rollback");
  await expect(
    sql.begin(async (tx) => {
      await work(tx as unknown as Db);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

async function person(tx: Db, first: string, last: string) {
  const [user] = await tx<{ id: string }[]>`
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (gen_random_uuid(), ${`${first.toLowerCase()}-${crypto.randomUUID().slice(0, 6)}@example.org`}, 'authenticated', 'authenticated',
            ${tx.json({ given_name: first, family_name: last })})
    returning id
  `;
  return user!.id;
}

async function edition(tx: Db) {
  const [row] = await tx<{ id: string }[]>`insert into public.editions (year) values (2099) returning id`;
  return Number(row!.id);
}

async function order(tx: Db, editionId: number, buyer: string, status: string, quantity: number, cents: number, at: string) {
  const [row] = await tx<{ id: string }[]>`
    insert into public.orders (edition_id, buyer_id, quantity, status, amount_cents, created_at)
    values (${editionId}, ${buyer}, ${quantity}, ${status}, ${cents}, ${at})
    returning id
  `;
  if (status === "paid" || status === "comp") {
    await tx`
      insert into public.tickets (profile_id, edition_id, status, amount_paid_cents, order_id)
      values (${buyer}, ${editionId}, ${status}, ${cents}, ${row!.id})
    `;
  }
}

describe("orders", () => {
  test("sum up, sort by any column, and filter to incomplete ones", async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await edition(tx);
      const ada = await person(tx, "Ada", "Lovelace");
      const bo = await person(tx, "Bo", "Zhang");
      const cy = await person(tx, "Cy", "Adams");
      await order(tx, id, ada, "paid", 3, 15000, "2027-01-03");
      await order(tx, id, bo, "pending", 1, 5000, "2027-01-05");
      await order(tx, id, cy, "comp", 1, 0, "2027-01-04");

      expect(await getOrderSummary(tx, id)).toEqual({ orders: 2, ticketsPurchased: 3, revenueCents: 15000, incomplete: 1 });

      const names = async (query: Record<string, string>) =>
        (await listOrders(tx, id, readOrderFilters(new URLSearchParams(query)))).map((o) => o.name);
      expect(await names({})).toEqual(["Bo Zhang", "Cy Adams", "Ada Lovelace"]);
      expect(await names({ sort: "name", dir: "asc" })).toEqual(["Ada Lovelace", "Bo Zhang", "Cy Adams"]);
      expect(await names({ sort: "name", dir: "desc" })).toEqual(["Cy Adams", "Bo Zhang", "Ada Lovelace"]);
      expect(await names({ sort: "price", dir: "desc" })).toEqual(["Ada Lovelace", "Bo Zhang", "Cy Adams"]);
      expect(await names({ status: "pending" })).toEqual(["Bo Zhang"]);
      expect(await names({ q: "lovelace" })).toEqual(["Ada Lovelace"]);
      // A download of everything ignores the filters.
      expect(await listOrders(tx, id, readOrderFilters(new URLSearchParams({ status: "pending" })), false)).toHaveLength(3);
    });
  });
});

describe("guests", () => {
  test("are ticket holders only, by first name or last name, with their address", async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await edition(tx);
      const ada = await person(tx, "Ada", "Lovelace");
      const cy = await person(tx, "Cy", "Adams");
      const bo = await person(tx, "Bo", "Zhang");
      await order(tx, id, ada, "paid", 1, 5000, "2027-01-03");
      await order(tx, id, cy, "comp", 1, 0, "2027-01-04");
      await order(tx, id, bo, "pending", 1, 5000, "2027-01-05");
      await tx`insert into public.registration_answers (profile_id, edition_id, question, answer) values (${ada}, ${id}, 'address', '1 Main St')`;

      expect(await countGuests(tx, id)).toBe(2);
      const byFirst = await listGuests(tx, id, readGuestFilters(new URLSearchParams()));
      expect(byFirst.map((g) => g.firstName)).toEqual(["Ada", "Cy"]);
      expect(byFirst[0]).toMatchObject({ lastName: "Lovelace", address: "1 Main St" });
      const byLast = await listGuests(tx, id, readGuestFilters(new URLSearchParams({ sort: "last" })));
      expect(byLast.map((g) => g.lastName)).toEqual(["Adams", "Lovelace"]);
    });
  });
});

test("the event's details save, with calendar days that follow the start and end", async () => {
  await inRolledBackTransaction(async (tx) => {
    const id = await edition(tx);
    const about = { type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Hello" }] }] };
    const replaced = await saveEventDetails(tx, id, {
      name: "Limicon 2099",
      teaser: "Open space",
      // 2099-03-07 03:00 UTC is still 6 March in Toronto.
      startsAt: new Date("2099-03-07T03:00:00Z"),
      endsAt: new Date("2099-04-03T20:00:00Z"),
      startTimeZone: "America/Toronto",
      endTimeZone: "Europe/London",
      imageKey: "3f2a9c1e-1111-4222-8333-444455556666.png",
      about,
    });
    expect(replaced).toBeNull();
    expect(await getEventDetails(tx, id)).toMatchObject({ name: "Limicon 2099", teaser: "Open space", about });
    const [days] = await tx`select to_char(starts_on, 'YYYY-MM-DD') as first, to_char(ends_on, 'YYYY-MM-DD') as last from public.editions where id = ${id}`;
    expect(days).toEqual({ first: "2099-03-06", last: "2099-04-03" });

    const again = await saveEventDetails(tx, id, { ...(await getEventDetails(tx, id)), imageKey: null });
    expect(again).toBe("3f2a9c1e-1111-4222-8333-444455556666.png");
  });
});

test("an edited policy replaces the built-in text", async () => {
  await inRolledBackTransaction(async (tx) => {
    const by = await person(tx, "Ada", "Lovelace");
    await tx`update public.site_documents set body = null where slug = 'privacy'`;
    expect((await getSiteDocument(tx, "privacy"))?.body).toBeNull();
    const body = { type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "New policy" }] }] };
    await saveSiteDocument(tx, "privacy", body, by);
    expect(await getSiteDocument(tx, "privacy")).toMatchObject({ title: "Privacy Policy", body, updatedBy: "Ada Lovelace" });
  });
});

test("pages save, refuse a taken address, and fill the menu in order when published", async () => {
  await inRolledBackTransaction(async (tx) => {
    const by = await person(tx, "Ada", "Lovelace");
    await tx`delete from public.site_pages where slug <> 'home'`;
    const meta = (slug: string, published = true) => ({ title: slug, slug, menuLabel: "", inMenu: true, published });
    expect(await savePage(tx, null, meta("history"), [], by)).toBe("saved");
    expect(await savePage(tx, null, meta("contact"), [], by)).toBe("saved");
    expect(await savePage(tx, null, meta("drafty", false), [], by)).toBe("saved");
    expect(await savePage(tx, null, meta("history"), [], by)).toBe("taken");

    expect((await listMenuPages(tx)).map((p) => p.slug)).toEqual(["history", "contact"]);
    await movePage(tx, "contact", -1);
    expect((await listMenuPages(tx)).map((p) => p.slug)).toEqual(["contact", "history"]);

    // Renaming keeps the page, under its new address.
    expect(await savePage(tx, "history", { ...meta("our-history"), menuLabel: "History" }, [{ id: "e", type: "event", background: "plain" }], by)).toBe("saved");
    expect(await getPage(tx, "history")).toBeNull();
    expect(await getPage(tx, "our-history")).toMatchObject({ menuLabel: "History", sections: [{ type: "event" }], updatedBy: "Ada Lovelace" });
    expect((await listMenuPages(tx)).map((p) => p.label)).toEqual(["contact", "History"]);
  });
});
