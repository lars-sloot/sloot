-- Server-only API routes use Supabase's service role for trusted writes.
-- RLS is still enforced for browser/authenticated clients; service_role is
-- intentionally restricted to the application tables it needs.
grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.organizations,
  public.branches,
  public.profiles,
  public.user_branches,
  public.delivery_notes,
  public.delivery_note_items,
  public.audit_logs
to service_role;

grant usage, select on sequence public.audit_logs_id_seq to service_role;
