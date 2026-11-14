# Codeniac 1.8

Hub pessoal de projetos, rotina, InDrive, finanças e estudos. Roda no seu computador (Windows), com dados guardados localmente.

## Abas principais

- **Início**: destaque em carrossel, próximos prazos, projetos, foco agora e estatística.
- **Livros**: painel de leitura (estante, estatísticas, últimas leituras) e biblioteca digital de PDF/EPUB com banco próprio (`library.json`).
- **Hoje**: briefing automático da manhã, agenda, prioridades, detector de procrastinação, hábitos, pomodoro, caixa de entrada e encerramento do dia.
- **Garagem**: turno do InDrive (valor por hora, manhã × tarde × noite), "vale a pena essa corrida?", custo por km, mapa de melhores horários, abastecimentos, manutenção, documentos e reservas.
- **Financeiro**: lançamentos, importação de extrato CSV, orçamento por categoria, contas a pagar e assinaturas.
- **Estudos**: flashcards de inglês com repetição espaçada, connected speech, shadowing, pares mínimos, ditado, diário em inglês, banco de vocabulário, snippets, trilha de programação e estante de livros.
- **Diário** (estilo caderno de viagem do velho oeste), **Decisões** (passo a passo com critérios e pesos) e **Atividade** (feed automático).
- **Projetos** com páginas estilo Notion e o controle financeiro do InDrive.
- **Visual premium**: temas premium (Arena Neon, Ciano Cyber, Inferno...) com início em vidro e degradê, personagens PNG que saem dos cartões com movimento leve (o administrador envia os PNGs e liga/desliga em Configurações → Aparência) e nova tela de login com a logo code hub.
- **IAs na nuvem**: Gemini, Groq e OpenRouter (chaves gratuitas), cada personagem pode usar a sua; se uma falhar, o sistema usa as outras.
- **Chat com superpoderes**: pesquisa na web com links e fontes, gera imagens, cria arquivos (PDF, Word, planilha, CSV, texto), responde em inglês quando você escreve em inglês.
- **Modo desenvolvedor** (administrador): liga ao GitHub, a IA lê o código e propõe pequenas alterações (diff, aprovação, pull request) e o computador pode se atualizar a partir do GitHub, com desfazer.
- **IA que age** (Gemini, Groq ou OpenRouter): registra, cria, paga, marca e consulta dados por você, com confirmação, desfazer, permissões por personagem e memória.
- **Automações**: rotinas, plano do dia, revisão semanal, assinaturas detectadas, sugestão de turno, cápsula do tempo e debate de decisões.
- **Conexões**: personagens no Telegram e app no celular com notificações (Web Push via HTTPS do Tailscale). Veja `HOSPEDAR.md` para rodar na nuvem.
- **Assistente** estilo Telegram: personagens, grupos em que eles conversam entre si, fotos e PDFs no chat, mensagens automáticas por função; sem IA ou com o Gemini (Google, grátis). Também entende comandos: `/gasto 50 gasolina`, `/corrida 35 12km`, `/tarefa Estudar SQL`, `/nota`, `/agenda`, `/briefing`, `/ajuda`.
- 16 temas escuros (7 de cores básicas e 9 prontos), chats com personagens, painel de administração, backup automático diário e acesso pelo celular (Wi-Fi ou Tailscale).

## Rodar em modo desenvolvimento

Requer Node.js 20.12 ou mais novo.

```bash
npm install
npm start
```

Abra http://localhost:3000. Primeiro acesso: `admin@codeniac.dev` / `codeniac123` (troque em Perfil).

Opções: `node server/index.js --data-dir=CAMINHO --port=3000 --log-file=ARQUIVO`.
Sem `--data-dir`, os dados ficam em `./data` (ignorado pelo git).

## Gerar o instalador do Windows

Em Linux, com `makensis`, `python3` e `zip`, e o `node.exe` (win-x64) baixado de nodejs.org:

```bash
npm install --omit=dev
installer/windows/build-windows.sh /caminho/node.exe dist
```

Gera `Codeniac-Setup-<versão>.exe`, `Codeniac-Instalador-<versão>.zip` e `Codeniac-Portatil-<versão>.zip`.

## Estrutura

```
server/             API (Express), banco JSON, agendador, backup, assistente
public/             interface (HTML, CSS, JS sem build), fontes e imagens
installer/windows/  instalador NSIS, lançadores VBS e script de build
```

Os dados do usuário instalado ficam em `%APPDATA%\Codeniac` e não fazem parte do repositório.
