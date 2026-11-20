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

### Aviação
- [x] 14 aeronaves novas no Hangar (8 aviões e 6 helicópteros), cada uma com sprite inteiro e danificado (`tools/drive/aviao.py`)
- [x] Física (`public/js/drive/plane.js`): motor com giro progressivo, tração na pista (atrito de rolagem, freio, aderência lateral), sustentação e arrasto induzido, estol; decola acelerando na pista e abaixando a alavanca após a velocidade de rotação; helicóptero com coletivo e pouso vertical
- [x] Dano: raspões, pouso duro e colisão no solo tiram saúde (sprite danificado, fumaça animada, fogo quando grave, motor falhando); saúde zero ou batida forte = queda
- [x] Controles no celular: alavanca vertical, Acelerar/Reduzir, setas; no PC: W/S, A/D, Espaço/Shift
- [x] Tráfego aéreo em horários marcados (`public/js/drive/sky.js`): pousos e decolagens, sobrevoos, patrulha de helicóptero, esquadrilha com fumaça; aeronaves estacionadas no pátio

### Personagens animados
- [x] 42 personagens das folhas enviadas (profissões, cotidiano e fantasia) em `public/assets/rpg/chr` (`tools/drive/chars.py`): folha 4×4 por personagem — frente, direita, costas, esquerda × 4 passos
- [x] Moradores escolhem o personagem pela profissão e pelo gênero; passantes sem profissão variam; a linha segue a direção do movimento, o passo acompanha a velocidade, curiosos se viram para a ocorrência
- [x] Jogador anda nas 4 direções com o passo pela distância percorrida; botão de visual no mapa (salvo no aparelho)
- [x] Personagem padrão do jogador (`tools/drive/heroi.py`): parado e caminhada nas 4 direções + corrida para os lados; apertar 2× a direção (ou tocar 2× no joystick) corre com o dobro da velocidade

### Aeroporto vivo e acidentes de trânsito
- [x] Agenda de voos (`server/world/flights.js`, `GET /mundo/voos`): número, destino/origem, portão, status e moradores de verdade como passageiros; embarque com posts, decolagem (viajam alguns dias), chegada (voltam), notícias; painel ✈ no mapa e aviso do próximo voo no aeroporto
- [x] No mapa: passageiros caminham do terminal até a escada do avião no embarque e descem no desembarque; biplano fora do hangar e do céu
- [x] Acidentes entre moradores (`public/js/drive/accidents.js`): motorista distraído ignora sinal e distância; colisão real com carro (batida) e com quem atravessa fora da faixa (atropelamento); ferido fica no local até a ambulância e vai ao hospital; curiosos em volta; carros rebocados depois
- [x] Notícia + post de testemunha com foto em pixel (cenas do mapa em `public/assets/social`)

### Veículos novos, locadora, colisões, cenas de acidente e manifestações
- [x] 10 carros "City Cars" (civis, táxi, polícia, ambulância) e o Rosso GT recortados com versão danificada (`tools/drive/cars2.py`); polícia e ambulância novas fazem as mesmas funções das antigas
- [x] Locadora Nexus Rent (`#/locadora`, `server/world/rental.js`): aluguel por dia da cidade (85 NXC), carro no Estacionamento Central, vistoria na devolução (danos, sinistro, perda total); sem saldo, processo civil da locadora no Fórum
- [x] Colisões (`public/js/drive/obst.js`): objetos da cidade e da Construtora bloqueiam o jogador a pé e de carro; carros colidem pelo retângulo real; pedestres desviam entre si; correr e esbarrar derruba a pessoa
- [x] Cenas de acidente (`public/js/drive/accidents.js`): batida → fumaça, motoristas conversam; polícia + guincho (motoristas vão com a polícia) ou só guincho (vão no guincho). Atropelamento → motorista vai até a vítima, roda de curiosos, ambulância leva, grupo se desfaz
- [x] Trânsito: abre passagem para sirenes, contorna acidentes pela outra faixa, espera pedestres; equipes saem de perto quando a base está longe
- [x] Manifestações (`server/world/protests.js`, `public/js/drive/protest.js`): agenda diária com tema, lugar e horário; multidão com cartazes e palavras de ordem; notícia e posts com foto

