# LiveZoom — Extensão do Chrome

Zoom suave ao vivo **na própria página**, sem captura de vídeo. A extensão transforma o DOM da guia em tempo real, então não existe pipeline de captura pra travar: latência zero, qualidade perfeita, CPU quase parada.

Na transmissão, a pessoa compartilha **a guia** no Meet (ou captura a guia no OBS) e apresenta normalmente. O que ela vê com zoom, todo mundo vê.

## Instalar (modo desenvolvedor)

1. Abra `chrome://extensions`
2. Ligue o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação** e escolha esta pasta (`livezoom/extension`)

## Usar

Na guia do seu SaaS (funciona em qualquer site):

| Atalho | Ação |
|---|---|
| `Alt+Z` | Liga/desliga o zoom na posição do mouse |
| `Alt+X` | Solta o zoom |
| `Alt+1` / `Alt+2` / `Alt+3` | Zoom 1.3x / 1.5x / 2x |
| `Alt+C` | Cursor suavizado (esconde o real, desenha um sintético com física de mola) |

Com o zoom ativo, a câmera segue o mouse suavemente. Os atalhos `Alt+Z/X/C` podem ser remapeados em `chrome://extensions/shortcuts`.

## Quando usar a extensão vs o app Electron

- **Extensão**: o que você apresenta é um site/SaaS dentro do Chrome. Melhor qualidade e performance, cursor suave incluído.
- **App** (`../app`): você precisa mostrar coisas fora do navegador (desktop, outros programas).

## Limitações conhecidas

- Não funciona em páginas internas do Chrome (`chrome://...`), na Chrome Web Store nem no visualizador de PDF.
- Sites com layouts muito acrobáticos (headers fixos complexos, canvas em tela cheia) podem apresentar pequenos deslocamentos com o zoom ativo.
- O zoom é aplicado na guia toda, inclusive na visão do apresentador (o que em geral ajuda a apresentar).

## Roadmap

- [ ] Zoom automático ao clicar (a extensão vê os cliques reais da página)
- [ ] Popup com configurações (intensidade, velocidade, cor do cursor)
- [ ] Highlight de clique (pulso no ponto clicado)
- [ ] Publicação na Chrome Web Store
