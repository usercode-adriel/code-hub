# Commerce Office 3.0 — sala única, arte nova e avatares de 8 direções

## O que foi pedido e como foi interpretado
- **"D4 Boxes"** não existe com esse nome no projeto; entendi como o escritório do Commerce Office (Estúdio → Ecommerce) e renovei esse ambiente.
- **Uma única sala ampla**: as duas salas da 2.1 (Estoque e Escritório Central) viraram uma sala **compacta e quadrada de 12×12 tiles (144, contra 504 antes), só com piso de madeira**: 5 mesas com avatares, mesa de reuniões, estantes, armário, arquivos, logística (caixas, copiadora), cantinho de descanso/café e decoração, sem espaço sobrando. Reduzir 10x de verdade (≈50 tiles) não comportaria as 5 mesas; 12×12 é o menor quadrado que ainda deixa circulação. Os layouts anteriores continuam salvos na lista de layouts (nada foi apagado); o 3.0 passa a ser o ativo.

## Assets
**Fontes** (suas imagens, guardadas em `game/assets-fonte/`): folha de paredes/pisos, folha de objetos e 5 folhas de avatares.
**Pipeline** (`game/tools/*.py`, reproduzível): remove o quadriculado "pintado" no fundo (transparência real), separa cada peça, ajusta tamanho (2x) e gera os PNGs em `game/office/public/arte/` (servidos em `/escritorio/arte/`):
- `objetos/` — 90 objetos (mesas, cadeiras, monitores, torres, impressoras, racks, armários, arquivos, estantes, plantas, luminárias, sofá, poltrona, quadros, relógio, caixas, lixeiras…).
- `paredes/` — tijolo, janela e porta, nas duas direções (a inclinação da base foi corrigida para 2:1, a da grade).
- `pisos/` — madeira (dessaturada para não competir com os móveis), carpete, cerâmica creme/branca/cinza/azul, concreto escuro.
- `personagens/` — 5 avatares × 8 direções (Sul, Sudeste, Leste, Nordeste, Norte, Noroeste, Oeste, Sudoeste), rótulos e sombras de fundo removidos.
- Avatares: Eleonor = jersey 98 com óculos escuros; Lady Iris = óculos de grau e regata branca; Sophia = cabelo longo e blusa listrada verde; Laurinda = coque castanho e regata roxa; Lucya = rabos de cavalo e blusa listrada. Mantive as aparências como vieram.

**Substituídos**: o desenho procedural dos tipos que ganharam equivalente (mesa, cadeira, monitor, torre, impressora, estante, arquivo, plantas, sofá, poltrona, bebedouro, cafeteira, quadros, relógio, caixas, lixeira, luminárias, rack…) e dos pisos/paredes/avatares. O código procedural **continua só como reserva** (falha ao carregar o pacote) e para os tipos sem equivalente (ficam marcados `legado`, escondidos da biblioteca do construtor, para não quebrar layouts antigos).
**Não existiam nas folhas**: piso de grama e outros tipos de porta (só há a porta de tijolo; a de aço foi ignorada), teclado e mouse. Não foram inventados.

## Engine
`pacote.ts` (carrega e converte as imagens; hit-test pelo pixel opaco), `catalogoSprites.ts` (tamanho, ação e altura de cada objeto), `engine.ts` (objetos, paredes, pisos e avatares do pacote; sombra suave redonda), `layoutPadrao.ts` (sala única), `comportamento.ts` (vida autônoma). Y-sorting por caixas isométricas (já existente): avatar atrás/à frente de mesas e paredes corretamente.

## Movimento e comportamento dos avatares
Os sprites são **sentados na cadeira** e só existem em 8 direções: não há quadros de caminhada. Por isso "caminhar" é o avatar **rolando na cadeira** (desliza pelo caminho A* com um vai e vem leve) e a rotação usa as 8 direções.
Máquina de estados por avatar (`idle`, `working`, `sitting`, `walking`, `looking_around`, `resting`), com semente própria (determinística), direção, destino, intervalo até a próxima ação:
- **sitting → looking_around**: gira 1 passo (45°) por vez, no máximo ±90° da direção de casa, 1,4–3,8 s entre giros, até 3 giros e volta a encarar a mesa.
- **walking** (só 1 avatar por vez): voltinha curta a um ponto livre e alcançável (≤10 passos), pausa 3–8 s (`idle`), vira, e volta ao posto.
- **resting**: só depois de 5 min sem trabalho.
- **Estado real tem prioridade**: se o agente está planejando/executando/analisando, em reunião, conversando, comemorando, com erro ou pausado, a vida autônoma não age (vai ao posto e trabalha, senta à mesa de reuniões etc.). Só agentes **disponíveis** têm "vida de fundo". O `working` (digitando) continua refletindo trabalho **real**.
- Giros nunca a cada quadro; células bloqueadas nunca são pisadas. `window.__office.ambienteVivo = false` desliga a vida de fundo.

## Arquivos
Novos: `game/tools/{personagens,cenario,recorte_fundo,componentes}.py`, `game/assets-fonte/*`, `game/office/public/arte/**`, `game/src/office/{pacote,catalogoSprites,comportamento}.ts`.
Alterados: `game/src/office/{engine,texturas,catalogo,layoutPadrao,arte/personagem,animacoes}.ts`, `game/office/App.tsx`, `game/vite.office.config.ts` (publicDir), `game/tests/office/*`, `game/e2e/escritorio.test.mjs`, `server/commerce/personagens.js` (estados de animação). Build: `public/escritorio/`.

## Testes
`npm test` (141) · `npm run jogo:test` (71) · `npm run test:browser` (10) · `npm run jogo:e2e` (23) · `npm run office:e2e` (18, incluindo: arte carregada, sala única, 8 direções, giros com intervalo, voltinhas, prioridade do estado real, meeting, desempenho ~27 FPS em WebGL por software, sem erros de console).

## Pontos de atenção
- Sem quadros de caminhada: a "caminhada" é deslize com vai e vem leve (limitação do material fornecido). Se vier uma folha de caminhada, basta registrar os quadros.
- Cada folha de avatar tem escala própria; normalizei pela altura. As sombras escuras de Laurinda foram removidas, e isso comeu parte das rodinhas da cadeira em algumas direções.
- O quadriculado das folhas foi removido por processamento: as bordas das peças podem ter pequenas imperfeições; as paredes foram levemente cisalhadas (≈ 10–20%) para acompanhar a grade 2:1.
- Madeira foi dessaturada de propósito (a original é laranja forte).
- 60 FPS em GPU real continua sem medição (só WebGL por software).
