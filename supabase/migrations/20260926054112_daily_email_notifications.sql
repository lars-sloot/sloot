create table public.notification_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  daily_digest_enabled boolean not null default false,
  recipient_email text,
  last_sent_date date,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_recipient_email_valid check (
    recipient_email is null
    or (length(recipient_email) <= 320 and recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  constraint enabled_notification_requires_email check (
    not daily_digest_enabled or recipient_email is not null
  )
);

alter table public.notification_settings enable row level security;

revoke all on table public.notification_settings from anon, authenticated;
grant select, insert, update on table public.notification_settings to authenticated;
grant all on table public.notification_settings to service_role;

create policy "notification settings visible to organization admins"
on public.notification_settings for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
);

create policy "notification settings insertable by organization admins"
on public.notification_settings for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
);

create policy "notification settings editable by organization admins"
on public.notification_settings for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.is_admin())
);
