# Formato de mapa v1 (`codeniac-map`)

Definido em `game/src/world/format.ts`. Editor e jogo usam o mesmo formato. Mudou o formato → sobe `version` e entra uma
migração (nunca editar a versão antiga em silêncio).

**Manifesto**
```json
{ "format": "codeniac-map", "version": 1, "id": "exemplo", "name": "Cidade de exemplo",
  "tileSize": 32, "sectorSize": 16, "sectors": { "w": 8, "h": 8 }, "spawn": { "x": 2064, "y": 2064 } }
```
**Setor** (carregado por proximidade, via `SectorSource.sector(sx, sy)`)
```json
{ "sx": 3, "sy": 4, "ground": [0, 0, 1, "... sectorSize² ids de tile, em linhas ..."],
  "props": [ { "asset": "prop.casa", "tx": 2, "ty": 5, "tw": 3, "th": 3,
               "collider": { "x": 0, "y": 0, "w": 96, "h": 96 } } ] }
```
- `ground`: ids numéricos de tile (`0 grama, 1 rua, 2 água, 3 calçada, 4 terra`; ver `TILE_IDS`). Água é sólida.
- `props`: `tx,ty` = canto superior esquerdo da **base**, em tiles, local ao setor; `tw,th` = tamanho da base. O sprite
  é ancorado no meio da base, embaixo; a ordem de desenho usa o Y dessa base. `collider` em px, relativo à base; sem
  `collider` o prop é só decoração. Um prop não pode sair do seu setor.
- `validateManifest` / `validateSector` recusam versão, formato, tamanhos, tiles e props inválidos (erro `MapFormatError`).

# Eventos (`GameEvents`, `game/src/core/eventBus.ts`)
`sector:loaded {sx,sy}` · `sector:unloaded {sx,sy}` · `player:moved {x,y,dir}` · `frame:stats {fps,frameMs,sectors,sprites,heapMb}`.
Evento novo = declarar em `GameEvents` (o compilador recusa o resto).

# Asset Registry (`game/src/assets`)
Ids: `tile.<nome>`, `prop.<nome>`, `sprite.<nome>`. `register` recusa id duplicado, asset sem quadros e quadros de tamanho
diferente. O personagem é `sprite.jogador`: 8 direções × 4 quadros (índice = `direção*4 + quadro`).
