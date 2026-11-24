# Decisões e roadmap

## Decisões (V0.1)
1. **Reset total do jogo antigo**, em branch `game-v0-reset`. Backup: tag `pre-reset-jogo-2026-11-24` (local) e branch
   `dev-ui-2.4` (no remoto, mesmo commit). Voltar: `git checkout dev-ui-2.4`.
2. **Mantido** (não é layout/asset do jogo): hub (tarefas, finanças, assistente, livros, IA, auth, push, Telegram, GitHub),
   Rede e a simulação de servidor (`server/world`, `server/social.js`, rotas `/api/mundo`), telas de texto da cidade,
   Tech ao vivo, assets `pixel/`, `items/`, `px/` (usados pelo hub). Esses ficam para uma decisão futura: ainda dependem uns
   dos outros (a Rede é movida pelos agentes de `server/world`).
3. **Removido:** cidade 2D (Canvas) e `public/js/drive`, editores (Criar mapa, Structure Studio, Personagens, Sprite 3D),
   Godot, `tools/` de geração de assets, assets do jogo (`rpg`, `mundo`, `atlas`, `mapas`, `drive`, `personagens`, `estudio`),
   rotas `/api/mapas`, `/api/estudio`, `/api/personagens`, `/api/godot` e os testes desses módulos.
   Dados de `server/world` que vinham de `public/js/drive` (`obra`, `sky`, `*meta`) foram copiados para `server/world/`.
4. **Pixel Art HD**, tile 32 px, zoom inteiro. 5. **Uma só `package.json`**: a stack do jogo está em `devDependencies`.
6. **Playwright via `node:test`** (a biblioteca `playwright` já existia), sem instalar `@playwright/test`.
7. **Supabase fica para o futuro**; persistência local será IndexedDB com migrações.

## Pendências conhecidas
- `public/jogo/` é gerado (`npm run jogo:build`) e está no `.gitignore`. O instalador (`installer/windows`) instala só
  dependências de produção: precisa de um passo de build do jogo antes de empacotar. **Instalador não regenerado.**
- O Tech ao vivo ainda mora na tela `centro`; mover para o dashboard antes de qualquer remoção das telas da cidade.
- Confirmar 60 FPS em HD numa máquina com GPU.

## Roadmap
V0.1 Foundation (feito: núcleo, mundo por setores, câmera, jogador 8 direções, colisão, HUD, testes) →
V0.2 Persistência (IndexedDB + migrações) e editor de mapa novo → V0.3 Veículos e tráfego → V0.4 NPCs e pathfinding →
V0.5 Leis e polícia → V0.6 RPG (atributos, inventário, missões) → V0.7 Editores de personagem/asset →
V1.0 Open world jogável completo.
