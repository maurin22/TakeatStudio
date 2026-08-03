-- Takeat Map — notificações.
-- Rode no painel do Supabase: SQL Editor -> New query -> Run.

create table if not exists public.notificacoes (
	id uuid primary key default gen_random_uuid(),
	para text not null,              -- e-mail ou nome de quem recebe
	de text,                         -- quem gerou o aviso
	texto text not null,
	board_id uuid,
	board_nome text,
	lida boolean not null default false,
	created_at timestamptz not null default now()
);

create index if not exists notif_para_idx on public.notificacoes (para, lida, created_at desc);

alter table public.notificacoes enable row level security;

-- Cada pessoa lê e marca como lida só o que é dela; qualquer pessoa
-- logada pode criar aviso pra outra (é assim que a atribuição funciona).
drop policy if exists "avisos: leio os meus" on public.notificacoes;
create policy "avisos: leio os meus" on public.notificacoes
	for select to authenticated
	using (lower(para) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "avisos: qualquer logado cria" on public.notificacoes;
create policy "avisos: qualquer logado cria" on public.notificacoes
	for insert to authenticated with check (true);

drop policy if exists "avisos: marco os meus como lidos" on public.notificacoes;
create policy "avisos: marco os meus como lidos" on public.notificacoes
	for update to authenticated
	using (lower(para) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- entrega em tempo real
alter publication supabase_realtime add table public.notificacoes;
