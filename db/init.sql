-- =====================================================================
-- Doch 1 (New) — init.sql
-- Schema + MOCK data. Safe to re-run: it DROPS and recreates everything.
-- Run in Supabase SQL editor, or:  psql "$DATABASE_URL" -f db/init.sql
--
-- BEFORE RUNNING: replace the placeholder emails in the "USERS" section
-- with the real Google accounts of your team, so you can log in as
-- battalion commander / company commander / team commander / soldier.
--   Example: 'cmd.battalion@example.com' -> 'you@gmail.com'
--
-- All names and personal numbers below are FICTIONAL. Never put real data here.
-- =====================================================================

begin;

-- ---------- clean slate ----------
drop table if exists nfc_presence_days   cascade;
drop table if exists nfc_scan_events     cascade;
drop table if exists base_visits         cascade;
drop table if exists user_nfc_cards      cascade;
drop table if exists nfc_readers         cascade;
drop table if exists bases               cascade;
drop table if exists emergency_responses cascade;
drop table if exists emergency_events   cascade;
drop table if exists favorites          cascade;
drop table if exists push_tokens        cascade;
drop table if exists user_week_template cascade;
drop table if exists user_settings      cascade;
drop table if exists report_audit       cascade;
drop table if exists reports            cascade;
drop table if exists documents          cascade;
drop table if exists status_reasons     cascade;
drop table if exists status_categories  cascade;
drop table if exists hr_assignments     cascade;
drop table if exists groups             cascade;
drop table if exists users              cascade;
drop function if exists group_subtree(uuid)            cascade;
drop function if exists commander_group_ids(uuid)      cascade;
drop function if exists hr_group_ids(uuid)             cascade;
drop function if exists is_in_commander_scope(uuid, uuid) cascade;
drop function if exists is_in_hr_scope(uuid, uuid)     cascade;
drop function if exists can_act_on(uuid, uuid)         cascade;
drop function if exists app_today()                    cascade;
drop function if exists set_updated_at()               cascade;

-- =====================================================================
-- SCHEMA
-- =====================================================================

-- ---------- users ----------
create table users (
  id               uuid primary key default gen_random_uuid(),
  personal_number  text not null unique check (personal_number ~ '^[0-9]{7,9}$'),
  first_name       text not null check (char_length(first_name) between 1 and 50),
  last_name        text not null check (char_length(last_name)  between 1 and 50),
  email            text not null check (email = lower(email) and position('@' in email) > 1),
  role             text not null default 'soldier' check (role in ('soldier', 'admin')),
  group_id         uuid,                         -- FK added after groups
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create unique index users_email_uq on users (email);
-- "commander" is NOT a role: a user is a commander if they command >= 1 group.

-- ---------- groups (nested hierarchy) ----------
create table groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 80),
  code          text not null unique,
  parent_id     uuid references groups(id) on delete restrict,
  commander_id  uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index groups_parent_idx    on groups (parent_id);
create index groups_commander_idx on groups (commander_id);

alter table users
  add constraint users_group_fk foreign key (group_id) references groups(id) on delete set null;
create index users_group_idx on users (group_id);

