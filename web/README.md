# Takeat Map — web

Quadro de ideias colaborativo da Takeat, rodando no navegador. Mesmo
quadro do Takeat Studio, agora acessível por link, em qualquer sistema.

## Rodar aqui na máquina

```bash
cd web
npm install
npm run dev
```

Abre em http://localhost:5180. **Sem configuração nenhuma ele já funciona**
em *modo local*: sem login, quadros salvos só neste navegador. É assim que
dá pra testar tudo antes de ligar a nuvem.

## Ligar a nuvem (login + colaboração)

1. No painel do [Supabase](https://supabase.com), abra **SQL Editor → New query**,
   cole o conteúdo de `supabase/schema.sql` e clique em **Run**. Isso cria a
   tabela dos quadros, as permissões e o espaço das imagens.

2. Ative o login: **Authentication → Providers**
   - **Email**: já vem ligado (envia link de acesso)
   - **Google**: ligue e cole as credenciais do Google Cloud

3. Crie o arquivo `.env` a partir do `.env.example` e preencha:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

4. `npm run dev` de novo. Agora aparece a tela de login, os quadros vão
   pra nuvem e os cursores das outras pessoas aparecem ao vivo.

## Publicar (Cloudflare Pages, gratuito)

O plano gratuito da Vercel proíbe uso comercial, por isso Cloudflare Pages:

- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Root directory**: `web`
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

## Como está organizado

```
src/
  engine/mapEngine.js   o quadro em si (arrastar, zoom, caneta, conexões)
  components/           login, galeria e editor
  lib/supabase.js       conexão (vazia = modo local)
  lib/boards.js         salvar/ler quadros (nuvem ou local)
  lib/imageStore.js     imagens (Storage na nuvem, IndexedDB local)
  lib/presence.js       cursores ao vivo
```

O motor do quadro é JavaScript puro dentro de um componente React: arrastar
e desenhar precisam de resposta imediata a cada movimento do mouse, e passar
isso pelo React só adicionaria atraso. O React cuida da casca.

## O que funciona

- Nós com cores, filhos (Tab), irmãos (Enter), conexões arrastando as bolinhas
- Áreas pra agrupar, que levam os nós junto ao mover
- Caneta com suavização do traço ao soltar, em 5 cores
- Imagens: arrastar de fora, Ctrl+V ou pelo botão
- Zoom e navegação, salvamento automático
- Login com Google ou link por e-mail
- Cursores das outras pessoas ao vivo

## Próximo passo

Edição simultânea de verdade (duas pessoas mexendo no mesmo nó ao mesmo
tempo) pede uma estrutura de dados que se funde sozinha. Hoje o quadro é
salvo inteiro, então quem salvar por último vence. Presença (cursores) já
funciona; a fusão fica pra próxima etapa.
