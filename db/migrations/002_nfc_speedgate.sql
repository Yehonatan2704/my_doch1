-- Additive rollout for an existing Doch1 database. This preserves all users and reports.
-- Safe to run more than once. Run with the direct DATABASE_URL after setting NFC_CARD_HMAC_SECRET on the API host:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_nfc_speedgate.sql

begin;

alter table reports drop constraint if exists reports_source_check;
alter table reports add constraint reports_source_check
  check (source in ('self', 'commander', 'hr', 'cpr', 'people_digital', 'nfc')); -- keep in sync with init.sql

create table if not exists bases (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  name        text not null check (char_length(name) between 1 and 80),
  timezone    text not null default 'Asia/Jerusalem' check (timezone = 'Asia/Jerusalem'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists nfc_readers (
  id             uuid primary key default gen_random_uuid(),
  base_id        uuid not null references bases(id) on delete restrict,
  name           text not null check (char_length(name) between 1 and 80),
  key_hash       text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  is_active      boolean not null default true,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists nfc_readers_base_idx on nfc_readers (base_id);

create table if not exists user_nfc_cards (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  serial_fingerprint   text not null unique check (serial_fingerprint ~ '^[0-9a-f]{64}$'),
  serial_last4         text not null check (serial_last4 ~ '^[0-9]{1,4}$'),
  enrolled_by          uuid not null references users(id),
  enrolled_at          timestamptz not null default now(),
  revoked_at           timestamptz
);
create unique index if not exists user_nfc_cards_one_active_per_user
  on user_nfc_cards (user_id) where revoked_at is null;
create index if not exists user_nfc_cards_user_idx on user_nfc_cards (user_id);

create table if not exists base_visits (
  id          uuid primary key default gen_random_uuid(),
  base_id     uuid not null references bases(id) on delete restrict,
  user_id     uuid not null references users(id) on delete cascade,
  card_id     uuid not null references user_nfc_cards(id) on delete restrict,
  entered_at  timestamptz not null default now(),
  exited_at   timestamptz,
  created_at  timestamptz not null default now(),
  check (exited_at is null or exited_at >= entered_at)
);
create unique index if not exists base_visits_one_open_per_user
  on base_visits (user_id) where exited_at is null;
create index if not exists base_visits_user_time_idx on base_visits (user_id, entered_at desc);
create index if not exists base_visits_base_time_idx on base_visits (base_id, entered_at desc);

create table if not exists nfc_scan_events (
  id                   uuid primary key default gen_random_uuid(),
  reader_id            uuid not null references nfc_readers(id) on delete restrict,
  base_id              uuid not null references bases(id) on delete restrict,
  card_id              uuid references user_nfc_cards(id) on delete set null,
  user_id              uuid references users(id) on delete set null,
  card_fingerprint     text not null check (card_fingerprint ~ '^[0-9a-f]{64}$'),
  request_id           uuid not null,
  result               text not null check (result in ('entry', 'exit', 'duplicate', 'unknown_card', 'inactive_user', 'wrong_base')),
  visit_id             uuid references base_visits(id) on delete set null,
  scanned_at           timestamptz not null default now(),
  unique (reader_id, request_id)
);
create index if not exists nfc_scan_events_card_time_idx on nfc_scan_events (card_fingerprint, scanned_at desc);
create index if not exists nfc_scan_events_user_time_idx on nfc_scan_events (user_id, scanned_at desc);
create index if not exists nfc_scan_events_base_time_idx on nfc_scan_events (base_id, scanned_at desc);

create table if not exists nfc_presence_days (
  visit_id      uuid not null references base_visits(id) on delete cascade,
  report_date   date not null,
  report_id     uuid references reports(id) on delete set null,
  result        text not null check (result in ('created', 'already_present', 'conflict', 'finalized_conflict')),
  created_at    timestamptz not null default now(),
  primary key (visit_id, report_date)
);
create index if not exists nfc_presence_days_date_idx on nfc_presence_days (report_date);

alter table bases               enable row level security;
alter table nfc_readers         enable row level security;
alter table user_nfc_cards      enable row level security;
alter table base_visits         enable row level security;
alter table nfc_scan_events     enable row level security;
alter table nfc_presence_days   enable row level security;

insert into bases (id, code, name) values ('00000000-0000-0000-0000-00000000b001', 'test-base', 'בסיס בדיקה')
on conflict (code) do nothing;

commit;
