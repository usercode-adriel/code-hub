# Protótipo do cliente em Godot (4.7) (Codeniac)

Mapa top-down da cidade Vicewood, lido da API do Codeniac, com um personagem andando.
O servidor Node continua sendo a fonte da verdade; este cliente só desenha e anda.

## Passos

1. Suba o servidor na pasta do projeto (porta 3000 por padrão):

   ```bash
   npm start
   ```

2. Gere a cidade e copie os sprites para o projeto. Use uma conta do jogo:

   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"SEU_EMAIL","password":"SUA_SENHA"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
   curl -s http://localhost:3000/api/godot/cidade -H "Authorization: Bearer $TOKEN" -o /tmp/cidade.json
   python3 tools/godot/copiar_assets.py /tmp/cidade.json
   ```

3. Abra `godot/project.godot` no Godot 4.7. No Inspector do nó `Mundo`, preencha
   `email` e `senha`, e rode a cena (F5).

Setas ou WASD andam. Prédios bloqueiam o caminho. Perto de um ponto de interesse, o nome aparece no canto.

## O que é protótipo

- Não há trânsito, pedestres nem sistemas de jogo ainda. Só o mapa e o personagem.
- A colisão usa caixas simples por construção.
- O personagem usa a folha de andar já gerada (`policial`). As reações e a corrida não estão ligadas.
- O estilo é 2D top-down. A versão 3D (ou o estilo Chinatown Wars, com volume) é uma decisão posterior.