-- ---------- HR (משא"ן) coverage: which groups an HR user is responsible for ----------
-- HR sits OUTSIDE the command hierarchy and has the final word on reports,
-- but only for the units assigned here (and everything below them).
create table hr_assignments (
  hr_user_id  uuid not null references users(id) on delete cascade,
  group_id    uuid not null references groups(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (hr_user_id, group_id)
);
create index hr_assignments_group_idx on hr_assignments (group_id);

-- ---------- statuses ----------
create table status_categories (
  id          smallint generated always as identity primary key,
  code        text not null unique,
  name_he     text not null,
  icon        text not null,
  sort_order  smallint not null
);

create table status_reasons (
  id                 smallint generated always as identity primary key,
  category_id        smallint not null references status_categories(id) on delete restrict,
  code               text not null unique,
  name_he            text not null,
  requires_document  boolean not null default false,
  allows_note        boolean not null default false,
  commander_only     boolean not null default false,
  sort_order         smallint not null
);
create index status_reasons_category_idx on status_reasons (category_id);

-- ---------- documents (sick notes; file lives in private Storage bucket) ----------
create table documents (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references users(id) on delete cascade,
  storage_path  text not null unique,                        -- {userId}/{uuid}.{ext}
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes    integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at    timestamptz not null default now()
);
create index documents_owner_idx on documents (owner_id);

-- ---------- reports (one per soldier per day) ----------
create table reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  report_date       date not null,
  reason_id         smallint not null references status_reasons(id) on delete restrict,
  note              text check (note is null or char_length(note) <= 200),
  document_id       uuid references documents(id) on delete set null,
  source            text not null default 'self' check (source in ('self', 'commander', 'hr', 'cpr', 'people_digital', 'nfc')),
  reported_by       uuid not null references users(id),
  last_modified_by  uuid not null references users(id),
  -- stage 1: commander approval (optional — a commander may never get to it)
  approved_by       uuid references users(id),
  approved_at       timestamptz,
  -- stage 2: HR (משא"ן) finalization — the last word. Locks the day for everyone but HR.
  finalized_by      uuid references users(id),
  finalized_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, report_date),
  check ((approved_by  is null) = (approved_at  is null)),
  check ((finalized_by is null) = (finalized_at is null))
);
create index reports_date_idx         on reports (report_date);
create index reports_user_date_idx    on reports (user_id, report_date desc);
create index reports_pending_idx      on reports (report_date) where approved_at is null;
create index reports_unfinalized_idx  on reports (report_date) where finalized_at is null;

-- ---------- audit log (every change to a report) ----------
create table report_audit (
  id             bigint generated always as identity primary key,
  report_id      uuid,                                   -- null after delete is fine
  user_id        uuid not null references users(id) on delete cascade,  -- the soldier
  report_date    date not null,
  action         text not null check (action in ('create', 'update', 'delete', 'approve', 'finalize', 'unfinalize')),
  actor_id       uuid not null references users(id),
  old_reason_id  smallint references status_reasons(id),
  new_reason_id  smallint references status_reasons(id),
  created_at     timestamptz not null default now()
);
create index report_audit_user_date_idx on report_audit (user_id, report_date);

-- ---------- settings ----------
create table user_settings (
  user_id                  uuid primary key references users(id) on delete cascade,
  reminder_enabled         boolean  not null default false,
  reminder_time            time     not null default '08:00',
  nudge_enabled            boolean  not null default false,
  nudge_interval_min       smallint not null default 30 check (nudge_interval_min in (15, 30, 60)),
  notify_commander_change  boolean  not null default true,
  notify_hr_change         boolean  not null default true,
  weekly_reminder_enabled  boolean  not null default false,
  weekly_reminder_day      smallint not null default 6 check (weekly_reminder_day between 0 and 6),
  weekly_reminder_time     time     not null default '20:00',
  template_onboarded       boolean  not null default false,
  updated_at               timestamptz not null default now()
);

-- Weekly default template (DESIGN §7.8): days = JSON array of 7 entries, index 0 = Sunday,
-- each {"reasonId": n} or null. Shape validated by the API (shared zod schema).
create table user_week_template (
  user_id     uuid primary key references users(id) on delete cascade,
  days        jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) = 7),
  updated_at  timestamptz not null default now()
);

-- ---------- push tokens ----------
create table push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token       text not null unique check (char_length(token) <= 255),
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now()
);
create index push_tokens_user_idx on push_tokens (user_id);

-- ---------- favorites (commander star = pin) ----------
create table favorites (
  commander_id  uuid not null references users(id) on delete cascade,
  soldier_id    uuid not null references users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (commander_id, soldier_id),
  check (commander_id <> soldier_id)
);

