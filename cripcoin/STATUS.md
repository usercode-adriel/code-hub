# CRIPCOIN OFFICE SIMULATOR — estado do projeto

Simulador de escritório 2D (vista de cima, pixel art). Projeto independente em `cripcoin/` (Vite + React + TypeScript + canvas 2D).
Substitui por completo o antigo "Commerce Office" (backup: tag git `backup-commerce-office-v3`). O cartão **Cripcoin Office** do Estúdio (Hub) abre o jogo.

## Como rodar
| Comando | Para quê |
|---|---|
| `npm run cripcoin:dev` | servidor de desenvolvimento (http://localhost:5173/cripcoin/) |
| `npm run cripcoin:build` | compila para `public/cripcoin/` (servido pelo Hub em `/cripcoin/`) |
| `npm run cripcoin:test` | testes de lógica (vitest, 30 testes) |
| `npm run cripcoin:e2e` | testes de navegador (Playwright, 6 cenários; precisa do build) |

## Estrutura
```
cripcoin/
  assets-fonte/   imagens originais (tileset, cena de referência, folha de objetos, 5 avatares)
  tools/          scripts Python que recortam as imagens (arte.py, personagens.py, objetos_indice.py)
  public/arte/    sprites recortados + manifesto.json (objetos/, pisos/, paredes/, personagens/)
  src/tipos.ts    modelo de dados (Projeto = JSON puro, é o que vai para o save)
  src/dados/      catálogo de ~80 itens (preço, tamanho, camada, colisão, interação...) e dados de pessoas
  src/nucleo/     mapa (grid, colocar/mover/paredes/portas), colisão, A*, tempo, persistência, jogo (loop)
  src/sistemas/   economia (CC), funcionários + simulação, arquivos (FS do computador), objetos interativos, pesquisa
  src/render/     arte (loader com placeholder) e renderer canvas (câmera, profundidade, editor)
  src/ui/         menu/criador, tela do jogo, painéis, computador (OS), janelas dos objetos
  tests/ e e2e/   testes
server/cripcoin.js  rotas /api/cripcoin/pesquisar e /pagina (web real, exigem login do Hub)
```

## O que está operacional (testado)
- **NOVO PROJETO**: nome, empresa, largura/altura em tiles reais (6–60), tile, piso, cor e altura da parede, até 4 portas. Várias partidas, salvamento automático (≈8 s) e manual, exportar/importar arquivo.
- **Escritório inicial**: só uma mesa simples + laptop + cadeira básica, 1500 CC, sem NPCs nem decoração.
- **Editor 2D**: grade real, zoom/pan, selecionar/mover (arrastar)/girar (R)/guardar/vender, pintar piso (retângulo), paredes e divisórias estilo Sims (linha/retângulo, demolir), portas, mostrar colisões, modo construir/usar (B). Regras reais de colocação (piso, parede, sobreposição, "sobre a mesa", enfeite de parede só em parede com chão na frente).
- **Economia CRIPCOIN**: saldo persistente, extrato, compra com confirmação, estoque diário da loja, inventário (busca/filtro/colocar/vender), venda a 60 %.
- **Loja**: só pelo ícone LOJA do computador (botão 🛒 do topo abre o primeiro computador já na Loja). 13 categorias.
- **CONTRATAR**: 5 candidatos determinísticos, perfil completo, personalização (nome, sobrenome, apelido, cargo, até 5 traços, comportamento, salário, horário), contratado some da lista e não duplica, ex-funcionários, licença, demissão, estação de trabalho (mesa + cadeira encostada + computador; uma pessoa por mesa).
- **Simulação**: relógio de jogo (1 s = 1 min × 1/2/3), dias úteis, funcionários chegam pela porta, andam com A* (colisão, sem cortar quina), sentam, trabalham e geram CC, pausa/café/sofá/conversa/balões, saem no fim do expediente; salário diário; atraso de 3 dias = pedido de demissão; plantas secam; estoque da loja renova.
- **Computador (CripcoinOS)**: área de trabalho, barra de tarefas, menu iniciar, janelas arrastáveis; Arquivos (criar/renomear/abrir/editar/salvar/excluir→Lixeira/mover/copiar, tudo persistente por computador), Notas, Calculadora, Loja, Configurações (papel de parede), Navegador.
- **Objetos interativos**: armário com inventário próprio e porta abrir/fechar, quadros brancos (desenho, lista de tarefas, brainstorm; um por quadro), cafeteira (grãos/xícaras; funcionários cansados tomam café), impressora (fila de arquivos reais e papel), TV, relógio, plantas (água/rega), lixeira.

## Equipe fixa e conversa (versão atual)
- **3 personagens novas** (`assets-fonte/personagem-*.png` → `tools/personagens.py`): sentadas na cadeira, **4 vistas** (frente, costas, lado esquerdo e direito). Não há diagonais nem quadros de caminhada: o movimento é **apenas rotacional** entre as vistas existentes.
- **Permanentes**: depois de contratadas ficam para sempre na cadeira da estação (mesa + cadeira encostada + computador). Não chegam, não saem, não andam. Sem estação livre ela não aparece e é encaixada automaticamente quando você montar uma. Saves antigos com as 5 personagens antigas perdem esses funcionários (substituição pedida); candidatos são refeitos.
- **Contratação personalizada**: nome, sobrenome, apelido, cargo/função, personalidade (traços), **defeitos**, **habilidades (sliders que você define)**, habilidades extras em texto livre, comportamento, salário e horário.
- **Caixa de conversa** (canto inferior direito): você escreve, as personagens respondem com **balão sobre a cabeça, uma de cada vez**. Citando o nome/apelido só essa pessoa responde; sem nome, todas as que estão na mesa respondem em fila. A personagem se vira para você (vista frente) enquanto fala. Histórico por personagem salvo no projeto.
- **A fala vem de IA real**: o servidor (`POST /api/cripcoin/conversar`) usa a IA configurada no Hub (Gemini/Groq/OpenRouter) com o perfil da personagem (personalidade, defeitos, habilidades, cargo, hora/dia, equipe, histórico). Sem login no Hub ou sem IA configurada aparece um aviso de erro claro; **nenhuma resposta é inventada**. Não foi possível testar uma IA real neste ambiente (sem internet/chaves): o fluxo foi testado com um provedor de teste e a rota com validações.
- **Pronto para automações** (`src/automacao/`): barramento de eventos (mensagem, resposta, contratação, demissão, compra, venda, objeto colocado, dia novo, salvou), regras persistidas no projeto (`evento + filtro → ações`), ações extensíveis (`aviso`, `falar`, `recompensa`), provedor de respostas trocável e API pública `window.cripcoin` (`definirProvedor`, `registrarAcao`, `adicionarAutomacao`...). **Ainda não há tela para criar regras**: a base está testada para essa tela ou para integrações.
- **Quadro Codeniac**: o logo foi recortado do fundo preto, colocado sobre fundo cinza com moldura (`tools/logo.py`) e entra na loja (Decoração) como objeto de parede.
- **Editor**: nova ferramenta **Cor da parede** (12 cores, arrastar sobre trechos ou "Pintar todas"), e o piso pode ser trocado por trecho ou **na sala inteira**.

## Construção v2 (superfícies, parede e escala)
- **Parede como superfície inteira**: a face visível da parede (célula + faixa acima dela) é a área de fixação. Relógios, quadros, prateleiras, janelas e plantas penduradas ficam em qualquer segmento com chão na frente e em **qualquer altura** (`alt` 0 rodapé … 1 topo), com profundidade própria. A colisão física (chão) e a fixação são regras separadas (`nucleo/superficie.ts`: `temFace`, `paredeSob`).
- **Superfícies de apoio**: móveis declaram áreas úteis por nível (mesas, estantes com 3 níveis, armários) em frações do sprite (`dados/propriedades.ts`); cada item declara em que tipos de superfície fica (`apoio`). A posição do item é (`nivel`, `u`, `v`) relativa ao móvel: acompanha o móvel quando ele é movido, nunca sai da área útil e recusa sobreposição por largura real do sprite.
- **Escala individual**: `ex/ey` por objeto (travar proporção), limites por asset (`escala.min/max`), escala padrão por categoria (computador, cafeteira, plantas… com alvo em px de arte relativo à mesa). A pegada de colisão de objetos de piso cresce com a escala (mínimo 1×1) e é revalidada; itens apoiados também são revalidados.
- **Editor**: painel de propriedades (largura/altura em tiles, escala H/V, −/+/restaurar, travar proporção, nível/lateral/fundo na superfície, altura na parede, X/Y, girar, duplicar, guardar, vender, salvar), alças de canto arrastáveis, contorno, pegada, âncora (cruz rosa), dimensões e camadas visuais **Colisões** e **Superfícies**.
- **Migração**: projetos antigos ganham `nivel/u/v/alt` ao carregar (`reacomodar`); nada é apagado.
- Limites: a escala redesenha o sprite com vizinho mais próximo (pixels nítidos; escalas não inteiras podem mostrar pixels de tamanhos ligeiramente diferentes). Só a face SUL da parede (a que se vê de cima) aceita fixação. Móveis de piso com uma só vista (mesas) não giram.

## Limitações honestas
- **Avatares**: 3 personagens sentadas em 4 vistas (sem caminhada, sem diagonais): por isso o movimento é só rotacional e elas ficam fixas na mesa.
- **Navegador**: a pesquisa usa o servidor do Hub (Google/DuckDuckGo) e exige login no Hub; sem login ou sem internet mostra erro claro — nunca resultados falsos. **Não foi possível validar a pesquisa ao vivo neste ambiente de desenvolvimento (sem acesso à internet)**; as rotas têm teste de erro/segurança e o cliente foi exercitado no cenário "sem sessão". "Ler aqui" mostra o texto da página; sites abrem em nova aba.
- **Bebedouro e itens de decoração**: sem função além de existir (a janela diz isso).
- Sprites de armário/TV/cafeteira não têm versão "aberta/ligada": o estado é salvo e a TV ganha brilho; a porta do armário é só estado.
- Só existe 1 sprite por objeto sem variantes (girar apenas espelha); só cadeiras têm 4 direções.
- Os recortes vêm de imagens fornecidas pelo usuário: confirme a licença de uso antes de distribuir.
- Construção (piso/parede/porta) é gratuita; só móveis custam CC.
