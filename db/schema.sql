-- ============================================================
-- Event Ticketing — Supabase / Postgres schema
-- Run this in Supabase: Dashboard > SQL Editor > New query > paste > Run
-- ============================================================

-- EVENTS -----------------------------------------------------
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,            -- used in URLs/config, e.g. 'summer-bash'
  name         text not null,
  event_date   timestamptz,
  venue        text,
  price_cents  int  not null,                   -- price per ticket, in cents (e.g. 2500 = $25.00)
  currency     text not null default 'USD',
  total_seats  int  not null,
  seats_sold   int  not null default 0,
  created_at   timestamptz default now()
);

-- ORDERS (one row per successful payment) --------------------
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references events(id),
  paypal_order_id text unique,                  -- idempotency: prevents double-fulfillment
  buyer_name      text,
  buyer_email     text not null,
  quantity        int  not null,
  amount_cents    int  not null,
  currency        text not null default 'USD',
  payment_status  text not null default 'paid', -- paid | refunded
  created_at      timestamptz default now()
);

-- TICKETS (one row per seat) ---------------------------------
create table if not exists tickets (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid references orders(id) on delete cascade,
  event_id      uuid references events(id),
  ticket_code   text unique not null,           -- the value encoded in the QR code
  holder_name   text,
  checked_in    boolean not null default false,
  checked_in_at timestamptz,
  created_at    timestamptz default now()
);

create index if not exists idx_tickets_event on tickets(event_id);
create index if not exists idx_orders_event  on orders(event_id);

-- ATOMIC SALE ------------------------------------------------
-- Increments seats_sold ONLY if enough seats remain. Returns true on success,
-- false if it would oversell. Runs as a single atomic UPDATE so concurrent
-- buyers can never push you past total_seats.
create or replace function record_sale(p_event_id uuid, p_qty int)
returns boolean
language plpgsql
as $$
begin
  update events
     set seats_sold = seats_sold + p_qty
   where id = p_event_id
     and seats_sold + p_qty <= total_seats;
  return found;   -- true if a row was updated (seats were available)
end;
$$;

-- Convenience view for the admin dashboard
create or replace view event_summary as
select
  e.id, e.slug, e.name, e.event_date, e.venue,
  e.price_cents, e.currency, e.total_seats, e.seats_sold,
  (e.total_seats - e.seats_sold) as seats_remaining,
  coalesce((select sum(o.amount_cents) from orders o
            where o.event_id = e.id and o.payment_status = 'paid'), 0) as revenue_cents,
  (select count(*) from tickets t where t.event_id = e.id and t.checked_in) as checked_in_count
from events e;

-- ============================================================
-- SEED YOUR EVENT — edit these values, then run this block too
-- ============================================================
insert into events (slug, name, event_date, venue, price_cents, currency, total_seats)
values ('my-event', 'My Event Name', '2026-08-15 19:00:00-04', 'My Venue', 2500, 'USD', 200)
on conflict (slug) do nothing;
