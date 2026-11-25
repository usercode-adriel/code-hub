# Codeniac Commerce Office — diagnóstico técnico (Regra Zero)

Auditoria feita no projeto existente antes de qualquer código. Nada aqui foi inventado: cada item vem da leitura do código.

## 1. O que já existe e será reutilizado
| Item | Situação encontrada | Decisão |
|---|---|---|
| Stack | Node 22 (ESM) + Express 4; cliente JS sem bundler (rotas por hash) + app TypeScript em `game/` (Vite, PixiJS 8, React 19, Vitest) | Reutilizar. O Commerce Office é um **segundo app** em `game/` (`game/office/`), compilado para `public/escritorio/`, aberto dentro do Hub. **Sem dependência nova.** |
| Autenticação | JWT (`requireAuth`, `req.user`, papéis); token em `localStorage` | Reutilizar. O app do escritório roda no mesmo domínio e usa o mesmo token. Nada de auth nova. |
| Banco | `db.json` em memória com `save()`; coleções por usuário; migrações em `server/migrate.js` | Reutilizar: dados em `db().commerce[userId]` (versionado). Sem banco paralelo. |
| Agentes de IA | `db().bots` + `chat()` + `agent.js` (ferramentas por área: tarefas, financeiro, web, imagens...; ações sensíveis pedem confirmação) | **Os agentes do escritório são bots reais** (`commerceAgent: true`). Ganham uma nova área `commerce` com ferramentas próprias. Nenhum segundo chat. |
| Chat/streaming | `POST /api/assistant/chat` (SSE) | Reutilizado para conversar com agentes e despachar tarefas. |
| Pesquisa web / imagens | ferramentas `pesquisar_web`, `gerar_imagem` do agente | Reutilizadas pelos agentes (pesquisa de produtos, criativos). |
| Uploads | `multer` (já instalado), `UPLOAD_DIR` | Reutilizado (validação própria para PNG/ZIP). |
| Estúdio | Tela `estudio.js` com 3 cartões **sem função**: Video editor, Video cut, Ecommerce | O cartão **Ecommerce** passa a abrir o Commerce Office. |

## 2. O que NÃO existe (informação importante)
- **Editor de Vídeo e Video Cut não existem como funcionalidade.** São só cartões "Em breve" que criei antes. Não há nada a integrar tecnicamente hoje: no escritório eles aparecem como estações ligadas a esses cartões, marcadas como **pendentes** até existirem.
- Não há integração com TikTok Shop, Shopee ou Temu, nem módulo comercial/financeiro de afiliados.
- Não há renderização isométrica nem assets isométricos. A rede deste ambiente não alcança os sites de assets, então os assets iniciais são **gerados por código (provisórios)**; o Asset Studio permite trocar por arte real.

## 3. TikTok Shop (afiliado, Brasil) — verificação feita
Pesquisa feita nesta sessão. **Não consegui confirmar em documentação oficial** que a autorização de criador (Creator Authorization) e as Affiliate APIs estejam liberadas para contas brasileiras:
- O blog oficial anuncia Affiliate APIs (campanhas, busca de criadores, links de afiliado), voltadas a **vendedores/parceiros**: [TikTok for Developers](https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity).
- Fontes de terceiros divergem sobre o Brasil (acesso parcial / programa de afiliados incluído).
- Não encontrei página oficial confirmando exportação CSV nativa de pedidos/comissões na Central do Criador do Brasil.

**Decisão:** o conector TikTok Shop é construído com *estado real*: API de criador = "não verificada/pendente"; modo **importação de relatórios CSV e lançamento manual** = operacional. Sem Seller OAuth como substituto, sem scraping, sem cookies ou senhas. Quando a liberação for confirmada (Partner Center/allowlist/escopos), basta preencher as credenciais no conector.

## 4. Decisões de arquitetura
- **Engine:** PixiJS 8 (já no projeto). Projeção isométrica 2:1, tile 64×32, camadas independentes (fundo, pisos, paredes, mobiliário, objetos, personagens, efeitos, interativos), ordenação por profundidade, A* na grade lógica.
- **Backend (`server/commerce/`):** store, rotas, agentes, ferramentas, financeiro, importador CSV, conectores, assets (ZIP próprio e seguro), aquisição de assets, auditoria.
- **Persistência:** layouts, objetos, personagens, associações de estações, metadados de assets, tarefas, produtos, campanhas, lançamentos financeiros e estados operacionais relevantes. Animação quadro a quadro não é persistida.
- **Segurança:** integrações externas só no backend; credenciais cifradas fora do frontend; autorização por usuário; validação de upload (assinatura PNG, limites, anti zip-slip); log de operações; aprovação humana para dinheiro, publicação e ações externas.
- **Honestidade dos dados:** cada lançamento/produto carrega `origem` e `real|teste`; estimativa nunca entra como recebido; sem números inventados.

## 5. Fases
1. Backend base (store, financeiro, importador, conectores, assets/ZIP, tarefas, agentes+ferramentas) com testes.
2. Engine isométrica (projeção, câmera, mapa, colisão, A*, profundidade) + arte provisória + personagens animados.
3. Office Builder (construir/editar/visualizar/executar, desfazer/refazer, salvar).
4. Painéis (agentes, tarefas, produtos, financeiro, importador, conectores, campanhas, Asset Studio, editor de spritesheet).
5. Integração ao Hub (cartão Ecommerce) e testes de navegador + regressão.
6. Documento de status (operacional / pendente / modo importação).
