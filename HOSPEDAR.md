# Codeniac na nuvem (acesso de qualquer lugar, sem depender do PC)

Hoje o Codeniac roda no seu computador. Para usar de qualquer lugar com os **mesmos dados** (PC, celular, outro computador) sem deixar o PC ligado, ele precisa rodar num **servidor sempre ligado**. O projeto já está pronto para isso (arquivo `Dockerfile`).

## O que muda
- O "login" passa a ser de verdade: você entra pelo endereço do servidor em qualquer aparelho e vê tudo igual.
- O backup, o Telegram, as mensagens automáticas e as notificações continuam funcionando, porque o servidor fica ligado 24 h.
- O PC deixa de ser necessário.

## Opções
| Opção | Custo | Observações |
|---|---|---|
| **Oracle Cloud – Always Free** | grátis | Máquina virtual gratuita para sempre; o cadastro pede cartão (não cobra). Exige mais passos técnicos. |
| **Mini PC / notebook velho em casa** | só energia | Fica ligado o tempo todo; acesso de fora pelo Tailscale. |
| **Fly.io / Railway / Render** | ~US$ 5/mês | Mais simples; precisa de disco persistente (volume) para os dados. Planos grátis desses serviços costumam apagar dados ou "dormir". |

## Passo a passo (servidor com Docker)
1. Crie a máquina (ex.: Ubuntu na Oracle Cloud) e instale o Docker.
2. Baixe o código: `git clone https://github.com/usercode-adriel/code-hub && cd code-hub`
3. Rode:
   ```
   docker build -t codeniac .
   docker run -d --restart unless-stopped -p 3000:3000 -v codeniac-dados:/data --name codeniac codeniac
   ```
4. **Segurança (obrigatório):** não deixe a porta 3000 aberta para a internet sem HTTPS. O mais simples é instalar o **Tailscale** no servidor e usar `tailscale serve --bg 3000` — só os seus aparelhos acessam, com HTTPS.
5. Entre com o login padrão, **troque a senha na hora** e, em Configurações → Administração → Backup, restaure o backup do seu PC para levar seus dados.
6. Cole a chave do Gemini e o token do Telegram de novo (eles não vão no backup, por segurança).

## Variáveis úteis
- `DATA_DIR` – pasta dos dados (no Docker: `/data`).
- `PORT` – porta (padrão 3000).
- `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN` – podem ir num arquivo `.env` dentro da pasta de dados.
