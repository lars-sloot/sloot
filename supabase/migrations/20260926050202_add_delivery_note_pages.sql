create table public.delivery_note_pages (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  page_number integer not null check (page_number between 1 and 10),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_at timestamptz not null default now(),
  unique (delivery_note_id, page_number)
);

create index delivery_note_pages_note_page_idx
on public.delivery_note_pages(delivery_note_id, page_number);

insert into public.delivery_note_pages (delivery_note_id, page_number, storage_path, mime_type, size_bytes)
select
  id,
  1,
  photo_path,
  case
    when photo_path ~* '\\.pdf$' then 'application/pdf'
    when photo_path ~* '\\.png$' then 'image/png'
    when photo_path ~* '\\.heic$' then 'image/heic'
    else 'image/jpeg'
  end,
  1
from public.delivery_notes
on conflict (delivery_note_id, page_number) do nothing;

grant select on public.delivery_note_pages to authenticated;
grant all on public.delivery_note_pages to service_role;

alter table public.delivery_note_pages enable row level security;

create policy "note pages visible with note"
on public.delivery_note_pages for select to authenticated
using (
  exists (
    select 1
    from public.delivery_notes n
    where n.id = delivery_note_id
      and n.deleted_at is null
      and private.can_access_branch(n.branch_id)
  )
);

drop policy "delivery photos readable by branch members" on storage.objects;
create policy "delivery photos readable by branch members"
on storage.objects for select to authenticated
using (
  bucket_id = 'delivery-notes'
  and exists (
    select 1
    from public.delivery_note_pages p
    join public.delivery_notes n on n.id = p.delivery_note_id
    where p.storage_path = name
      and n.deleted_at is null
      and private.can_access_branch(n.branch_id)
  )
);

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
where id = 'delivery-notes';
