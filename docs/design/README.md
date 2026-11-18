# Mapa vivo — layout aprovado

`mapa-vivo.png` é a referência visual aprovada pelo dono do projeto. `mapa-vivo.html` é o conceito
que gerou a imagem (precisa do servidor rodando para carregar o mapa real).

Regra: a tela do Mapa deve seguir este layout. Mudanças nela não podem remover ou deslocar:

- mapa ocupando a tela toda;
- cidadãos como marcadores com nome, cor e rastro de movimento;
- a rota do jogador (linha tracejada roxa, marcador "EU" com etiqueta de tempo e destino pulsando);
- relógio com controle de velocidade (pausa, 1x, 4x, 16x) no canto superior esquerdo;
- "Online agora" no canto superior direito;
- painel "Deslocamento" (destino, distância, chegada, a pé/ônibus/táxi) no canto inferior esquerdo;
- feed "Ao vivo na cidade" no canto inferior direito.

Os cidadãos e o feed da imagem são ilustrativos; a versão real usa posições e eventos da simulação.

## Estado atual (2.4)

`mapa-real-2.4.png` é a tela real do Mapa seguindo este layout: prédios por bairro, casas dos moradores,
cidadãos andando pelas ruas (posição calculada pela rotina de cada um), rota com tempos por meio de transporte
e feed ao vivo. Os botões de velocidade do tempo (pausa, 4x, 16x) aparecem desativados até existir um relógio
próprio da cidade; só o tempo real (1x) está ativo.
