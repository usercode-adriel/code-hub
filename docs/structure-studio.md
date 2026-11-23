# Structure Studio

Editor modular de edifícios, vias e estacionamentos, dentro do Game Development Studio (`#/studio`). Três modos: montar à mão,
pedir à IA, ou os dois (a IA monta e cada peça continua editável).

## Fluxo

1. **Biblioteca** de componentes (`#/studio` → editor → painel esquerdo): existentes, importados (PNG) e gerados por IA.
2. **Montagem** na área de construção: encaixe na grade (8 unidades) e em anfitriões (janela/porta na parede, telhado no topo,
   equipamento sobre o telhado), camadas, grupos, alinhar, desfazer/refazer. A aba *Verificar* acusa peça flutuando,
   atravessando, fora da área ou sem componente.
3. **IA** (aba ✨ IA): a descrição vira um *plano* (nunca pixels); um expansor determinístico monta as peças. Edições por
   instrução viram operações aplicadas só ao que o pedido afeta. Tudo passa por uma **prévia** com Aceitar/Descartar.
4. **Gerar** (painel esquerdo): imagem por OpenRouter com referências (perspectiva, material, estilo, composição). O resultado
   vai para a fila de pendentes; o fundo é removido no navegador e só o aprovado entra na biblioteca.
5. **Prefab** ("Salvar como prefab"): a estrutura vira uma imagem PNG + lógica (pegada, colisões, entradas, vagas...). O
   servidor recalcula tudo da estrutura salva; o navegador só envia a imagem.
6. **Map Editor**: o prefab aparece na aba *Estruturas* como peça agrupada. *Editar no Studio* reabre a estrutura; salvar o
   prefab de novo atualiza todos os mapas que o usam. No jogo entra como edifício, com colisão, ponto de interesse na
   entrada e vagas que recebem carros.

## Código

| Parte | Onde |
|---|---|
| Presets, categorias, camadas, regras de encaixe | `public/js/estudio/presets.js` |
| Montagem (encaixe, grupos, alinhar, diagnóstico) | `public/js/estudio/montagem.js` |
| Prefab (limites, pegada, colisões, entradas, lógica derivada) | `public/js/estudio/prefab.js` |
| IA: plano, expansor, interpretador local, operações | `public/js/estudio/ia-montagem.js` |
| Gerador: prompt, capacidades do modelo, fundo e recorte | `public/js/estudio/gerador.js` |
| Interface | `public/js/views/studio.js`, `public/js/estudio/{editor,biblioteca,gerador-ui}.js` |
| Servidor | `server/estudio*.js` (dados, biblioteca, prefabs, IA, gerador) |
| Mapa e jogo | `server/mapas.js` (inventário por usuário), `public/js/mapas/mundo-do-mapa.js` |
| Kit inicial (existentes) | `tools/estudio/componentes.py` |

Dados por usuário em `DATA_DIR`: `estudio/<uid>/{estruturas,prefabs}/`, `componentes.json`, `pendentes.json` e imagens em
`estudio-arquivos/<uid>/` (um arquivo por hash: nunca duplica).

## Limites conhecidos

- **Kit modular:** a biblioteca traz só os assets que já existiam (árvores, objetos, construções prontas). Paredes, janelas,
  portas e telhados no padrão das referências precisam ser gerados (painel Gerar) ou importados.
- **Não é 3D de verdade:** o motor desenha sprites. "Z" é altura de empilhamento; a profundidade vem da arte pré-renderizada.
  Não há rotação de câmera. Em peças arquitetônicas, girar quebra a perspectiva (o Studio avisa; use o espelho).
- **No jogo** o prefab não gira nem espelha. A exportação para o Godot ignora prefabs.
- **Lógica preparada, não usada ainda:** áreas caminháveis, circulação de veículos, escadas e rampas ficam guardadas no prefab
  (`logica.derivada`) para as simulações futuras. Hoje o jogo usa colisões, entradas e vagas.
- **OpenRouter:** o gerador foi testado com um servidor falso. As capacidades dos modelos vêm do que o OpenRouter declara;
  várias referências e transparência não são declaradas e são tratadas como desconhecidas (o fundo é removido no navegador).
- **IA de texto:** usa o provedor já configurado (Gemini, Groq ou OpenRouter); sem ele, um interpretador local entende
  frases simples e a tela avisa o modo usado.