-- ---------- emergency ("ירוק בעיניים") ----------
create table emergency_events (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references groups(id) on delete cascade,
  include_subgroups  boolean not null default true,
  started_by         uuid not null references users(id),
  message            text check (message is null or char_length(message) <= 200),
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  ended_by           uuid references users(id),
  check ((ended_at is null) = (ended_by is null))
);
-- only one OPEN event per group
create unique index emergency_one_open_per_group on emergency_events (group_id) where ended_at is null;

create table emergency_responses (
  event_id      uuid not null references emergency_events(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  status        text not null check (status in ('ok', 'need_help')),
  responded_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ---------- NFC speedgate ----------
-- A base owns one or more provisioned readers. Reader secrets and raw Calypso serials are never
-- stored: only one-way hashes are persisted. `user_nfc_cards.user_id` connects the card to the
-- existing user row, whose personal_number remains the canonical personnel identifier.
create table bases (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,49}$'),
  name        text not null check (char_length(name) between 1 and 80),
  timezone    text not null default 'Asia/Jerusalem' check (timezone = 'Asia/Jerusalem'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table nfc_readers (
  id             uuid primary key default gen_random_uuid(),
  base_id        uuid not null references bases(id) on delete restrict,
  name           text not null check (char_length(name) between 1 and 80),
  key_hash       text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  is_active      boolean not null default true,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index nfc_readers_base_idx on nfc_readers (base_id);

create table user_nfc_cards (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  serial_fingerprint   text not null unique check (serial_fingerprint ~ '^[0-9a-f]{64}$'),
  serial_last4         text not null check (serial_last4 ~ '^[0-9]{1,4}$'),
  enrolled_by          uuid not null references users(id),
  enrolled_at          timestamptz not null default now(),
  revoked_at           timestamptz
);
create unique index user_nfc_cards_one_active_per_user
  on user_nfc_cards (user_id) where revoked_at is null;
create index user_nfc_cards_user_idx on user_nfc_cards (user_id);

create table base_visits (
  id          uuid primary key default gen_random_uuid(),
  base_id     uuid not null references bases(id) on delete restrict,
  user_id     uuid not null references users(id) on delete cascade,
  card_id     uuid not null references user_nfc_cards(id) on delete restrict,
  entered_at  timestamptz not null default now(),
  exited_at   timestamptz,
  created_at  timestamptz not null default now(),
  check (exited_at is null or exited_at >= entered_at)
);
-- A soldier can only be currently present at one base.
create unique index base_visits_one_open_per_user on base_visits (user_id) where exited_at is null;
create index base_visits_user_time_idx on base_visits (user_id, entered_at desc);
create index base_visits_base_time_idx on base_visits (base_id, entered_at desc);

create table nfc_scan_events (
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
create index nfc_scan_events_card_time_idx on nfc_scan_events (card_fingerprint, scanned_at desc);
create index nfc_scan_events_user_time_idx on nfc_scan_events (user_id, scanned_at desc);
create index nfc_scan_events_base_time_idx on nfc_scan_events (base_id, scanned_at desc);

-- Records whether each calendar day touched by a visit could be reflected into reports.
-- Manual and finalized reports are never overwritten; those cases remain visible as conflicts.
create table nfc_presence_days (
  visit_id      uuid not null references base_visits(id) on delete cascade,
  report_date   date not null,
  report_id     uuid references reports(id) on delete set null,
  result        text not null check (result in ('created', 'already_present', 'conflict', 'finalized_conflict')),
  created_at    timestamptz not null default now(),
  primary key (visit_id, report_date)
);
create index nfc_presence_days_date_idx on nfc_presence_days (report_date);

-- =====================================================================
-- HELPERS
-- =====================================================================

-- "Today" in Israel, regardless of the DB server time zone.
create function app_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Jerusalem')::date;
$$;

-- A group and all groups below it.
create function group_subtree(p_root uuid) returns setof uuid
language sql stable set search_path = public as $$
  with recursive t as (
    select id from groups where id = p_root
    union
    select g.id from groups g join t on g.parent_id = t.id
  )
  select id from t;
$$;

-- All groups a user commands, including everything below them.
create function commander_group_ids(p_commander uuid) returns setof uuid
language sql stable set search_path = public as $$
  with recursive t as (
    select id from groups where commander_id = p_commander
    union
    select g.id from groups g join t on g.parent_id = t.id
  )
  select id from t;
$$;

-- All groups an HR user covers, including everything below them.
create function hr_group_ids(p_hr uuid) returns setof uuid
language sql stable set search_path = public as $$
  with recursive t as (
    select a.group_id as id
    from hr_assignments a
    join users u on u.id = a.hr_user_id
    where a.hr_user_id = p_hr and u.role = 'admin' and u.is_active
    union
    select g.id from groups g join t on g.parent_id = t.id
  )
  select id from t;
$$;

-- Can this commander act on this soldier? (never on themselves)
create function is_in_commander_scope(p_commander uuid, p_soldier uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from users u
    where u.id = p_soldier
      and u.id <> p_commander
      and u.is_active
      and u.group_id in (select commander_group_ids(p_commander))
  );
$$;

-- Can this HR user act on this soldier? HR is outside the chain: it covers whole
-- assigned units, including their commanders, but never itself.
create function is_in_hr_scope(p_hr uuid, p_soldier uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from users u
    where u.id = p_soldier
      and u.id <> p_hr
      and u.is_active
      and u.group_id in (select hr_group_ids(p_hr))
  );
$$;

-- The single check the API uses before touching someone else's report.
create function can_act_on(p_actor uuid, p_soldier uuid) returns boolean
language sql stable set search_path = public as $$
  select is_in_commander_scope(p_actor, p_soldier) or is_in_hr_scope(p_actor, p_soldier);
$$;

create function set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger reports_updated_at       before update on reports       for each row execute function set_updated_at();
create trigger user_settings_updated_at before update on user_settings for each row execute function set_updated_at();
create trigger user_week_template_updated_at before update on user_week_template for each row execute function set_updated_at();

-- =====================================================================
-- SECURITY: RLS on, NO policies -> Supabase anon/auth REST API sees nothing.
-- Only the backend (direct Postgres connection as table owner) can access data.
-- =====================================================================
alter table users               enable row level security;
alter table groups              enable row level security;
alter table hr_assignments      enable row level security;
alter table status_categories   enable row level security;
alter table status_reasons      enable row level security;
alter table documents           enable row level security;
alter table reports             enable row level security;
alter table report_audit        enable row level security;
alter table user_settings       enable row level security;
alter table user_week_template  enable row level security;
alter table push_tokens         enable row level security;
alter table favorites           enable row level security;
alter table emergency_events    enable row level security;
alter table emergency_responses enable row level security;
alter table bases               enable row level security;
alter table nfc_readers         enable row level security;
alter table user_nfc_cards      enable row level security;
alter table base_visits         enable row level security;
alter table nfc_scan_events     enable row level security;
alter table nfc_presence_days   enable row level security;

-- =====================================================================
-- MOCK DATA
-- =====================================================================

-- ---------- statuses (fixed list for MVP) ----------
insert into status_categories (code, name_he, icon, sort_order) values
  ('on_base',      'נמצא/ת ביחידה', 'flag',   1),
  ('outside_unit', 'מחוץ ליחידה',   'map-pin',2),
  ('annual_leave', 'חופשה שנתית',   'sun',    3),
  ('abroad',       'חו"ל',          'plane',  4),
  ('sick_leave',   'חופשת מחלה',    'pill',   5);

-- Fictional development base. Provision its reader through POST /api/v1/nfc/readers; never seed
-- a reusable reader secret in source control.
insert into bases (id, code, name) values
  ('00000000-0000-0000-0000-00000000b001', 'test-base', 'בסיס בדיקה');

insert into status_reasons (category_id, code, name_he, requires_document, allows_note, commander_only, sort_order)
select c.id, v.code, v.name_he, v.req_doc, v.note, v.cmd_only, v.sort
from (values
  ('on_base',      'present',               'נוכח/ת',                     false, false, false, 1),

  ('outside_unit', 'role_outside_unit',     'בתפקיד מחוץ ליחידה',         false, true,  false, 1),
  ('outside_unit', 'after_duty',            'אחרי תורנות / משמרת',        false, true,  false, 2),
  ('outside_unit', 'shift_worker',          'עובד/ת משמרות',              false, false, false, 3),
  ('outside_unit', 'medical_referral',      'הפניה רפואית',               false, false, false, 4),
  ('outside_unit', 'errands_day',           'יום סידורים',                false, false, false, 5),
  ('outside_unit', 'evening_shift',         'משמרת ערב',                  false, false, false, 6),
  ('outside_unit', 'security_duty',         'אבט"ש',                      false, false, false, 7),
  ('outside_unit', 'line_rotation',         'סבב קו',                     false, false, false, 8),
  ('outside_unit', 'training_local',        'השתלמות מקצועית בארץ',       false, true,  false, 9),
  ('outside_unit', 'course',                'בקורס / בהכשרה',             false, false, true,  10),
  ('outside_unit', 'attached_other_unit',   'מסופח/ת ליחידה אחרת',        false, false, true,  11),

  ('annual_leave', 'annual_leave',          'חופשה שנתית',                false, false, false, 1),
  ('annual_leave', 'driver_leave',          'חופשת נהג/ת מבצעי',          false, false, false, 2),
  ('annual_leave', 'ethnic_holiday',        'חג עדתי',                    false, false, false, 3),
  ('annual_leave', 'memorial',              'אזכרה - קרבה ראשונה',        false, false, false, 4),

  ('abroad',       'training_abroad',       'השתלמות מקצועית בחו"ל',      false, true,  false, 1),
  ('abroad',       'driver_leave_abroad',   'חופשת נהג מבצעי',            false, false, false, 2),

  ('sick_leave',   'sick_gimelim',          'חופשת מחלה (גימלים)',        true,  false, false, 1),
  ('sick_leave',   'sick_day_d',            'יום ד''',                    false, false, false, 2)
) as v(cat, code, name_he, req_doc, note, cmd_only, sort)
join status_categories c on c.code = v.cat;

-- ---------- USERS (fictional) — REPLACE EMAILS WITH YOUR GOOGLE ACCOUNTS ----------
insert into users (id, personal_number, first_name, last_name, email, role) values
  -- commanders
  ('00000000-0000-0000-0000-000000000001', '9000001', 'רועי',  'אלמוג',  'cmd.battalion@example.com', 'soldier'), -- מג"ד
  ('00000000-0000-0000-0000-000000000002', '9000002', 'מיכל',  'ברק',    'cmd.company@example.com',   'soldier'), -- מ"פ
  ('00000000-0000-0000-0000-000000000003', '9000003', 'עידו',  'גפן',    'cmd.team1@example.com',     'soldier'), -- מפקד צוות 258750
  ('00000000-0000-0000-0000-000000000004', '9000004', 'שירה',  'דרור',   'cmd.team2@example.com',     'soldier'), -- מפקדת צוות 258751
  -- team 258750
  ('00000000-0000-0000-0000-000000000011', '9000011', 'אורי',  'הדר',    'soldier01@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000012', '9000012', 'נועם',  'וולך',   'soldier02@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000013', '9000013', 'תמר',   'זיו',    'soldier03@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000014', '9000014', 'איתי',  'חורש',   'soldier04@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000015', '9000015', 'יעל',   'טל',     'soldier05@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000016', '9000016', 'עומר',  'ינאי',   'soldier06@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000017', '9000017', 'גאיה',  'כרמל',   'soldier07@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000018', '9000018', 'אלון',  'לביא',   'soldier08@example.com',     'soldier'),
  -- team 258751
  ('00000000-0000-0000-0000-000000000021', '9000021', 'הילה',  'מור',    'soldier09@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000022', '9000022', 'יונתן', 'נבו',    'soldier10@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000023', '9000023', 'רותם',  'סער',    'soldier11@example.com',     'soldier'),
  ('00000000-0000-0000-0000-000000000024', '9000024', 'דניאל', 'עמית',   'soldier12@example.com',     'soldier'),
  -- HR (משא"ן): role 'admin', OUTSIDE the command chain (no group_id), scoped by hr_assignments
  ('00000000-0000-0000-0000-000000000098', '9000098', 'אורית', 'משאן',   'hr.battalion@example.com',  'admin'), -- covers גדוד 100 (everyone)
  ('00000000-0000-0000-0000-000000000099', '9000099', 'נטע',  'משאן',   'hr.team2@example.com',      'admin'); -- covers צוות 258751 only

-- ---------- GROUPS: battalion -> company -> 2 teams ----------
insert into groups (id, name, code, parent_id, commander_id) values
  ('00000000-0000-0000-0000-00000000a001', 'גדוד 100',     '100',    null,                                   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000a002', 'פלוגה א',      '100-A',  '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-00000000a003', 'צוות 258750', '258750', '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-00000000a004', 'צוות 258751', '258751', '00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-000000000004');

-- memberships
update users set group_id = '00000000-0000-0000-0000-00000000a001' where id = '00000000-0000-0000-0000-000000000001';
update users set group_id = '00000000-0000-0000-0000-00000000a002' where id = '00000000-0000-0000-0000-000000000002';
update users set group_id = '00000000-0000-0000-0000-00000000a003'
  where id in ('00000000-0000-0000-0000-000000000003',
               '00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012',
               '00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000014',
               '00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000016',
               '00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000018');
update users set group_id = '00000000-0000-0000-0000-00000000a004'
  where id in ('00000000-0000-0000-0000-000000000004',
               '00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000022',
               '00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000024');
-- HR users deliberately keep group_id = NULL: they are not in the chain of command.

-- ---------- HR coverage (per unit, subtree included) ----------
insert into hr_assignments (hr_user_id, group_id) values
  ('00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-00000000a001'),  -- whole battalion
  ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-00000000a004');  -- team 258751 only

-- ---------- settings for everyone ----------
insert into user_settings (user_id, reminder_enabled, nudge_enabled)
select id, (row_number() over (order by personal_number)) % 2 = 0, false from users;

-- ---------- one mock sick-note document ----------
insert into documents (id, owner_id, storage_path, mime_type, size_bytes) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-000000000013',
   '00000000-0000-0000-0000-000000000013/mock-sick-note.pdf', 'application/pdf', 123456);

-- ---------- REPORTS: last 30 days (deterministic mix), approved by team commander ----------
with u as (
  select id, group_id, row_number() over (order by personal_number) as n
  from users where role = 'soldier'
),
d as (
  select k, app_today() - k as day from generate_series(1, 30) as k
),
picked as (
  select u.id as user_id, u.group_id, d.day,
         case
           when (u.n * 7 + d.k) % 13 = 0 then 'annual_leave'
           when (u.n * 5 + d.k) % 17 = 0 then 'sick_day_d'
           when (u.n * 3 + d.k) % 9  = 0 then 'after_duty'
           when (u.n + d.k)     % 19 = 0 then 'role_outside_unit'
           when (u.n * 2 + d.k) % 23 = 0 then 'training_abroad'
           else 'present'
         end as reason_code,
         case when g.commander_id = u.id then pg.commander_id else g.commander_id end as approver
  from u
  cross join d
  join groups g on g.id = u.group_id
  left join groups pg on pg.id = g.parent_id
)
insert into reports (user_id, report_date, reason_id, source, reported_by, last_modified_by, approved_by, approved_at, created_at)
select p.user_id, p.day, r.id, 'self', p.user_id, p.user_id,
       -- approver = commander of the soldier's group; a group's own commander is approved by
       -- the PARENT group's commander. The top commander has nobody above -> stays unapproved.
       p.approver,
       case when p.approver is null then null else (p.day + time '09:30') at time zone 'Asia/Jerusalem' end,
       (p.day + time '07:15') at time zone 'Asia/Jerusalem'
from picked p
join status_reasons r on r.code = p.reason_code;

-- a sick day WITH a document (paperclip in history)
update reports
set reason_id = (select id from status_reasons where code = 'sick_gimelim'),
    document_id = '00000000-0000-0000-0000-0000000d0001'
where user_id = '00000000-0000-0000-0000-000000000013' and report_date = app_today() - 3;

-- notes on reasons that allow them
update reports r set note = 'סיוע למפקדה החטיבתית'
from status_reasons s
where r.reason_id = s.id and s.code = 'role_outside_unit';

-- reports CHANGED BY COMMANDER (red circle): soldier 11, days -2 and -6
update reports
set reason_id = (select id from status_reasons where code = 'course'),
    source = 'commander',
    last_modified_by = '00000000-0000-0000-0000-000000000003'
where user_id = '00000000-0000-0000-0000-000000000011' and report_date in (app_today() - 2, app_today() - 6);

-- report CHANGED BY HR (red circle): soldier 12, day -4 (battalion HR covers this soldier)
update reports
set reason_id = (select id from status_reasons where code = 'attached_other_unit'),
    source = 'hr',
    last_modified_by = '00000000-0000-0000-0000-000000000098'
where user_id = '00000000-0000-0000-0000-000000000012' and report_date = app_today() - 4;

-- ---------- TODAY: some reported (pending approval), some missing ----------
insert into reports (user_id, report_date, reason_id, note, source, reported_by, last_modified_by, created_at)
select v.uid::uuid, app_today(), r.id, v.note, 'self', v.uid::uuid, v.uid::uuid, now() - interval '2 hours'
from (values
  ('00000000-0000-0000-0000-000000000003', 'present',            null),
  ('00000000-0000-0000-0000-000000000011', 'present',            null),
  ('00000000-0000-0000-0000-000000000012', 'present',            null),
  ('00000000-0000-0000-0000-000000000013', 'after_duty',         'משמרת לילה במוצב'),
  ('00000000-0000-0000-0000-000000000014', 'annual_leave',       null),
  ('00000000-0000-0000-0000-000000000015', 'present',            null),
  -- 16, 17, 18 have NOT reported today
  ('00000000-0000-0000-0000-000000000004', 'present',            null),
  ('00000000-0000-0000-0000-000000000021', 'medical_referral',   null),
  ('00000000-0000-0000-0000-000000000022', 'present',            null)
  -- 23, 24 have NOT reported today
) as v(uid, code, note)
join status_reasons r on r.code = v.code;

-- approve two of today's reports (the rest show in "ללא אישור מפקד")
update reports
set approved_by = '00000000-0000-0000-0000-000000000003', approved_at = now() - interval '1 hour'
where report_date = app_today()
  and user_id in ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012');

-- ---------- FUTURE reports (within 7 days) ----------
insert into reports (user_id, report_date, reason_id, source, reported_by, last_modified_by)
select v.uid::uuid, app_today() + v.plus, r.id, 'self', v.uid::uuid, v.uid::uuid
from (values
  ('00000000-0000-0000-0000-000000000011', 1, 'present'),
  ('00000000-0000-0000-0000-000000000011', 2, 'present'),
  ('00000000-0000-0000-0000-000000000014', 1, 'annual_leave'),
  ('00000000-0000-0000-0000-000000000014', 2, 'annual_leave'),
  ('00000000-0000-0000-0000-000000000015', 3, 'errands_day'),
  ('00000000-0000-0000-0000-000000000021', 5, 'training_local')
) as v(uid, plus, code)
join status_reasons r on r.code = v.code;

-- "LAZY COMMANDER": the commander of צוות 258751 never approved anything older than
-- two weeks. Those days stay unapproved at stage 1 and are closed by HR at stage 2.
update reports r
set approved_by = null, approved_at = null
from users u
where u.id = r.user_id
  and u.group_id = '00000000-0000-0000-0000-00000000a004'
  and r.report_date < app_today() - 14;

-- ---------- HR FINALIZATION (stage 2) ----------
-- Days older than a week are closed by the HR user that covers the soldier's unit.
-- This includes days the commander never approved ("lazy commander" case) — HR is the last word.
update reports r
set finalized_by = hr.hr_id,
    finalized_at = (r.report_date + time '23:00') at time zone 'Asia/Jerusalem'
from (
  select u.id as soldier_id,
         -- the most specific HR that covers this soldier (team HR wins over battalion HR)
         (select a.hr_user_id
          from hr_assignments a
          where u.group_id in (select group_subtree(a.group_id))
          order by (select count(*) from group_subtree(a.group_id)) asc
          limit 1) as hr_id
  from users u
  where u.role = 'soldier'
) hr
where r.user_id = hr.soldier_id
  and hr.hr_id is not null
  and r.report_date < app_today() - 7;

-- ---------- audit rows for everything seeded ----------
insert into report_audit (report_id, user_id, report_date, action, actor_id, new_reason_id, created_at)
select id, user_id, report_date, 'create', reported_by, reason_id, created_at from reports;

insert into report_audit (report_id, user_id, report_date, action, actor_id, new_reason_id)
select id, user_id, report_date, 'update', last_modified_by, reason_id
from reports where last_modified_by <> user_id;

insert into report_audit (report_id, user_id, report_date, action, actor_id, new_reason_id, created_at)
select id, user_id, report_date, 'finalize', finalized_by, reason_id, finalized_at
from reports where finalized_at is not null;

-- ---------- favorites (stars) ----------
insert into favorites (commander_id, soldier_id) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000013'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000016');

-- ---------- one past (closed) emergency, for the commander history ----------
insert into emergency_events (id, group_id, include_subgroups, started_by, message, started_at, ended_at, ended_by) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000a002', true,
   '00000000-0000-0000-0000-000000000002', 'תרגיל - נא לדווח מצב',
   now() - interval '3 days', now() - interval '3 days' + interval '40 minutes',
   '00000000-0000-0000-0000-000000000002');

insert into emergency_responses (event_id, user_id, status, responded_at)
select '00000000-0000-0000-0000-0000000e0001', u.id,
       case when u.personal_number = '9000022' then 'need_help' else 'ok' end,
       now() - interval '3 days' + interval '5 minutes'
from users u
where u.group_id in (select group_subtree('00000000-0000-0000-0000-00000000a002'))
  and u.personal_number not in ('9000018', '9000024');   -- two never answered

-- ---------- SYSTEM USERS for external integrations (I1, SPEC F11/F12) ----------
-- They own the reports that CPR / אנשים בדיגיטל write (reported_by, last_modified_by, audit actor),
-- so the soldier's history shows "מערכת CPR" as the editor. Inactive + no group: they can't log in
-- (auth rejects inactive users) and sit in nobody's subtree. Inserted last so the seeded report mix
-- above, which numbers soldiers by personal number, stays the same. Ids = SYSTEM_USER_IDS (shared).
insert into users (id, personal_number, first_name, last_name, email, role, is_active) values
  ('00000000-0000-0000-0000-0000000000f1', '0000001', 'מערכת', 'CPR',          'system.cpr@doch1.invalid',    'soldier', false),
  ('00000000-0000-0000-0000-0000000000f2', '0000002', 'מערכת', 'אנשים בדיגיטל', 'system.people@doch1.invalid', 'soldier', false);

commit;

-- =====================================================================
-- Quick checks (optional)
-- select * from commander_group_ids('00000000-0000-0000-0000-000000000002');  -- company -> 3 groups
-- select is_in_commander_scope('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000011'); -- false
-- select is_in_hr_scope('00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000011');        -- true  (battalion HR)
-- select is_in_hr_scope('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000011');        -- false (team-2 HR)
-- select u.first_name, u.last_name, r.report_date, s.name_he
--   from users u left join reports r on r.user_id = u.id and r.report_date = app_today()
--   left join status_reasons s on s.id = r.reason_id
--   where u.group_id = '00000000-0000-0000-0000-00000000a003';
-- =====================================================================
