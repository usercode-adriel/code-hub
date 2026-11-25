// CATÁLOGO DE JOGOS do Gamecode. Cada jogo criado vira uma linha aqui e aparece no painel e na Store.
// src: caminho do jogo compilado (servido pelo próprio Codeniac). capa: imagem do cartão. cores: degradê quando não há capa.
export const JOGOS = [
  {
    id: 'codeniac-open-world',
    titulo: 'Codeniac Open World',
    versao: 'V0.1 Foundation',
    genero: 'Open world · Pixel art HD',
    descricao: 'Mundo por setores em pixel art HD, vista de cima. Ande com WASD ou setas, Shift corre, +/− muda o zoom.',
    src: '/jogo/',
    capa: '/gamecode/capa-open-world.png',
    cores: ['#14532d', '#22c55e'],
  },
];

// O que está planejado para o jogo (vem do roadmap do projeto: docs/jogo/decisoes.md). Aparece na Store como "em desenvolvimento".
export const ROADMAP = [
  { versao: 'V0.2', titulo: 'Saves e persistência', texto: 'Progresso guardado no navegador, com migração de versões.' },
  { versao: 'V0.3', titulo: 'Veículos e tráfego', texto: 'Carros, ruas com trânsito e colisões.' },
  { versao: 'V0.4', titulo: 'NPCs e caminhos', texto: 'Pessoas na cidade com rotinas e pathfinding.' },
  { versao: 'V0.5', titulo: 'Leis e polícia', texto: 'Crimes, procurados e consequências.' },
  { versao: 'V0.6', titulo: 'RPG', texto: 'Atributos, inventário e missões.' },
];
