// 8 direções, na ordem das linhas do sprite: 0=S 1=SO 2=O 3=NO 4=N 5=NE 6=L 7=SE
export const DIR_NAMES = ['S', 'SO', 'O', 'NO', 'N', 'NE', 'L', 'SE'] as const;

export function directionOf(vx: number, vy: number, fallback = 0): number {
  if (vx === 0 && vy === 0) return fallback;
  // ângulo com 0 = sul (y para baixo), crescendo em sentido horário na tela: S, SO, O, NO, N, NE, L, SE
  const ang = Math.atan2(-vx, vy);
  const norm = (ang + Math.PI * 2) % (Math.PI * 2);
  return Math.round(norm / (Math.PI / 4)) % 8;
}