### Cidade refeita do zero (traçado compacto)
- [x] `public/js/drive/city.js` reescrito: 7×4 quarteirões dentro de um anel viário com esquinas curvas, Av. Nexus e Av. Brasil com rotatória, duas diagonais, anexo logístico junto ao aeroporto
- [x] Quarteirões sem grama: calçada contínua com esquinas arredondadas, calçamento de pedra, prédios alinhados nas bordas, pátios com chafariz, bancos, vasos e postes
- [x] Natureza: grama escura, mata densa com clareiras, cerca de madeira em volta da cidade, lago com píer e barcos, montanhas, costa recortada com coqueiros
- [x] Mesmos pontos de interesse, aeroporto, vagas, rotas e sistemas; faixas e calçadas verificadas (0 pontos fora da pista/calçada)

### Ferimentos e saúde dos moradores (etapa 1 da expansão urbana)
- [x] Estado de saúde persistente por morador (`server/world/injuries.js`): saudável, ferido, ferido grave, internado, em recuperação, morto
- [x] Gravidade pela velocidade do veículo; morte é rara e nunca automática
- [x] Internação para ferimentos moderados e graves, alta no dia seguinte e volta à rotina depois da recuperação
- [x] Lista de pacientes no hospital (`/mundo/hospital`, campo `patients`)
- [x] Atropelamentos (do jogador e do trânsito) enviam a velocidade; ferimentos viram evento e notícia
- [ ] Ainda não feito nesta etapa: polícia e prisões, combate, diálogos entre NPCs, trânsito novo e persistência das cenas

### Diálogos entre moradores e com o jogador (etapa 3 da expansão urbana)
- [x] Conteúdo no servidor (`server/world/dialogos.js`), sem IA paga: falas por modelos, tom da personalidade (calmo, agressivo, tímido, arrogante, extrovertido, sarcástico), tema do momento (acidente, crime, manifestação, notícia, clima) e memória da relação
- [x] Desfecho e efeitos decididos pelo servidor: afeição e confiança entre os dois, memória de cada um, discussão ou briga registrada como evento; cooldown de 40 min de jogo por par
- [x] Mapa (`public/js/drive/talk.js`, `cidade2d.js`): dois moradores que se encontram na rua param, viram-se um para o outro e trocam balões em turnos; no máximo 3 conversas ao mesmo tempo; pedestres em conversa não andam
- [x] Painel de conversa ao tocar em um morador: histórico, três respostas (educada, neutra, agressiva) com efeito na relação e link para a ficha
- [x] Testes: `test/dialogos.test.js` e `test/talk.test.js`; `npm test` com 71 testes passando
- [ ] Limitações: moradores sem nome (figurantes) não conversam; briga só registra evento e hostilidade, sem combate; polícia não intervém na conversa; sem perseguição, prisão na rua e trânsito com guincho coordenado pela polícia

### Segunda cidade: Aurora (cidade inteligente) e blitz policial
- [x] `public/js/drive/city2.js`: Aurora no leste do continente (8×6 quarteirões, maior que Nexus City), ligada pela Rodovia Aurora (4 faixas) que continua a Estrada do Leste
- [x] Av. Central de 4 faixas (2 por sentido, divisória tracejada), Boulevard Aurora, Av. das Palmeiras, anel viário com esquinas curvas
- [x] Quatro diagonais em estrela que se encontram na Praça da Estrela (rotatória grande, quarteirões recortados em círculo); rotatórias na Av. das Palmeiras, no trevo da rodovia e na orla
- [x] Em volta, sem ficar quadrado: Av. Beira-Mar pela orla com coqueiros, estradas para três vilas do interior (Vila Serena, Vila Esperança, Porto Aurora), campos e mata
- [x] Aeroporto Internacional Aurora (pista, taxiway, pátio, terminal, torre, hangar, heliponto); o avião do jogador pousa e decola lá
- [x] Serviços próprios (delegacia, hospital, bombeiros, prefeitura, banco, shopping, estádio, terminal); as equipes de emergência saem da base mais próxima
- [x] Sinalização inteligente: semáforos com sensores de fila (verde mínimo 6 s, máximo 22 s, amarelo 2,5 s) em todos os cruzamentos de avenida
- [x] Radares (60 na Av. Central, 80 na rodovia, 50 nas ruas) e Central de Monitoramento: excesso gravíssimo em Aurora gera perseguição mesmo sem viatura por perto
- [x] Blitz (`public/js/drive/blitz.js`, `server/world/blitz.js`): 3 pontos e horários sorteados por dia da cidade; viatura com giroflex, cones e policiais; o policial manda parar, vem à janela e pede a habilitação
- [x] Respostas: entregar habilitação (liberado), não tenho habilitação (multa de 880 + ficha + 2 h detido), desacato (multa de 1.467 + ficha + CNH suspensa + 3 h detido); furar a blitz é fuga (multa e perseguição)
- [x] Detenção persistente na Delegacia de Aurora com contagem e fiança; CNH na carteira; ficha criminal do jogador atualizada
- [x] Nexus City inalterada: mesmas construções, objetos e máscara de colisão no núcleo (conferido contra a versão anterior); a máscara de colisão agora cobre o continente inteiro
- [x] Testes: `test/aurora.test.js` (7) e `test/blitz.test.js` (8); `npm test` com 87 testes passando
- [ ] Limitações: voos programados continuam só no Aeroporto Nexus; a blitz só acontece em Aurora e na rodovia; a geração do mapa passou de ~0,15 s para ~0,4 s

