-- Everyone needs their own account and ticket, so an order buys exactly one ticket, for the
-- buyer. A person can start several checkouts, but only one order per edition can be paid or
-- comped; a refunded order frees them to buy again.
alter table public.orders drop column quantity;

create unique index orders_one_per_person_per_edition
  on public.orders (buyer_id, edition_id)
  where status in ('paid', 'comp');
