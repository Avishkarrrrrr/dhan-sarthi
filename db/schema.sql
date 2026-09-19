-- Dhan Sarthi — customer 360° schema (Amazon RDS for PostgreSQL 16)
--
-- Mirrors lib/data/types.ts. The CHECK constraints below intentionally
-- duplicate the TypeScript union types: the database is the last line of
-- defence against an asset class or risk profile the finance layer cannot
-- classify, which would otherwise silently drop value out of allocation().
--
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql

begin;

create table if not exists customers (
  id              text primary key,
  name            text        not null,
  age             integer     not null check (age > 0 and age < 120),
  persona         text        not null,
  city            text        not null,
  monthly_income  numeric(14,2) not null check (monthly_income >= 0),
  risk_profile    text        not null
                    check (risk_profile in ('conservative', 'moderate', 'aggressive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists holdings (
  id           bigserial primary key,
  customer_id  text          not null references customers(id) on delete cascade,
  asset_class  text          not null
                 check (asset_class in ('equity', 'mutual_fund', 'bonds', 'fd', 'gold', 'cash')),
  name         text          not null,
  -- Current market value in INR.
  value        numeric(16,2) not null check (value >= 0),
  created_at   timestamptz   not null default now()
);

create table if not exists transactions (
  id           bigserial primary key,
  customer_id  text          not null references customers(id) on delete cascade,
  date         date          not null,
  category     text          not null,
  -- > 0 is a credit (income), < 0 is a debit (spend). Deliberately unsigned by
  -- constraint: the sign carries meaning and must not be normalised away.
  amount       numeric(16,2) not null,
  created_at   timestamptz   not null default now()
);

create table if not exists goals (
  -- Goal ids are only unique within a customer (e.g. every customer may have a
  -- 'retirement'), so the primary key is composite rather than id alone.
  id              text          not null,
  customer_id     text          not null references customers(id) on delete cascade,
  label           text          not null,
  target_amount   numeric(16,2) not null check (target_amount > 0),
  target_year     integer       not null check (target_year >= 2000),
  -- 'current' is reserved in SQL, hence current_amount.
  current_amount  numeric(16,2) not null default 0 check (current_amount >= 0),
  created_at      timestamptz   not null default now(),
  primary key (customer_id, id)
);

-- Every read path filters by customer_id, so these carry the query plan.
create index if not exists holdings_customer_idx     on holdings (customer_id);
create index if not exists transactions_customer_idx on transactions (customer_id, date);
create index if not exists goals_customer_idx        on goals (customer_id);

commit;
