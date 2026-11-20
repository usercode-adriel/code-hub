// PORTAS DOS VEÍCULOS — os modelos com porta (polícia, ambulância, bombeiros) têm três quadros: porta fechada,
// meio aberta e aberta. O quadro é trocado conforme o estado da porta (0 fechada, 1 aberta); nada é desenhado por código.
export const MODELOS_COM_PORTA = new Set(['city-policia', 'city-ambulancia', 'city-bombeiros']);

// estado da porta (0..1) → quadro: 0 fechada, 1 meio aberta, 2 aberta
export function quadroDaPorta(porta) { return porta >= 0.66 ? 2 : porta >= 0.33 ? 1 : 0; }

// chave da imagem do veículo para o estado da porta
export function chaveDoCarro(sprite, porta = 0) {
  const base = `cars/${sprite}`;
  if (!MODELOS_COM_PORTA.has(sprite)) return base;
  const q = quadroDaPorta(porta);
  return q === 0 ? base : `${base}-p${q}`;
}

// unidade de emergência: a porta abre quando a equipe está atendendo e fecha antes de voltar
export const portaAlvo = (o) => (o.job?.phase === 'atendendo' ? 1 : 0);

// avança a porta em direção ao alvo (velocidade em fração por segundo)
export function avancaPorta(o, dt, velocidade = 2.5) {
  const alvo = portaAlvo(o); const atual = o.door || 0; const falta = alvo - atual;
  o.door = Math.abs(falta) < 0.01 ? alvo : atual + Math.sign(falta) * Math.min(Math.abs(falta), velocidade * dt);
  return o.door;
}
