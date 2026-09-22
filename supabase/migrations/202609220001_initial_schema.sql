-- Sloot pakbonnen: database, authorization, audit trail and private photo storage.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'user');
create type public.delivery_status as enum ('processing', 'pending', 'approved', 'rejected', 'error');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null default '',
  role public.app_role not null default 'user',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_branches (
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create table public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  supplier text,
  delivery_number text,
  delivery_date date,
  article_summary text,
  status public.delivery_status not null default 'processing',
  rejection_reason text,
  photo_path text not null,
  photo_delete_after timestamptz not null default (now() + interval '1 year'),
  ai_result jsonb,
  ai_confidence numeric(5,4),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rejection_requires_reason check (status <> 'rejected' or nullif(trim(rejection_reason), '') is not null)
);

create table public.delivery_note_items (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  line_number integer not null,
  article_code text,
  ean text,
  description text,
  quantity numeric(12,3),
  unit text,
  created_at timestamptz not null default now(),
  unique (delivery_note_id, line_number)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  undone_by uuid references public.profiles(id) on delete set null,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index delivery_notes_branch_status_idx on public.delivery_notes(branch_id, status, created_at desc);
create index delivery_notes_retention_idx on public.delivery_notes(photo_delete_after) where deleted_at is null;
create index audit_logs_organization_created_idx on public.audit_logs(organization_id, created_at desc);

insert into public.organizations (name, slug) values ('Sloot 2Wielers', 'sloot-2wielers');
insert into public.branches (organization_id, name)
select id, branch from public.organizations cross join unnest(array['Delden','Borne','Tubbergen']) branch
where slug = 'sloot-2wielers';

create or replace function public.current_profile()
returns public.profiles language sql stable security definer set search_path = public
as $$ select * from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' and active from public.profiles where id = auth.uid()), false) $$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.user_branches ub
    join public.profiles p on p.id = ub.user_id
    where ub.user_id = auth.uid() and ub.branch_id = target_branch and p.active
  )
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  first_user boolean;
begin
  select id into org_id from public.organizations where slug = 'sloot-2wielers';
  select not exists(select 1 from public.profiles where organization_id = org_id) into first_user;
  insert into public.profiles (id, organization_id, full_name, role)
  values (new.id, org_id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), case when first_user then 'admin'::public.app_role else 'user'::public.app_role end);
  if first_user then
    insert into public.user_branches(user_id, branch_id) select new.id, id from public.branches where organization_id = org_id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.user_branches enable row level security;
alter table public.delivery_notes enable row level security;
alter table public.delivery_note_items enable row level security;
alter table public.audit_logs enable row level security;

create policy "organization visible to members" on public.organizations for select
using (id = (select organization_id from public.profiles where id = auth.uid()));

create policy "branches visible to members" on public.branches for select
using (organization_id = (select organization_id from public.profiles where id = auth.uid()));

create policy "profiles visible to admins or self" on public.profiles for select
using (id = auth.uid() or (organization_id = (select organization_id from public.profiles where id = auth.uid()) and public.is_admin()));
create policy "profiles editable by admins" on public.profiles for update
using (public.is_admin()) with check (public.is_admin());

create policy "assignments visible to admins or self" on public.user_branches for select
using (user_id = auth.uid() or public.is_admin());
create policy "assignments managed by admins" on public.user_branches for all
using (public.is_admin()) with check (public.is_admin());

create policy "notes visible per branch" on public.delivery_notes for select
using (public.can_access_branch(branch_id) and deleted_at is null);
create policy "notes can be uploaded per branch" on public.delivery_notes for insert
with check (uploaded_by = auth.uid() and public.can_access_branch(branch_id));
create policy "notes can be handled per branch" on public.delivery_notes for update
using (public.can_access_branch(branch_id)) with check (public.can_access_branch(branch_id));
create policy "notes removable by admins" on public.delivery_notes for delete
using (public.is_admin());

create policy "items visible with note" on public.delivery_note_items for select
using (exists(select 1 from public.delivery_notes n where n.id = delivery_note_id and public.can_access_branch(n.branch_id)));
create policy "items editable with note" on public.delivery_note_items for all
using (exists(select 1 from public.delivery_notes n where n.id = delivery_note_id and public.can_access_branch(n.branch_id)))
with check (exists(select 1 from public.delivery_notes n where n.id = delivery_note_id and public.can_access_branch(n.branch_id)));

create policy "audit visible to admins" on public.audit_logs for select using (public.is_admin());
create policy "audit append by members" on public.audit_logs for insert
with check (actor_id = auth.uid() and organization_id = (select organization_id from public.profiles where id = auth.uid()));
create policy "audit undo metadata by admins" on public.audit_logs for update
using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-notes', 'delivery-notes', false, 15728640, array['image/jpeg','image/png','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy "delivery photos readable by branch members" on storage.objects for select
using (
  bucket_id = 'delivery-notes' and exists(
    select 1 from public.delivery_notes n
    where n.photo_path = name and public.can_access_branch(n.branch_id) and n.deleted_at is null
  )
);
create policy "delivery photos uploadable by users" on storage.objects for insert
with check (bucket_id = 'delivery-notes' and auth.uid() is not null);
create policy "delivery photos removable by admins" on storage.objects for delete
using (bucket_id = 'delivery-notes' and public.is_admin());

