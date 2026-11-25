# Codeniac Commerce Office — status da primeira versão

Acesso: **Estúdio → card “Ecommerce”** (rota `#/estudio/ecommerce`, abre `/escritorio/` dentro do Hub).
Código: `server/commerce/*` (API `/api/commerce`), `game/src/office/*` (motor isométrico), `game/office/*` (painéis React), build em `public/escritorio/`.

## Operacional (testado)
- Escritório isométrico 2:1 (64×32) com 8 departamentos, ~90 objetos, paredes com portas/janelas, profundidade correta, câmera (zoom/arrasto/limites).
- Personagens animados (pixel art procedural) com A* (8 direções, sem atravessar móveis/paredes). Funcionários = **agentes reais** do Hub (Helena, Arthur, Sofia, Isabela, Marina — editáveis); o estado visual vem do estado real do agente. Sem trabalho, ninguém encena.
- Objetos interativos abrem ferramentas reais (computador, painéis, mesa de reuniões, marketplace, estante, câmera).
- Tarefas: criar, sem duplicar, despachar ao agente. **Sem IA configurada o despacho recusa com erro claro** e a tarefa não é alterada.
- Comércio: produtos (avaliação exige fonte), importador CSV com prévia e sem duplicar, financeiro com receita / comissão / lucro separados; estimado nunca conta como recebido; real e teste separados.
- Conectores: TikTok Shop (afiliado/creator Brasil), Shopee, Temu — estado real exibido (API pendente / importação operacional), checklist guardado, credenciais nunca expostas ao navegador.
- Office Builder: modos execução/visualização/construção/edição, piso, paredes, portas, janelas, objetos, colisão manual, estação ligada a agente, desfazer/refazer, salvar com versão, duplicar, persistir.
- Asset Studio: importa PNG e ZIP (leitura segura, sem executar conteúdo), metadados e licença, sem duplicar, usa no mapa. Personagens: spritesheet, quadros, animações por estado.
- Aquisição de assets: allowlist de hosts, detecção de licença (CC0/CC-BY/NC…), aprovação do usuário.
- Desempenho: ~250 sprites/quadro, heap ~16 MB; ~25–28 FPS em WebGL por software (60 FPS em GPU real **não verificado**).

## Modo importação (sem API oficial integrada)
- Dados de TikTok Shop / Shopee / Temu entram por **CSV**. Nenhuma coleta por scraping. Conectar API oficial exige credenciais do usuário e aprovação do programa pela plataforma.

## Pendente / parcial
- Webhooks de marketplace (não implementado).
- Editor/corte de vídeo: ferramentas ainda não existem no Hub (cards seguem “EM BREVE”).
- Publicação externa de campanhas/criativos: não implementada (exigirá aprovação explícita).
- Busca automática de assets: apenas links assistidos + importação manual/ZIP.
- Girar objeto altera só a área ocupada; sprites não são espelhados por rotação.
- Insights de produto são baseados em regras sobre dados importados; nenhuma métrica é inventada.
- 60 FPS em hardware real e teste em celulares: não medidos.

## Testes
`npm test` (133) · `npm run jogo:test` (70) · `npm run test:browser` (10) · `npm run jogo:e2e` (20) · `npm run office:e2e` (15) — todos passando.
