// `node-windows` no publica tipos. Solo se usa en installWindowsService.ts
// (Windows-only, import dinámico) — declaración mínima para que
// `tsc --noEmit` no truene en el resto de plataformas.
declare module 'node-windows' {
  export class Service {
    constructor(options: Record<string, unknown>)
    on(event: string, callback: () => void): void
    install(): void
  }
}