### Personagens novos, reações do corpo e cela
- [x] Todos os personagens do jogo trocados pelas 35 figuras novas (`tools/drive/chars2.py`): moradores, passantes, policiais, médicos, bombeiros, construtores, entregadores, executivos, idosos, banhistas e o visual do jogador
- [x] Caminhada em 4 direções gerada a partir das vistas de frente, lado e costas de cada personagem; papel e gênero usados na escolha de quem aparece em cada profissão
- [x] Reações com os quadros desenhados da folha de referência, iguais para todos os personagens (pintados com o cabelo, a pele e a roupa de cada um em `<chave>-rx.png`): atropelado, baleado, caído (levanta no fim), ferido grave, morto (deitado, sentado e de pé), sangramento, dor (motoristas depois de uma batida) e quase morte; morte por atropelamento (rara, decidida pelo servidor) termina em "morto (deitado)"
- [x] Carros: não mostram mais quem está dentro; aparece só a pessoa entrando ou saindo
- [x] Cela da Delegacia de Aurora montada com as peças do sistema prisional (`public/js/drive/cela.js`): piso, parede com janela gradeada, cama, pia, vaso, câmera, grade e porta trancada, carcereiro fazendo ronda; o jogador anda dentro, sem saída até cumprir o horário (sem fiança); continua presa ao recarregar a página
- [x] Cone da blitz trocado pelo sprite da folha prisional
- [ ] Limitações: a caminhada é gerada a partir das vistas paradas (sem braços balançando); nas reações, o corpo é o da folha de referência pintado por faixas (cabelo, rosto, roupa, calça, sapato), então detalhes como óculos, boné e estampa não aparecem; sete personagens não têm vista de costas; não há armas, então "baleado" existe mas ainda não é usado

### Personagens animados de verdade e ocorrências de rua
- [x] Os personagens do jogo são os 11 das folhas animadas (`tools/drive/chars3.py`): caminhada, corrida e as 10 reações desenhadas de cada um (atropelado, baleado, caído, ferido grave, morto deitado/sentado/de pé, sangramento, dor, quase morte)
- [x] Atropelamento → sequência "atropelado"; assassinato entre moradores (raro) → "baleado" e "morto"; esbarrão correndo → um de três desfechos: inconsciente ("caído"), sentado sangrando (discute com o jogador) ou morte ("sangramento" e "morto")
- [x] Cena de rua (`public/js/drive/street.js`): roda de 5 a 20 curiosos comentando; quem se sente ameaçado chama a polícia ou foge correndo; ambulância chega aos 60 s e a polícia aos 80 s (velocidade ajustada para chegar na hora, paradas afastadas); a enfermeira pergunta e a vítima ou as testemunhas respondem; o policial investiga, o culpado é apontado pela roupa e a polícia persegue; a cena dura de 3 a 5 min
- [x] Penas (`server/world/rua.js`): lesão corporal, lesão grave e homicídio culposo → 1 dia de cela ou fiança; esbarrar num policial → agressão a policial, 2 dias ou fiança; esbarrão andando → discussão (três respostas) e, se o morador chamar a polícia, multa por perturbação; tudo na ficha criminal
- [x] Cela com fiança nas prisões que permitem (a blitz continua sem fiança)
- [ ] Limitações: só 2 personagens masculinos (barbudo e policial), então todos os moradores homens aparecem com um deles; as folhas não trazem bombeiro, construtor nem médico; o horário das viaturas é ajustado pela distância, mas um engarrafamento grande ainda pode atrasar alguns segundos

### Próximos refinamentos
- Social, Notícias, Governo, Justiça, Internet, Diversão, Arquivo e Controle usam as telas existentes já recoloridas pelo design system; podem ganhar layouts próprios no padrão das instituições.
- Relógio acelerado da cidade (botões 4× e 16× do mapa) e população acima de 500 moradores.
