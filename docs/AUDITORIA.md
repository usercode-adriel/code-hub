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
- [x] Rostos em pixel para todos os personagens de IA (`server/pixelfaces.js`: retratos prontos sem repetir, por gênero e profissão; quando acabam, geração no mesmo estilo)
- [x] Fase 2 — design system (`public/css/cx.css`): paleta navy/roxo sólida, tipografia, cartões, botões; moldura nova (`public/js/chrome.js`) em TODAS as rotas
- [x] Fase 3 — Início: mapa em pixel no centro com filtros e pontos clicáveis, LIVE da cidade, ações rápidas, notícias, eventos, entretenimento, atividades, economia, redes sociais
- [x] Fase 4 — páginas refeitas: Loja (vitrine de cartões, vendedor com avatar e chat, LIVE), Banco Nexus (gerente de IA, ações, chat, LIVE, conta), Delegacia (policial de plantão, ocorrências, inquéritos, multas, equipe, LIVE), Hospital (novo), Empregos (novo), Propriedades (novo), Veículos (novo), Minha Vida (novo), Inventário, Acontecimentos e Desenvolvimento (antes "em construção"), Configurações (visual único)
- [x] Fase 5 — dispositivos (`public/js/devices.js`, `server/world/devices.js`): celular com SO em pixel e apps reais, carteira, relógio; 7 celulares compráveis por nível
- [x] Fase 6 — LIVE reutilizável (`public/js/world/live.js` + `GET /mundo/ao-vivo`) só com eventos reais (chegadas/saídas, compras, banco, polícia, saúde)
- [x] Fase 7 — celular: barra inferior com botão do celular, menu lateral em gaveta, sem rolagem horizontal (verificado em 21 rotas a 390 px)
- [x] Fase 8 — testes (`test/cx.test.js`) + capturas
- [x] Loja clandestina (`server/world/underworld.js`): escondida até ser descoberta, só dinheiro vivo, itens fictícios no inventário, abordagem policial com apreensão e multa
- [x] Veículos (`server/world/vehicles.js`): concessionária, garagem, carro principal, deslocamento de carro
- [x] Saúde (`server/world/health.js`): saúde cai por dia, check-up pago, atendimentos de moradores no LIVE
- [x] Tela de login em pixel
- [x] Mapa em pixel (camada fixa rasterizada numa imagem só; marcadores, rostos e rotas continuam interativos)
- [x] Hub pessoal só pelo perfil (a barra lateral troca para "Meu hub" nas telas pessoais)
- [x] Nenhuma funcionalidade antiga perdida: todas as rotas listadas acima abrem na moldura nova; testes antigos continuam passando

### Cidade 2D dirigível (novo Mapa)
- [x] Mapa novo a partir dos dois assets (cidade completa + peças), em camadas: imagem, semáforos/radares, pedestres, carros, rótulos
- [x] Colisões: máscara gerada de `public/assets/drive/roads.json` (prédios, árvores e água sólidos; ruas, calçadas, faixas, estacionamento e ponte livres); a pé só calçada e faixa
- [x] Trânsito automático (`public/js/drive/traffic.js`): mão direita, semáforos em 17 cruzamentos, rotatórias no sentido anti-horário, curvas mais lentas, distância segura, espera de pedestres, viatura patrulhando
- [x] Pedestres (`public/js/drive/peds.js`): moradores reais com nome e rosto em pixel, só nas calçadas, atravessando na faixa com o sinal
- [x] Garagem integrada: carros comprados aparecem estacionados (marcador verde "SEU"), entrar/sair, estacionamento salvo no servidor
- [x] Direção (`public/js/drive/player.js`): aceleração progressiva, inércia, freio, freio de mão, ré, marcha D/N/R, colisão com prédios e carros
- [x] Controles: teclado (W/A/S/D, espaço, E, roda, arrastar) e celular (joystick, volante, acelerador, freio, marcha, entrar/sair, pinça)
- [x] Câmera com zoom limitado, seguindo o carro com antecipação; minimapa; região, hora da cidade, velocidade, marcha, veículo; entrada nos estabelecimentos
- [x] Fiscalização: avanço de sinal, 4 radares, estacionamento irregular (guincho) — multas reais no banco, com limite por tipo e por dia
- [x] Desempenho: só o trecho visível é desenhado; 58 fps no celular com CPU 4× mais lenta, 60 fps no PC; sem vazamento de memória
- O mapa de bairros antigo continua em `#/mapa?classico=1` e nos links de lugares (`#/mapa/<id>`), com rotas e deslocamento

### Mapa jogável v3 (cidade maior, aviões, emergência)
- [x] Cidade gerada (`public/js/drive/city.js`) com 4096×2816 unidades (~7× o mapa anterior): centro comercial, bairros, distrito empresarial, área industrial, porto seco, parques, lago, rio com pontes, terminal, postos, estacionamentos, aeroporto completo
- [x] Assets das folhas enviadas em `public/assets/rpg` (carros, danificados, aviões, NPCs por profissão, efeitos, mobiliário); script em `tools/drive/build.py`
- [x] Renderização em blocos em cache, só o visível (`public/js/drive/render.js`); noite com fontes de luz individuais
- [x] Jogador a pé anda por rua, calçada, grama e água; NPCs só nas calçadas
- [x] Portas animadas, motorista visível; dano e inutilização; reboque e reparo cobrados (`server/world/drive.js`)
- [x] Ocorrências (`public/js/drive/incidents.js`): curiosos, ambulância leva feridos, viatura, bombeiros, perseguição policial; viram notícia e afetam o morador
- [x] Voo (`public/js/drive/plane.js`): empuxo, sustentação, gravidade, estol, pouso, colisão pela altura dos prédios; Hangar vende aeronaves
- [x] Celular: controles de voo, botões suaves, tela cheia e tela girada
- [x] Compra direta liberada em todas as lojas

### Construtora e modo Reforma
- [x] Construtora Nexus (`#/construtora`): catálogo livre (sem compra) com todos os assets das folhas — prédios (incl. cidade filipina, cidade 16 bit e prédios modernos), relevo (montanhas, penhascos, vulcão, cavernas), lagos, rios e cachoeiras, natureza, mobiliário, sinalização, veículos e barcos, fachadas, obras e pisos texturizados (ruas, cruzamentos, curvas, terra, areia, dunas, ferrovia, estacionamento); “Usar no mapa” abre o editor com o item escolhido
- [x] Recortes das folhas extras: `tools/drive/extra.py` → `public/assets/rpg/extra` + `public/js/drive/extrameta.js` (carregados só quando usados)
- [x] Mapa em formato de continente original com ilhas (`public/js/drive/terreno.js`): costa recortada, ilha-barreira com laguna, ilhotas, arquipélago, península, lagos; praia, água rasa e espuma; outros formatos continuam no seletor
- [x] Botão Reforma no mapa (`public/js/drive/editor.js`): mover, colocar com prévia, apagar qualquer item, pintar piso com pincel 1×1 a 8×8, girar, tamanho de 30% a 400%, busca na paleta, desfazer, salvamento automático

### Próximos refinamentos
- Social, Notícias, Governo, Justiça, Internet, Diversão, Arquivo e Controle usam as telas existentes já recoloridas pelo design system; podem ganhar layouts próprios no padrão das instituições.
- Relógio acelerado da cidade (botões 4× e 16× do mapa) e população acima de 500 moradores.
