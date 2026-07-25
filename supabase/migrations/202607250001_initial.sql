begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_record_id text not null,
  source_kind text not null default 'image' check (source_kind in ('image', 'video')),
  source_object_path text,
  target_object_path text,
  entry_hall_id text,
  suggested_hall_id text,
  final_hall_id text not null,
  classification_reason text not null default '',
  analysis_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'analyzed', 'archived')),
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_record_id),
  check (suggested_hall_id is null or suggested_hall_id in ('kitchen','beauty','craft','home','plant','camera')),
  check (final_hall_id in ('kitchen','beauty','craft','home','plant','camera'))
);
create unique index if not exists cases_owner_content_hash_key on public.cases(owner_id, content_hash) where content_hash is not null;

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_path text,
  model text not null default '',
  prompt_version text not null default 'pixel-artifact-v1',
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  hall_id text not null check (hall_id in ('kitchen','beauty','craft','home','plant','camera')),
  route_name text not null default '',
  verified boolean not null default false,
  published_at timestamptz,
  archived_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null unique references public.collections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content_json jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_profile_for_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', '')) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile_for_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists cases_updated_at on public.cases;
create trigger cases_updated_at before update on public.cases for each row execute function public.set_updated_at();
drop trigger if exists artifacts_updated_at on public.artifacts;
create trigger artifacts_updated_at before update on public.artifacts for each row execute function public.set_updated_at();
drop trigger if exists collections_updated_at on public.collections;
create trigger collections_updated_at before update on public.collections for each row execute function public.set_updated_at();
drop trigger if exists community_posts_updated_at on public.community_posts;
create trigger community_posts_updated_at before update on public.community_posts for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.artifacts enable row level security;
alter table public.collections enable row level security;
alter table public.community_posts enable row level security;

create policy "profiles_owner_all" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "cases_owner_all" on public.cases for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "artifacts_owner_all" on public.artifacts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "collections_owner_all" on public.collections for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "community_posts_owner_write" on public.community_posts for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "community_posts_published_read" on public.community_posts for select using (withdrawn_at is null and published_at is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-media', 'case-media', false, 52428800, array['image/png','image/jpeg','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artifact-media', 'artifact-media', false, 5242880, array['image/png','image/webp'])
on conflict (id) do update set public = false;

create policy "case_media_owner_select" on storage.objects for select using (bucket_id = 'case-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "case_media_owner_insert" on storage.objects for insert with check (bucket_id = 'case-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "case_media_owner_update" on storage.objects for update using (bucket_id = 'case-media' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'case-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "case_media_owner_delete" on storage.objects for delete using (bucket_id = 'case-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "artifact_media_owner_select" on storage.objects for select using (bucket_id = 'artifact-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "artifact_media_owner_insert" on storage.objects for insert with check (bucket_id = 'artifact-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "artifact_media_owner_update" on storage.objects for update using (bucket_id = 'artifact-media' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'artifact-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "artifact_media_owner_delete" on storage.objects for delete using (bucket_id = 'artifact-media' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
