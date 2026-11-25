declare module 'cubejs' {
  class Cube {
    constructor(other?: Cube);
    static fromString(str: string): Cube;
    static initSolver(): void;
    static random(): Cube;
    static inverse(alg: string): string;
    asString(): string;
    move(alg: string): this;
    isSolved(): boolean;
    solve(maxDepth?: number): string;
  }
  export = Cube;
}
