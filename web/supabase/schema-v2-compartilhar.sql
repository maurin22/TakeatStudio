-- Takeat Map — compartilhamento por link.
-- Rode no painel do Supabase: SQL Editor -> New query -> Run.
-- Pode rodar mesmo se já tiver rodado o schema.sql antes.

-- Marca se o quadro está aberto por link
alter table public.boards
	add column if not exists is_shared boolean not null default false;

create index if not exists boards_shared_idx on public.boards (is_shared) where is_shared;

-- ---------------------------------------------------------------------
-- Permissões: além do dono, quem estiver logado pode ver e editar os
-- quadros marcados como compartilhados. Apagar e mudar o compartilhamento
-- continuam sendo só do dono.
-- ---------------------------------------------------------------------

drop policy if exists "quadros: dono lê" on public.boards;
drop policy if exists "quadros: dono ou compartilhado lê" on public.boards;
create policy "quadros: dono ou compartilhado lê" on public.boards
	for select to authenticated
	using (auth.uid() = owner or is_shared);

drop policy if exists "quadros: dono edita" on public.boards;
drop policy if exists "quadros: dono ou compartilhado edita" on public.boards;
create policy "quadros: dono ou compartilhado edita" on public.boards
	for update to authenticated
	using (auth.uid() = owner or is_shared)
	with check (auth.uid() = owner or is_shared);
