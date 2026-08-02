-- Takeat Map — estrutura do banco.
-- Rode isto uma vez no painel do Supabase: SQL Editor -> New query -> Run.

-- ---------------------------------------------------------------------
-- Tabela dos quadros
-- ---------------------------------------------------------------------
create table if not exists public.boards (
	id uuid primary key default gen_random_uuid(),
	owner uuid not null references auth.users (id) on delete cascade,
	name text not null default 'Meu mapa',
	data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists boards_owner_idx on public.boards (owner);
create index if not exists boards_updated_idx on public.boards (updated_at desc);

-- ---------------------------------------------------------------------
-- Permissões: por padrão, cada pessoa enxerga e mexe só nos quadros dela.
-- (Compartilhamento entre pessoas entra numa próxima etapa, com uma
-- tabela de convidados por quadro.)
-- ---------------------------------------------------------------------
alter table public.boards enable row level security;

drop policy if exists "quadros: dono lê" on public.boards;
create policy "quadros: dono lê" on public.boards
	for select using (auth.uid() = owner);

drop policy if exists "quadros: dono cria" on public.boards;
create policy "quadros: dono cria" on public.boards
	for insert with check (auth.uid() = owner);

drop policy if exists "quadros: dono edita" on public.boards;
create policy "quadros: dono edita" on public.boards
	for update using (auth.uid() = owner);

drop policy if exists "quadros: dono apaga" on public.boards;
create policy "quadros: dono apaga" on public.boards
	for delete using (auth.uid() = owner);

-- ---------------------------------------------------------------------
-- Armazenamento das imagens do quadro
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('map-images', 'map-images', true)
on conflict (id) do nothing;

drop policy if exists "imagens: qualquer um vê" on storage.objects;
create policy "imagens: qualquer um vê" on storage.objects
	for select using (bucket_id = 'map-images');

drop policy if exists "imagens: logado envia" on storage.objects;
create policy "imagens: logado envia" on storage.objects
	for insert to authenticated with check (bucket_id = 'map-images');
