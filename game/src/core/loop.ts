// Loop de passo fixo: a simulação sempre avança em fatias de STEP_MS, independente do FPS da tela.
// A renderização recebe `alpha` (0..1) para interpolar entre o passo anterior e o atual.
export const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 5; // evita a "espiral da morte" depois de uma aba parada

export class FixedLoop {
  private acc = 0;
  constructor(
    private readonly update: (stepSeconds: number) => void,
    private readonly render: (alpha: number) => void,
    private readonly stepMs = STEP_MS,
  ) {}

  /** Avança o relógio em `dtMs`. Devolve quantos passos de simulação rodaram. */
  advance(dtMs: number): number {
    this.acc += Math.min(Math.max(dtMs, 0), this.stepMs * MAX_STEPS_PER_FRAME * 2);
    let steps = 0;
    while (this.acc >= this.stepMs && steps < MAX_STEPS_PER_FRAME) {
      this.update(this.stepMs / 1000);
      this.acc -= this.stepMs;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    this.render(this.acc / this.stepMs);
    return steps;
  }
}
