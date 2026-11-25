// DESFAZER / REFAZER por instantâneos. Guarda cópias serializadas do estado (limite configurável); estados iguais não duplicam.
export class Historico<T> {
  private pilha: string[] = [];
  private pos = -1;
  constructor(inicial: T, private readonly limite = 100) { this.pilha = [JSON.stringify(inicial)]; this.pos = 0; }

  /** Registra o novo estado (descarta o "refazer" que existia adiante). Devolve true se houve mudança. */
  registrar(estado: T): boolean {
    const s = JSON.stringify(estado);
    if (s === this.pilha[this.pos]) return false;
    this.pilha = this.pilha.slice(0, this.pos + 1); this.pilha.push(s);
    if (this.pilha.length > this.limite) this.pilha.shift();
    this.pos = this.pilha.length - 1;
    return true;
  }
  get podeDesfazer(): boolean { return this.pos > 0; }
  get podeRefazer(): boolean { return this.pos < this.pilha.length - 1; }
  desfazer(): T | null { if (!this.podeDesfazer) return null; this.pos--; return JSON.parse(this.pilha[this.pos]) as T; }
  refazer(): T | null { if (!this.podeRefazer) return null; this.pos++; return JSON.parse(this.pilha[this.pos]) as T; }
  get tamanho(): number { return this.pilha.length; }
}
