create table public.user_notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  daily_digest_enabled boolean not null default false,
  recipient_email text not null,
  send_times text[] not null default array['08:00']::text[],
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_notification_email_valid check (
    recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and length(recipient_email) <= 320
  ),
  constraint user_notification_send_time_count_valid check (
    cardinality(send_times) between 1 and 12
    and array_position(send_times, null) is null
  ),
  constraint user_notification_send_times_valid check (
    array_to_string(send_times, ',') ~ '^(([01][0-9]|2[0-3]):(00|15|30|45))(,(([01][0-9]|2[0-3]):(00|15|30|45)))*$'
  )
);

create index user_notification_settings_organization_idx
  on public.user_notification_settings (organization_id);

alter table public.user_notification_settings enable row level security;

revoke all on table public.user_notification_settings from anon, authenticated;
grant select, insert, update, delete on table public.user_notification_settings to authenticated;
grant all on table public.user_notification_settings to service_role;

create policy "user notification settings visible to organization admins"
on public.user_notification_settings for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
);

create policy "user notification settings insertable by organization admins"
on public.user_notification_settings for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
  and exists (
    select 1 from public.profiles
    where profiles.id = user_notification_settings.user_id
      and profiles.organization_id = user_notification_settings.organization_id
  )
);

create policy "user notification settings editable by organization admins"
on public.user_notification_settings for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
  and exists (
    select 1 from public.profiles
    where profiles.id = user_notification_settings.user_id
      and profiles.organization_id = user_notification_settings.organization_id
  )
);

create policy "user notification settings removable by organization admins"
on public.user_notification_settings for delete to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
);

insert into public.user_notification_settings (
  user_id,
  organization_id,
  daily_digest_enabled,
  recipient_email,
  send_times,
  last_sent_at,
  created_at,
  updated_at
)
select
  profiles.id,
  settings.organization_id,
  settings.daily_digest_enabled,
  lower(auth_users.email),
  array[to_char(settings.send_time, 'HH24:MI')],
  settings.last_sent_at,
  settings.created_at,
  settings.updated_at
from public.notification_settings settings
join auth.users auth_users
  on lower(auth_users.email) = any(settings.recipient_emails)
join public.profiles profiles
  on profiles.id = auth_users.id
 and profiles.organization_id = settings.organization_id
on conflict (user_id) do nothing;
