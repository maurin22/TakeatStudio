# TakeatCam

Espelho da tela com zoom suave **ao vivo**. A janela do TakeatCam mostra sua tela com os efeitos aplicados em tempo real. Na hora de apresentar, compartilhe **a janela do TakeatCam** (no Meet, Zoom, OBS...) em vez da tela, e a transmissão sai com zoom nos pontos certos.

Serve tanto para lives (OBS puxando o Meet) quanto para qualquer apresentação ou demo.

## Como rodar

```bash
npm install
npm start
```

## Qualidade da captura

Na tela inicial (ou via `Alt+S`) há quatro presets, salvos entre sessões:

- **100% Full HD** — resolução nativa do monitor, máxima nitidez no zoom (padrão)
- **HD 720p / 480p / 360p** — reduzem o custo de captura pra máquinas mais fracas

Se a imagem travar ou engasgar, desça um nível. Se estiver pixelada, suba.

## Como usar numa transmissão

1. Abra o TakeatCam no PC de quem vai apresentar e escolha o que transmitir: uma tela ou uma janela específica (ex.: Chrome).
2. No Meet, compartilhe **"Uma janela" → TakeatCam** (não compartilhe a tela inteira).
3. Clique na janela do seu produto/SaaS e apresente normalmente. Os atalhos funcionam em segundo plano.

Capturar uma janela (em vez da tela) tem um bônus: elimina o risco de espelho infinito, e você pode manter o TakeatCam visível de lado.

### Atalhos globais

Todos os atalhos são **configuráveis** no painel "Atalhos" da tela inicial (clique no atalho e pressione a nova tecla; o formato é sempre Alt + letra ou número). Padrões:

| Atalho | Ação |
|---|---|
| `Alt+Z` | Liga/desliga o zoom (1.5x) na posição do mouse |
| `Alt+X` | Solta o zoom |
| `Alt+1` / `Alt+2` / `Alt+3` | Zoom 1.3x / 1.5x / 2x |
| `Alt+C` | Liga/desliga o cursor destacado |
| `Alt+S` | Abre o seletor de fonte (tela/janela) |
| `Alt+R` | Reinicia a captura (se a imagem congelar) |

### Cursor

Na tela inicial dá pra escolher entre o cursor do **Sistema** (o real, sem efeito) e os cursores do Recordly: **Seta macOS**, **Seta Tahoe**, **Mãozinha** e **Minimal**, com suavidade em quatro níveis (Leve, Média, Alta, Máxima).

Com um cursor do Recordly ativo, o cursor real do Windows é **ocultado do sistema** (mesma técnica do Recordly, via `ShowCursor` do user32), então na transmissão aparece só o cursor suavizado, sem duplicação. O cursor real volta automaticamente ao abrir o menu (`Alt+S`), ao selecionar "Sistema", ao alternar com `Alt+C` ou ao fechar o app.

Com o zoom ativo, a câmera segue o mouse suavemente. O painel de atalhos some sozinho depois de alguns segundos (não fica aparecendo na transmissão).

## Importante: evitando o "espelho infinito" (só ao capturar uma tela)

Se você captura uma **tela** e a janela do TakeatCam estiver visível nela, você verá um túnel infinito. Capturando uma **janela**, isso não acontece.

- **Com 2 monitores**: deixe a janela do TakeatCam no monitor secundário. Resolvido.
- **Com 1 monitor**: deixe a janela do TakeatCam **atrás** das outras (basta clicar no seu SaaS depois de compartilhar). O Meet continua capturando a janela mesmo coberta. Só não minimize, senão a captura congela.

## Roadmap

- [ ] Zoom automático ao clicar (hook global de clique via `uiohook-napi`, como o Recordly usa)
- [ ] Highlight de clique (pulso no ponto clicado)
- [ ] Presets de intensidade de suavização
- [ ] Saída como câmera virtual (dispensa compartilhar janela)
