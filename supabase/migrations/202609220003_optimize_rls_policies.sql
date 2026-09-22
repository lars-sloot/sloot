-- Cache session lookups once per statement and avoid overlapping permissive policies.

drop policy "profiles visible to admins or self" on public.profiles;
drop policy "profiles editable by admins" on public.profiles;
create policy "profiles visible to admins or self" on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (organization_id = (select private.current_organization_id()) and (select private.is_admin()))
);
create policy "profiles editable by admins" on public.profiles for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy "assignments visible to admins or self" on public.user_branches;
drop policy "assignments managed by admins" on public.user_branches;
create policy "assignments visible to admins or self" on public.user_branches for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "assignments insertable by admins" on public.user_branches for insert to authenticated
with check ((select private.is_admin()));
create policy "assignments editable by admins" on public.user_branches for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "assignments removable by admins" on public.user_branches for delete to authenticated
using ((select private.is_admin()));

drop policy "notes visible per branch" on public.delivery_notes;
drop policy "notes can be uploaded per branch" on public.delivery_notes;
drop policy "notes can be handled per branch" on public.delivery_notes;
drop policy "notes removable by admins" on public.delivery_notes;
create policy "notes visible per branch" on public.delivery_notes for select to authenticated
using (private.can_access_branch(branch_id) and deleted_at is null);
create policy "notes can be uploaded per branch" on public.delivery_notes for insert to authenticated
with check (uploaded_by = (select auth.uid()) and private.can_access_branch(branch_id));
create policy "notes can be handled per branch" on public.delivery_notes for update to authenticated
using (private.can_access_branch(branch_id)) with check (private.can_access_branch(branch_id));
create policy "notes removable by admins" on public.delivery_notes for delete to authenticated
using ((select private.is_admin()));

drop policy "items visible with note" on public.delivery_note_items;
drop policy "items editable with note" on public.delivery_note_items;
create policy "items visible with note" on public.delivery_note_items for select to authenticated
using (exists(select 1 from public.delivery_notes n where n.id = delivery_note_id and private.can_access_branch(n.branch_id)));
create policy "items insertable with note" on public.delivery_note_items for insert to authenticated
with check (exists(select 1 from public.delivery_notes n where n.id = delivery_note_id and private.can_access_branch(n.branch_id)));
create policy "items editable with note" on public.delivery_note_items for update to authenticated
using (exists(select 1 from public.delivery_notes n where n.id = delivery_note_id and private.can_access_branch(n.branch_id)))
with check (exists(select 1 from public.delivery_notes n where n.id = delivery_note_id and private.can_access_branch(n.branch_id)));
create policy "items removable with note" on public.delivery_note_items for delete to authenticated
using (exists(select 1 from public.delivery_notes n where n.id = delivery_note_id and private.can_access_branch(n.branch_id)));

drop policy "audit visible to admins" on public.audit_logs;
drop policy "audit append by members" on public.audit_logs;
drop policy "audit undo metadata by admins" on public.audit_logs;
create policy "audit visible to admins" on public.audit_logs for select to authenticated
using ((select private.is_admin()));
create policy "audit append by members" on public.audit_logs for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and organization_id = (select private.current_organization_id())
);
create policy "audit undo metadata by admins" on public.audit_logs for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
