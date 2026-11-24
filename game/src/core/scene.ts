// Cena: uma "tela" do jogo (mundo, menu...). O Game Core guarda uma pilha de cenas; só a do topo roda.
export interface Scene {
  enter(): void | Promise<void>;
  update(stepSeconds: number): void;
  render(alpha: number): void;
  exit(): void;
}

export class SceneStack {
  private stack: Scene[] = [];
  get top(): Scene | undefined { return this.stack[this.stack.length - 1]; }
  get size(): number { return this.stack.length; }
  async push(scene: Scene): Promise<void> { this.stack.push(scene); await scene.enter(); }
  pop(): void { this.stack.pop()?.exit(); }
  async replace(scene: Scene): Promise<void> { this.pop(); await this.push(scene); }
}
