-- Takeat Map — perfis das contas.
-- Rode no painel do Supabase: SQL Editor -> New query -> Run.

create table if not exists public.perfis (
	id uuid primary key references auth.users (id) on delete cascade,
	nome text,
	email text,
	telefone text,
	cargo text,
	atualizado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

-- Todo mundo logado enxerga os perfis (é o que alimenta a lista de
-- menções e a escolha de responsável); cada um edita só o seu.
drop policy if exists "perfis: logado lê" on public.perfis;
create policy "perfis: logado lê" on public.perfis
	for select to authenticated using (true);

drop policy if exists "perfis: edito o meu" on public.perfis;
create policy "perfis: edito o meu" on public.perfis
	for update to authenticated using (auth.uid() = id);

drop policy if exists "perfis: crio o meu" on public.perfis;
create policy "perfis: crio o meu" on public.perfis
	for insert to authenticated with check (auth.uid() = id);

-- Cria o perfil sozinho quando a conta nasce
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.perfis (id, email, nome)
	values (new.id, new.email, split_part(new.email, '@', 1))
	on conflict (id) do nothing;
	return new;
end;
$$;

drop trigger if exists ao_criar_conta on auth.users;
create trigger ao_criar_conta
	after insert on auth.users
	for each row execute function public.criar_perfil();

-- Preenche quem já tinha conta antes desta tabela existir
insert into public.perfis (id, email, nome)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;
