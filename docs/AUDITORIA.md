# Reconstrução visual total — auditoria e checklist

Regra principal: **trocar só a camada visual**. Toda a lógica (servidor, mundo, IA, economia, rotinas,
memórias, organizações, automações) continua igual. Nenhuma tela nova usa dados falsos: tudo vem das APIs abaixo.

## 1. O que existe (e precisa continuar funcionando)

### Telas (public/js/views) → rota
| Cidade (principal) | Rota | API |
|---|---|---|
| Início / Command Center | `#/centro` | `/mundo/resumo`, `/mundo/eventos`, `/mundo/mapa/ao-vivo` |
| Mapa vivo | `#/mapa` | `/mundo/mapa/geo`, `/mundo/mapa/camadas`, `/mundo/mapa/pessoas`, `/mundo/mapa/ao-vivo`, `/mundo/rota`, `/mundo/ir` |
| Loja / Mercado | `#/mercado` | `/mundo/lojas`, `/mundo/lojas/:id` (+ comprar, conversar, negociar, avaliar) |
| Banco Nexus | `#/banco` | `/mundo/banco/*` (pix, transferir, cartão, cofrinho, empréstimo, senha) |
| Inventário | `#/inventario` | `/mundo/inventario`, `/mundo/inventario/:id/:acao` |
| Empregos | `#/empregos` (novo, sobre APIs existentes) | `/mundo/carreira`, `/mundo/trabalho`, `/mundo/freelas`, `/mundo/vagas`, `/mundo/profissao/:key` |
| Propriedades | `#/propriedades` (novo) | `/mundo/imoveis`, `/mundo/imoveis/:id/:acao`, `/mundo/mapa/casa/:id` |
| Economia / Empresas | `#/empresas` | `/mundo/economia`, `/mundo/empresas/*`, `/mundo/bolsa` |
| Organizações | `#/organizacoes` | `/mundo/organizacoes/*` |
| Polícia (Delegacia) | `#/policia` | `/mundo/policia`, `/mundo/policia/denuncia`, `/mundo/investigacoes` |
| Justiça | `#/justica` | `/mundo/justica/*` |
| Governo | `#/governo` | `/mundo/governo/*` |
| Notícias / Mídia | `#/midia` | `/mundo/midia/*` |
| Social | `#/social` | rede social (`/social/*`) |
| Internet | `#/internet` | `/mundo/internet/*` |
| Acontecimentos | `#/acontecimentos` | `/mundo/eventos` |
| Desenvolvimento urbano | `#/cidade` | `/mundo/mapa/camadas`, `/mundo/economia` |
| Arquivo, Controle da IA, Diversão | `#/arquivo`, `#/controle`, `#/diversao` | `/mundo/historia`, `/mundo/controle`, `/mundo/diversao` |

| Meu hub (acessado pelo perfil) | Rota |
|---|---|
| Painel pessoal, Hoje, Atividade | `#/dashboard`, `#/hoje`, `#/atividade` |
| Assistente / Chat | `#/assistente` |
| Tarefas, Financeiro, Garagem, Estudos, Livros, Diário, Decisões | `#/tasks`, `#/financeiro`, `#/garagem`, `#/estudos`, `#/livros`, `#/diario`, `#/decisoes` |
| Automações, Notificações, Conquistas, Rede, Busca | `#/automacoes`, `#/notifications`, `#/achievements`, `#/rede`, `#/busca` |
| Perfil, Configurações, Projetos | `#/profile`, `#/settings`, `#/project/:id` |

### Sistemas de servidor preservados
- `server/world/*` — núcleo (`core.js`: `record`, hooks), agentes, sociedade, organizações, vida diária (`living.js`), mapa, comércio, economia, banco, polícia, justiça, política, mídia.
- `server/social.js` — rede social, personas (agora com rosto em pixel: `server/pixelfaces.js`).
- `server/assistant.js`, `server/automations.js` — IA, conversas, rotinas.
- Stream de eventos em tempo real (`connectStream` em app.js) e o feed ao vivo (`/mundo/mapa/ao-vivo`, `services.live`).

## 2. Checklist da reconstrução

- [x] Fase 1 — auditoria (este arquivo)
- [x] Rostos em pixel para todos os personagens de IA (retratos prontos + geração no mesmo estilo quando acabam)
- [ ] Fase 2 — design system: paleta navy/roxo sólida, tipografia, cartões, botões, chips; moldura nova (barra lateral, topo, trilho de dispositivos, barra inferior no celular) para TODAS as rotas
- [ ] Fase 3 — Início: mapa em pixel no centro, LIVE da cidade, ações rápidas, notícias, eventos, entretenimento, atividades
- [ ] Fase 4 — páginas: Loja, Banco Nexus, Delegacia, Hospital, Empregos, Inventário, Propriedades, Economia, Organizações, Veículos, Minha Vida, Configurações, Chat
- [ ] Fase 5 — dispositivos: celular (SO em pixel com apps reais), carteira, relógio; smartphones compráveis por nível
- [ ] Fase 6 — painéis LIVE reutilizáveis com eventos reais
- [ ] Fase 7 — celular: barra inferior, sem rolagem horizontal, mapa por toque
- [ ] Fase 8 — testes automatizados + capturas
- [ ] Loja clandestina (itens fictícios → inventário, com risco policial)
- [ ] Tela de login em pixel
- [ ] Nenhuma funcionalidade antiga perdida (todas as rotas acima continuam abrindo)
