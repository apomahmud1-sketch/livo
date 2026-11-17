-- Livo — database schema (run once in the Supabase SQL Editor).
-- Tables: profiles, hosts, call_rates, coin_packs, gifts, calls,
-- transactions, withdrawals, vip_packages, rankings.
-- The admin panel edits call_rates / coin_packs / gifts here, so
-- the app never hard-codes a price forever (see src/config.js).

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  username text,
  country text,
  language text,
  gender text,
  age int,
  bio text,
  avatar_url text,
  coins int not null default 0,
  diamonds int not null default 0,
  vip_until timestamptz,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists hosts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  host_id text unique not null,
  status text not null default 'pending',
  rate_tier text not null default 'tier2',
  total_minutes int not null default 0,
  total_gifts int not null default 0,
  earnings_diamonds int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists call_rates (
  id text primary key,
  name text not null,
  coins_per_minute int not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into call_rates (id, name, coins_per_minute) values
  ('tier1', 'Tier 1', 60),
  ('tier2', 'Tier 2', 120),
  ('tier3', 'Tier 3', 300),
  ('tier4', 'Tier 4', 600),
  ('tier5', 'Tier 5', 1200)
on conflict (id) do nothing;

create table if not exists coin_packs (
  id text primary key,
  coins int not null,
  bonus int not null default 0,
  price_usd numeric(10,2) not null,
  is_active boolean not null default true
);

insert into coin_packs (id, coins, bonus, price_usd) values
  ('pack100', 100, 0, 0.99),
  ('pack500', 500, 0, 4.99),
  ('pack1000', 1000, 100, 9.99),
  ('pack5000', 5000, 500, 49.99),
  ('pack10000', 10000, 1500, 99.99)
on conflict (id) do nothing;

create table if not exists gifts (
  id text primary key,
  name text not null,
  emoji text,
  price_coins int not null,
  is_active boolean not null default true
);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid references profiles(id),
  host_id uuid references hosts(id),
  channel text,
  duration_seconds int not null default 0,
  billed_minutes int not null default 0,
  rate_per_minute int not null,
  cost_coins int not null default 0,
  host_earnings_diamonds int not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  kind text not null,
  amount_coins int not null default 0,
  amount_diamonds int not null default 0,
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references hosts(id),
  amount_diamonds int not null,
  method text not null,
  account text not null,
  status text not null default 'Pending',
  payment_reference text,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create table if not exists vip_packages (
  id text primary key,
  name text not null,
  days int not null,
  price_usd numeric(10,2) not null,
  is_active boolean not null default true
);

insert into vip_packages (id, name, days, price_usd) values
  ('vip1', 'VIP 1', 30, 4.99),
  ('vip2', 'VIP 2', 30, 9.99),
  ('vip3', 'VIP 3', 30, 19.99)
on conflict (id) do nothing;

-- Row Level Security: enable it; add policies in the Supabase
-- dashboard before launch (never leave tables open in production).
alter table profiles enable row level security;
alter table hosts enable row level security;
alter table call_rates enable row level security;
alter table coin_packs enable row level security;
alter table gifts enable row level security;
alter table calls enable row level security;
alter table transactions enable row level security;
alter table withdrawals enable row level security;
alter table vip_packages enable row level security;
