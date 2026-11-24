# Gamecode — arquitetura (V0.1 Foundation)

Jogo open world single-player no navegador. **TypeScript + PixiJS 8 + React + Vite**, testes com **Vitest** (unidade) e
**Playwright** (navegador). Código em `game/`, compilado para `public/jogo/` (servido pelo Express em `/jogo/`).

## Direção de arte
Pixel Art HD, vista de cima ortogonal com profundidade 2.5D (objetos ordenados pelos pés), 8 direções, tile de 32 px, zoom
**inteiro** (1–4). Sem isométrico e sem misturar estilos. A arte atual é placeholder procedural; a arte final entra pelo
mesmo Asset Registry, com os mesmos ids.

## Módulos (`game/src`)
| Pasta | Responsabilidade | Depende de |
|---|---|---|
| `core/` | Event Bus tipado, loop de passo fixo (60 Hz), pilha de cenas | nada |
| `assets/` | `PixelImage`, `AssetRegistry`, catálogo placeholder | nada (sem DOM) |
| `world/` | formato de mapa, setores por proximidade, colisão, Spatial Hash, mapa de exemplo | core, assets |
| `character/` | 8 direções, entrada, jogador | world |
| `render/` | câmera (pura) e renderer PixiJS | assets, world, character |
| `ui/` | HUD em React (só lê, via Event Bus) | core |
| `game.ts` | Game Core: junta tudo e roda o loop | todos |

Regras: lógica, render e UI não se misturam. O renderer não decide nada de jogo; o HUD não toca no estado; os engines se
falam por eventos. Tudo que não é PixiJS/React roda em Node (por isso é testável no Vitest).

## Fluxo de um quadro
`requestAnimationFrame` → `FixedLoop.advance(dt)` → N× `update(1/60)` (entrada → jogador+colisão → câmera → setores) →
1× `render(alpha)` (renderer posiciona sprites e chama `app.render()`).

## Mundo por setores
Setor = 16×16 tiles (512 px). O `World` mantém carregados os setores num raio de 1 em volta do jogador (3×3) e só
descarrega além de raio+1 (histerese, evita recarregar na fronteira). Cada setor vira **1 sprite de terreno** (textura
composta) + sprites de props. Colisão: tiles sólidos (água) + colisores de props em Spatial Hash; só os pés colidem.

## Desempenho (medido)
Chromium headless **sem GPU** (WebGL por software, SwiftShader), `npm run jogo:e2e`:
- CPU do jogo: ~0,2–0,5 ms por quadro; 121 sprites; heap ~7 MB; 9 setores carregados.
- 640×360: 60 FPS. 1280×720: ~35 FPS — limitado pelo rasterizador por software (uma página vazia faz 60), pois com o
  terreno oculto o jogo volta a 60. **60 FPS em HD ainda precisa ser confirmado numa máquina com GPU.**

## Limites conhecidos da V0.1
Sem persistência (IndexedDB), sem veículos, tráfego, NPCs, leis ou RPG; sem editor novo. Arte placeholder.
