-- Additive migration for an existing DB (keeps all data). Safe to run more than once.
-- Brings a DB created from an older db/init.sql up to the weekly template + weekly reminder schema.
begin;

alter table user_settings
  add column if not exists weekly_reminder_enabled boolean  not null default false,
  add column if not exists weekly_reminder_day     smallint not null default 6,
  add column if not exists weekly_reminder_time    time     not null default '20:00',
  add column if not exists template_onboarded      boolean  not null default false;

do $$ begin
  alter table user_settings
    add constraint user_settings_weekly_reminder_day_check check (weekly_reminder_day between 0 and 6);
exception when duplicate_object then null;
end $$;

create table if not exists user_week_template (
  user_id     uuid primary key references users(id) on delete cascade,
  days        jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) = 7),
  updated_at  timestamptz not null default now()
);

drop trigger if exists user_week_template_updated_at on user_week_template;
create trigger user_week_template_updated_at before update on user_week_template
  for each row execute function set_updated_at();

alter table user_week_template enable row level security;

commit;
