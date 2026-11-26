# Commerce Office 2.1 — escritório de duas salas e equipe de agentes sociais

Acesso: Estúdio → card **Ecommerce**. Tudo roda dentro do Hub (mesma autenticação, mesmo `db.json`, mesmas rotas `/api/commerce`).

## Auditoria feita antes de mexer (resumo)
- Renderização: PixiJS 8 em `game/src/office/*` (engine isométrica já existente) — **reaproveitada**, sem segundo sistema de escritório.
- IA: bots do chat (`db().bots`) + `server/agent.js` (ferramentas por área) + `assistant.js`. Os cinco funcionários continuam sendo bots reais; acrescentei só `gerarTexto()` em `assistant.js` (geração curta sem ferramentas, sem gravar memória do usuário).
- Tarefas, produtos, campanhas, financeiro, conectores, assets, layouts: intactos (`server/commerce/*`).
- Não removi nada: a equipe da versão 1 (Helena, Arthur, Sofia, Isabela, Marina) fica **arquivada** com todo o histórico; o layout de 8 departamentos continua salvo na lista de layouts, apenas deixa de ser o ativo.

## O que mudou
**Arquitetura física** — exatamente duas salas, no mesmo ambiente, ligadas por porta:
- *Estoque e Logística* (11×14): 6 prateleiras de estoque, paletes, pilhas e caixas de 3 tamanhos, bancada de conferência com computador de controle, impressora de etiquetas, balança e documentos, bancada de embalagem com materiais, carrinho, organizadores, quadro de avisos, extintor, faixa de segurança no piso, janelas.
- *Escritório Central* (21×14), aberto: 4 estações completas (mesa, monitor, teclado, mouse, torre do PC, cadeira, documentos, objeto pessoal, luminária), quadro branco na parede, estantes com livros, armários, prateleira de parede, impressora com papéis e pastas, arquivo, servidor/rack, painéis (indicadores, financeiro, produtos), marketplace/importação, mesa de reuniões com cadeiras, sofá, poltronas, tapetes, relógio, luminárias, quadros decorativos, plantas e vasos, área de café (balcão, cafeteira, xícaras, bebedouro, frigobar).
- 28 novos objetos desenhados em pixel art isométrico (todos com teste de arte), pisos novos (concreto, faixa, madeira clara).

**Funcionários** (editáveis em Agentes → Editar: nome, cargo, temperamento, tom, especialidade, objetivos, instruções, modelo): Eleonor (Marketing e Criativos), Lady Iris (Estratégia de Vendas), Sophia (Financeiro), Laurinda (Idealizadora e Inovação), Lucya (Estoque e Logística).

**Comunicação e comando**
- Caixa **Chefe** sobre o escritório: o chefe escreve uma ordem e **não conversa** com cada agente (o chat individual foi removido do painel do agente).
- `server/commerce/equipe.js`: interpreta a ordem (IA), escolhe responsáveis, faz a equipe discutir em turnos limitados (falas geradas pela IA real, com personalidade, tom, memória e relações), cria e despacha as tarefas reais, registra tudo.
- Estados da ordem: Ordem recebida → Tarefa planejada → Em execução → Aguardando aprovação → Concluída (ou Falha / Bloqueio / Cancelada).
- Nuvens de diálogo sobre o personagem certo, seguem a câmera, ficam dentro da tela, não se sobrepõem, entram/saem com animação, duração ajustável, 6 estilos (conversa, ideia, pergunta, alerta, discordância, conclusão).
- Histórico de conversas (aba Conversas) com tipo e **classificação da informação**: real, estimada, simulada, sugestão da IA.
- Quando a discussão é coletiva (3+), os personagens se levantam e vão aos assentos da mesa de reuniões; ao terminar, voltam ao posto. Estados visuais: trabalhando, digitando, pensando, conversando, caminhando, sentado, reunido, descansando (só após 5 min ociosa), aguardando, comemorando (só quando a ordem termina sem falhas), preocupado (só em erro/bloqueio real).
- Relações profissionais nascem do histórico (colaborações × discordâncias nas últimas 20 interações): nada de rivalidade fixa.

**Execução real** (ferramentas novas registradas no `agent.js`): `commerce_documentos` (roteiro, proposta estruturada, relatório, análise, pesquisa; "real" exige fonte) e `commerce_estoque` (cadastro, entrada, saída, ajuste, divergência; saldo = soma dos movimentos; saída acima do saldo é recusada). Produtos, campanhas e leitura do financeiro já existiam. Agentes **não** publicam, não compram e não lançam dinheiro; os resultados ficam "aguardando aprovação" do chefe.

**Limites e controle**: máx. de falas por ordem (2–12), orçamento diário de chamadas de IA (cada fala, plano e tarefa conta), uma ordem por vez, cancelar ordem, pausar/ativar funcionário, duração do balão. Sem ordem do chefe, nenhuma chamada é feita.

## Decisões de engenharia (ambiguidades do pedido)
- A Sala 1 cita "Bruno", mas a lista de cinco funcionários define **Lucya** como Estoque e Logística. Usei **Lucya** (cinco agentes) e não criei o Bruno.
- Quatro estações individuais para quatro funcionários no Escritório Central; a quinta (Lucya) trabalha no Estoque, com assento na mesa de reuniões quando participa de uma discussão.
- No teste de aceitação, quem pesquisa produtos é decidido pelo plano da IA a partir das especialidades (pesquisa de produtos é de Lady Iris/Laurinda pelas responsabilidades descritas), não por nomes fixos.

## Resultado do teste de aceitação
Ordem: "Equipe, quero encontrar um produto com potencial de venda no TikTok Shop, desenvolver uma campanha e analisar a rentabilidade."
- **Automatizado e aprovado** (`npm run office:e2e`, teste 16) com um **dublê de IA** (`server/commerce/iaTeste.js`, só ativo com `CODENIAC_TESTE_IA_FALSA=1`): a ordem vira plano de 4 responsáveis, a equipe se reúne à mesa, as nuvens aparecem (dentro da tela, sem sobreposição), 4 tarefas reais são criadas e despachadas, documentos/produto/análise são registrados, a ordem chega a "Aguardando aprovação", conclui após a aprovação e tudo persiste após recarregar. Tudo que o dublê produz aparece marcado como **simulado / TESTE**.
- **Não verificado com IA real**: este ambiente não tem IA configurada, então a qualidade das falas, do plano e da pesquisa de produtos pela IA real **não foi testada**. Sem IA, a ordem é recusada com mensagem clara (nada é simulado). Para testar de verdade: Configurações → Assistente → conectar Gemini, Groq ou OpenRouter, e dar a ordem pela caixa Chefe.

## Limitações conhecidas
- As conversas entre agentes exigem IA **na nuvem** (Gemini/Groq/OpenRouter). Só Ollama/Claude local não bastam para as falas.
- Reunião com 2 participantes não leva à mesa (conversam do posto); a mesa é usada a partir de 3.
- Editor de Vídeo e Video Cut continuam "em breve" no Estúdio (as ferramentas não existem). Publicação externa continua não implementada.
- Rotação de objetos altera só a área ocupada (o sprite não é espelhado).
- Desempenho medido só com WebGL por software (~25 FPS); 60 FPS em GPU real não foi medido.

## Testes
`npm test` (141) · `npm run jogo:test` (72) · `npm run test:browser` (10) · `npm run jogo:e2e` (22) · `npm run office:e2e` (17).
