alter table public.notification_settings
  drop constraint enabled_notification_requires_email,
  drop constraint notification_recipient_email_valid;

alter table public.notification_settings
  add column recipient_emails text[] not null default '{}'::text[],
  add column send_time time without time zone not null default '08:00';

update public.notification_settings
set recipient_emails = array[recipient_email]
where recipient_email is not null;

alter table public.notification_settings
  drop column recipient_email,
  add constraint notification_recipient_count_valid check (
    cardinality(recipient_emails) <= 20
    and array_position(recipient_emails, null) is null
  ),
  add constraint enabled_notification_requires_recipients check (
    not daily_digest_enabled or cardinality(recipient_emails) > 0
  ),
  add constraint notification_send_time_quarter_hour check (
    extract(second from send_time) = 0
    and mod(extract(minute from send_time)::integer, 15) = 0
  );
