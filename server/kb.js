// Base de conhecimento do assistente: responde dúvidas sobre o Codeniac sem IA.
// Cada item: palavras-chave (qualquer uma conta pontos), resposta e link para a tela.
const KB = [
  // Aparência
  [['tema', 'temas', 'cor', 'cores', 'aparencia', 'visual', 'escuro', 'claro', 'mudar tema', 'trocar tema'], 'Para trocar o tema: Configurações → Aparência. São 15 temas (Padrão, Batcaverna, Natal, Chuva, Pixel, Fazenda, Escola de magia, Blocos, Retrô 80s…) e um editor para mudar cada cor, o arredondamento, a fonte e o tamanho da interface.', '#/settings/aparencia'],
  [['fonte', 'letra', 'tamanho', 'zoom', 'maior', 'menor', 'densidade', 'compacto'], 'Em Configurações → Aparência → Layout você muda a fonte, o tamanho da interface (85% a 120%), o arredondamento e a densidade (confortável ou compacto).', '#/settings/aparencia'],
  [['logo', 'imagem do login', 'tela de login', 'fundo do login', 'imagem dos cards', 'imagem card', 'banner'], 'O administrador troca o logo, a imagem da tela de login e as imagens dos cards do dashboard em Configurações → Administração → Imagens do sistema.', '#/settings/admin'],
  [['css', 'personalizar estilo', 'codigo css', 'estilo personalizado'], 'Administradores podem escrever CSS próprio em Configurações → Administração → Avançado → CSS personalizado. Vale para todos na hora.', '#/settings/admin'],
  [['menu', 'esconder menu', 'renomear menu', 'ocultar aba', 'itens do menu'], 'Em Configurações → Administração → Avançado → Menu você esconde ou renomeia itens do menu lateral.', '#/settings/admin'],
  // Projetos e páginas
  [['projeto', 'novo projeto', 'criar projeto'], 'Para criar um projeto: menu lateral → Projetos → "Novo projeto" (ou o card "+ Novo projeto" no Dashboard). Escolha nome, ícone e cor.', '#/dashboard'],
  [['pagina', 'subpagina', 'notion', 'bloco', 'adicionar elemento', 'elemento'], 'Cada projeto é uma página estilo Notion. Use "+ Adicionar elemento" (ou digite "/" num bloco vazio) para inserir texto, títulos, listas, checklist, imagem, link, código, subpágina ou controle financeiro. Arraste pelos 6 pontinhos para reordenar.', null],
  [['imagem', 'foto', 'upload', 'colar imagem', 'enviar imagem'], 'Para pôr uma imagem numa página: "+ Adicionar elemento" → Imagem, ou simplesmente cole (Ctrl+V) uma imagem copiada. Capas: botão de imagem no topo do projeto ou da subpágina.', null],
  [['capa', 'capa do projeto'], 'A capa do projeto se troca no botão de imagem no canto do banner da página do projeto.', null],
  [['excluir pagina', 'apagar pagina', 'deletar pagina'], 'Para excluir uma subpágina: abra-a e clique em "Excluir página", ou use o menu do bloco (6 pontinhos) → Excluir subpágina.', null],
  // Tarefas
  [['tarefa', 'tarefas', 'nova tarefa', 'criar tarefa', 'to do', 'pendencia', 'pendencias'], 'Tarefas ficam em "Minhas tarefas". Crie pelo botão +, pelo chat ("/tarefa Estudar SQL") ou pela captura rápida. Elas podem ter prazo, prioridade e repetição (diária, semanal, mensal).', '#/tasks'],
  [['recorrente', 'repetir', 'toda semana', 'todo dia', 'todo mes'], 'Ao criar ou editar uma tarefa, escolha "Repetir": diária, semanal ou mensal. Quando você concluir, a próxima é criada sozinha.', '#/tasks'],
  [['adiar', 'adiada', 'procrastinar', 'procrastinacao', 'travada', 'enrolando'], 'O detector de procrastinação acompanha tarefas adiadas várias vezes, paradas em andamento ou atrasadas há dias, e sugere o que fazer. Veja na aba Hoje ou pergunte "o que estou adiando?".', '#/hoje'],
  [['prioridade', 'urgente', 'importante'], 'A aba Hoje ordena suas prioridades por urgência e importância. Dica: deixe no máximo 3 tarefas como prioridade alta.', '#/hoje'],
  // Rotina
  [['hoje', 'meu dia', 'aba hoje', 'inicio'], 'A aba Hoje reúne briefing, agenda, prioridades, hábitos, modo foco, caixa de entrada e o encerramento do dia. Dá para defini-la como página inicial em Configurações → Rotina.', '#/hoje'],
  [['briefing', 'relatorio da manha', 'resumo do dia', 'bom dia'], 'Todo dia, no horário que você escolher (Configurações → Rotina), chega o briefing: compromissos, atrasos, prioridades, contas, documentos, carro, inglês e InDrive. Ele também pode ser lido em voz alta na aba Hoje.', '#/hoje'],
  [['agenda', 'compromisso', 'compromissos', 'calendario', 'evento', 'reuniao'], 'A agenda fica na aba Hoje. Adicione compromissos com data e hora, ou pelo chat: "/agenda 15/11 14:00 Dentista". Eles entram no briefing e geram lembrete no dia.', '#/hoje'],
  [['habito', 'habitos', 'sequencia', 'streak', 'ofensiva'], 'Hábitos ficam na aba Hoje: marque cada dia feito e acompanhe a sequência (🔥). Crie quantos quiser.', '#/hoje'],
  [['foco', 'pomodoro', 'concentrar', 'cronometro'], 'O modo foco (Pomodoro) está na aba Hoje: escolha a tarefa e inicie. O tempo vai para o registro de estudo/foco. A duração se ajusta em Configurações → Rotina.', '#/hoje'],
  [['encerramento', 'fim do dia', 'fechar o dia', 'como foi o dia'], 'No fim do dia, a aba Hoje pergunta o que você fez, o que travou e sua energia. No horário configurado chega um lembrete.', '#/hoje'],
  [['captura', 'captura rapida', 'caixa de entrada', 'ideia', 'anotar rapido', 'inbox'], 'Captura rápida: aperte Alt+N (ou o botão + no topo) e escreva. Vai para a caixa de entrada na aba Hoje, onde você transforma em tarefa, compromisso ou apaga.', '#/hoje'],
  [['noticia', 'noticias', 'ler depois', 'link salvo', 'salvar link'], 'Para salvar uma notícia ou link: cole na captura rápida (Alt+N) ou mande "/link https://..." no chat. Os links aparecem no briefing em "Para ler".', '#/hoje'],
  // Diário e decisões
  [['diario', 'reflexao', 'journal', 'diario de reflexao'], 'O Diário de reflexão tem visual de caderno de viagem: data, clima, humor, o que aconteceu, gratidão, lição e o plano de amanhã.', '#/diario'],
  [['decisao', 'decisoes', 'decidir', 'escolha', 'alternativas', 'pros e contras', 'duvida'], 'O Assistente de decisões guia em 5 passos: problema, alternativas, critérios com pesos, notas e análise de vantagens, riscos e consequências. Ele calcula a melhor opção e te lembra depois de avaliar como foi.', '#/decisoes'],
  [['atividade', 'historico', 'feed', 'acontecimentos', 'o que aconteceu', 'log'], 'A Central de acontecimentos (menu Atividade) registra tudo: tarefas, páginas, imagens, InDrive, despesas, estudos e configurações, com filtros e busca.', '#/atividade'],
  // InDrive e garagem
  [['indrive', 'corrida', 'corridas', 'ganho', 'ganhos'], 'O controle do InDrive fica em Trabalhos → InDrive. Pelo chat é mais rápido: "/corrida 35 12km" ou "ganhei 35 numa corrida".', null],
  [['turno', 'iniciar turno', 'encerrar turno', 'valor por hora', 'por hora'], 'Na aba Garagem, use "Iniciar turno" ao começar a rodar e "Encerrar turno" ao parar. O resumo mostra ganhos, gastos, km e o valor real por hora; dá para comparar manhã, tarde e noite.', '#/garagem'],
  [['garagem', 'carro', 'veiculo', 'quilometragem', 'km atual'], 'A aba Garagem tem os dados do carro, turnos, abastecimentos, manutenção por km/data, documentos, custo real por km, calculadora de corrida e os melhores horários.', '#/garagem'],
  [['abastecimento', 'abastecer', 'consumo', 'km por litro', 'combustivel'], 'Registre abastecimentos na Garagem (litros, preço e km). O sistema calcula o consumo médio e o custo de combustível por km.', '#/garagem'],
  [['manutencao', 'oleo', 'troca de oleo', 'revisao', 'pneu'], 'Em Garagem → Manutenção cadastre cada serviço com intervalo em km e/ou dias. Você recebe aviso quando estiver perto.', '#/garagem'],
  [['documento', 'cnh', 'licenciamento', 'ipva', 'seguro', 'vencimento'], 'Documentos e vencimentos (CNH, licenciamento, seguro, IPVA) ficam na Garagem. Avisos chegam 30, 7 e 1 dia antes.', '#/garagem'],
  [['vale a pena', 'calculadora', 'custo por km', 'lucro da corrida'], 'A calculadora "Vale a pena?" fica na Garagem: informe valor e km (até o passageiro + corrida) e veja o lucro líquido pelo seu custo real por km.', '#/garagem'],
  [['melhor horario', 'melhores horarios', 'mapa de calor', 'que horas'], 'O mapa de calor da Garagem mostra em quais dias e horários você mais ganha, com base nas corridas registradas.', '#/garagem'],
  // Financeiro
  [['financeiro', 'financas', 'orcamento', 'despesa', 'despesas', 'gasto pessoal', 'receita'], 'A aba Financeiro cuida das finanças pessoais: lançamentos, orçamento por categoria, contas a pagar, assinaturas e importação de extrato. Pelo chat: "/despesa 45 mercado".', '#/financeiro'],
  [['extrato', 'csv', 'importar', 'banco', 'ofx'], 'Para importar o extrato: no seu banco, exporte em CSV; depois Financeiro → Importar extrato, escolha as colunas (data, descrição, valor) e confirme. Lançamentos repetidos são ignorados.', '#/financeiro'],
  [['conta a pagar', 'contas a pagar', 'boleto', 'vencer', 'pagar conta'], 'Contas a pagar ficam no Financeiro, com aviso antes do vencimento. Ao marcar como paga, vira despesa e, se for mensal, já agenda a próxima.', '#/financeiro'],
  [['assinatura', 'assinaturas', 'streaming', 'netflix', 'spotify', 'gasto fixo', 'gastos fixos'], 'Assinaturas e gastos fixos ficam no Financeiro: veja quanto custam por mês e por ano e receba aviso antes de cada cobrança. Ótimo para achar o que cancelar.', '#/financeiro'],
  // Estudos
  [['ingles', 'english', 'flashcard', 'flashcards', 'cartao', 'cartoes', 'revisao espacada'], 'Na aba Estudos → Inglês ficam os flashcards com repetição espaçada: o sistema escolhe o que revisar por dia. Responda "Errei", "Difícil", "Bom" ou "Fácil".', '#/estudos'],
  [['vocabulario', 'palavra', 'traduzir', 'banco de vocabulario'], 'Selecione qualquer palavra ou frase em inglês no sistema: aparece o botão "+ Vocabulário" e ela vira um cartão de estudo.', '#/estudos'],
  [['connected speech', 'pronuncia', 'linking', 'shadowing', 'listening', 'speaking'], 'Em Estudos → Inglês há lições de connected speech (linking, elisão, assimilação, formas fracas, gonna/wanna…) com áudio, além de shadowing, frases para passageiros e diário em inglês.', '#/estudos'],
  [['programacao', 'snippet', 'snippets', 'codigo', 'trilha', 'roadmap'], 'Em Estudos → Programação você guarda snippets de código com tags e monta sua trilha de estudo.', '#/estudos/programacao'],
  [['livro', 'livros', 'leitura', 'estante', 'citacao', 'citacoes'], 'Em Estudos → Livros: estante (quero ler, lendo, lido), progresso por páginas com previsão de término, citações e meta anual.', '#/estudos/livros'],
  // Assistente
  [['comando', 'comandos', 'barra', 'atalho do chat', 'o que voce entende'], 'Comandos do chat: /gasto 50 gasolina · /corrida 35 12km · /tarefa Estudar SQL · /nota texto · /ideia texto · /link url · /agenda 15/11 14:00 título · /despesa 30 mercado · /receita 100 freela · /briefing · /ajuda', null],
  [['personalidade', 'nome do assistente', 'avatar do assistente', 'jeito do assistente'], 'Em Configurações → Assistente você escolhe personalidade, nome, avatar, como ele te chama e o tamanho das respostas.', '#/settings/assistente'],
  [['ia local', 'ollama', 'gemma', 'lento', 'memoria'], 'A IA local (Ollama) é opcional. Se estiver pesada, use o Gemini (grátis, pela internet) ou deixe "Sem IA": o assistente continua respondendo sobre o sistema, executando comandos e montando o briefing.', '/ia'],
  [['gemini', 'google', 'chave', 'api', 'inteligencia artificial', 'ia', 'ia gratis', 'ai studio'], 'Para ligar o Gemini: crie uma chave grátis em aistudio.google.com (Get API key) e cole em Configurações → Assistente → Gemini → "Salvar e testar". A chave fica só no seu computador. Se a cota gratuita acabar, eu volto ao modo sem IA automaticamente.', '#/settings/assistente'],
  // Sistema
  [['celular', 'telefone', 'qr code', 'acessar pelo celular', 'mobile'], 'Para abrir no celular: menu Iniciar → Codeniac → "Codeniac no celular" mostra o QR code. O administrador liga/desliga o acesso em Configurações → Administração → Rede.', '/celular'],
  [['fora de casa', '4g', 'tailscale', 'remoto', 'longe'], 'Para acessar fora de casa use o Tailscale (gratuito) no PC e no celular, com a mesma conta. O endereço aparece na página "Codeniac no celular".', '/celular'],
  [['backup', 'copia de seguranca', 'onedrive', 'restaurar', 'perder dados'], 'O backup automático roda todo dia e guarda as cópias numa pasta (no OneDrive, se você usa). Em Configurações → Administração → Backup você muda a pasta, faz backup agora e restaura.', '#/settings/admin'],
  [['exportar', 'baixar dados', 'meus dados', 'json'], 'Em Configurações → Dados você exporta todos os seus dados em JSON.', '#/settings/dados'],
  [['senha', 'trocar senha', 'mudar senha'], 'Troque a senha em Meu perfil → Segurança.', '#/profile'],
  [['perfil', 'foto de perfil', 'avatar', 'meu nome'], 'Em Meu perfil você muda nome, foto, bio, e-mail e senha.', '#/profile'],
  [['notificacao', 'notificacoes', 'aviso', 'avisos', 'lembrete', 'lembretes', 'sino'], 'As notificações chegam em tempo real (sino no topo). Em Configurações → Notificações você escolhe o que receber e com quantos dias de antecedência.', '#/settings/notificacoes'],
  [['administrador', 'admin', 'usuarios', 'cadastro', 'novo usuario'], 'O painel de administração (Configurações → Administração) gerencia usuários, cadastros, imagens do sistema, backup, rede, CSS, menu, logs e reinício.', '#/settings/admin'],
  [['reiniciar', 'reinicia', 'travou', 'nao abre', 'parar codeniac'], 'Para reiniciar: Configurações → Administração → Avançado → Reiniciar, ou Menu Iniciar → Parar Codeniac e abrir de novo. O log fica em %APPDATA%\\Codeniac\\codeniac.log.', '#/settings/admin'],
  [['conquista', 'conquistas', 'nivel', 'xp', 'medalha'], 'Em Conquistas você vê nível, XP e medalhas desbloqueadas pelas tarefas concluídas.', '#/achievements'],
  [['busca', 'pesquisar', 'procurar', 'buscar'], 'A busca global fica no topo (atalho "/"): encontra projetos, tarefas, páginas, cartões e compromissos.', null],
  [['atalho', 'atalhos', 'teclado'], 'Atalhos: "/" busca · Alt+N captura rápida · Enter no chat envia (Shift+Enter quebra linha) · "/" num bloco vazio de página abre os elementos.', null],
  [['iniciar com o windows', 'abrir sozinho', 'inicializacao', 'ligar o pc'], 'O instalador da 1.3 pode colocar o Codeniac para abrir com o Windows (em segundo plano). Assim o briefing e os lembretes funcionam mesmo sem você abrir.', null],
];

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ENTRIES = KB.map(([keys, answer, link]) => ({ keys: keys.map(norm), answer, link }));

// Retorna a melhor resposta ou null (quando nenhuma combina bem).
export function searchKB(text) {
  const q = ` ${norm(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  let best = null;
  for (const e of ENTRIES) {
    let score = 0;
    for (const k of e.keys) if (q.includes(` ${k} `) || (k.length > 5 && q.includes(k))) score += k.includes(' ') ? 3 : k.length > 6 ? 2 : 1.5;
    if (score && (!best || score > best.score)) best = { ...e, score };
  }
  return best && best.score >= 1.5 ? best : null;
}

export const KB_SIZE = ENTRIES.length;
