# Codeniac 1.4

Hub pessoal de projetos, rotina, InDrive, finanças e estudos. Roda no seu computador (Windows), com dados guardados localmente.

## Abas principais

- **Hoje**: briefing automático da manhã, agenda, prioridades, detector de procrastinação, hábitos, pomodoro, caixa de entrada e encerramento do dia.
- **Garagem**: turno do InDrive (valor por hora, manhã × tarde × noite), "vale a pena essa corrida?", custo por km, mapa de melhores horários, abastecimentos, manutenção, documentos e reservas.
- **Financeiro**: lançamentos, importação de extrato CSV, orçamento por categoria, contas a pagar e assinaturas.
- **Estudos**: flashcards de inglês com repetição espaçada, connected speech, shadowing, pares mínimos, ditado, diário em inglês, banco de vocabulário, snippets, trilha de programação e estante de livros.
- **Diário** (estilo caderno de viagem do velho oeste), **Decisões** (passo a passo com critérios e pesos) e **Atividade** (feed automático).
- **Projetos** com páginas estilo Notion e o controle financeiro do InDrive.
- **Assistente** estilo Telegram, sem IA por padrão ou com o Gemini (Google, grátis), com comandos: `/gasto 50 gasolina`, `/corrida 35 12km`, `/tarefa Estudar SQL`, `/nota`, `/agenda`, `/briefing`, `/ajuda`.
- 15 temas, painel de administração, backup automático diário e acesso pelo celular (Wi-Fi ou Tailscale).

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
