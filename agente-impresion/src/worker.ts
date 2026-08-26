import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrinterConfig, TrabajoImpresion } from './types.js'
import { imprimirTrabajo } from './printerAdapter.js'
import { log } from './log.js'

/**
 * Version del agente, tal cual la reporta en cada latido. Se compara con
 * lo que Admin muestra para saber si la tienda ya corre el agente nuevo.
 * Subela cuando cambie algo que se note en el papel.
 */
const VERSION_AGENTE = '1.1.0'

export interface EstadoWorker {
  printerId: string
  conectadoRealtime: boolean
  ultimoLatido: string | null
  ultimaImpresion: string | null
  ultimoError: string | null
  trabajosImpresosSesion: number
  trabajosFallidosSesion: number
}

/**
 * Un worker por impresora configurada. La fuente de verdad SIEMPRE es la
 * cola en la base (fn_imprimir_reclamar_trabajos) — Realtime y el poll
 * periódico son solo señales para "ir a revisar ahora"; nunca se imprime
 * nada que no haya sido reclamado formalmente de la cola. Así, si Realtime
 * se cae, el poll de respaldo sigue drenando la cola igual (nunca se
 * depende únicamente de un evento efímero).
 */
export class PrinterWorker {
  private readonly sb: SupabaseClient
  private readonly cfg: PrinterConfig
  private readonly agenteId: string
  private procesando = false
  private detenido = false
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private latidoTimer: ReturnType<typeof setInterval> | null = null

  readonly estado: EstadoWorker

  constructor(sb: SupabaseClient, cfg: PrinterConfig, agenteId: string) {
    this.sb = sb
    this.cfg = cfg
    this.agenteId = agenteId
    this.estado = {
      printerId: cfg.id,
      conectadoRealtime: false,
      ultimoLatido: null,
      ultimaImpresion: null,
      ultimoError: null,
      trabajosImpresosSesion: 0,
      trabajosFallidosSesion: 0,
    }
  }

  iniciar(pollIntervaloMs: number, latidoIntervaloMs: number): void {
    log.info(`Iniciando worker (interface=${this.cfg.interface})`, this.cfg.id)

    // Realtime: se despierta casi al instante cuando fn_encolar_comanda
    // inserta un trabajo nuevo para esta impresora.
    this.sb
      .channel(`impresion-${this.cfg.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trabajos_impresion' },
        () => void this.drenar(),
      )
      .subscribe((status) => {
        this.estado.conectadoRealtime = status === 'SUBSCRIBED'
        log.info(`Realtime: ${status}`, this.cfg.id)
        if (status === 'SUBSCRIBED') void this.drenar()
      })

    // Respaldo: revisa la cola aunque Realtime esté caído o el INSERT haya
    // ocurrido antes de que el canal terminara de suscribirse.
    this.pollTimer = setInterval(() => void this.drenar(), pollIntervaloMs)

    // Latido: refleja "impresora conectada" en Admin aunque no haya
    // trabajos por horas.
    this.latidoTimer = setInterval(() => void this.latido(), latidoIntervaloMs)
    void this.latido()
    void this.drenar()
  }

  detener(): void {
    this.detenido = true
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.latidoTimer) clearInterval(this.latidoTimer)
    void this.sb.removeAllChannels()
  }

  private async latido(): Promise<void> {
    // La version viaja en el latido: desde Admin se ve si la tienda ya
    // corre el agente nuevo, sin tener que mirar una etiqueta impresa.
    const { error } = await this.sb.rpc('fn_imprimir_latido', {
      p_token: this.cfg.token,
      p_version: VERSION_AGENTE,
    })
    if (error) {
      log.error(`Latido falló: ${error.message}`, this.cfg.id)
      this.estado.ultimoError = error.message
      return
    }
    this.estado.ultimoLatido = new Date().toISOString()
  }

  /** Reclama y procesa trabajos pendientes de esta impresora hasta vaciar la cola. */
  private async drenar(): Promise<void> {
    if (this.procesando || this.detenido) return
    this.procesando = true
    try {
      for (;;) {
        const { data, error } = await this.sb.rpc('fn_imprimir_reclamar_trabajos', {
          p_token: this.cfg.token,
          p_agente: this.agenteId,
          p_limite: 5,
        })
        if (error) {
          log.error(`No se pudo reclamar trabajos: ${error.message}`, this.cfg.id)
          this.estado.ultimoError = error.message
          return
        }
        const trabajos = (data ?? []) as TrabajoImpresion[]
        if (trabajos.length === 0) return

        for (const trabajo of trabajos) {
          await this.procesar(trabajo)
        }
      }
    } finally {
      this.procesando = false
    }
  }

  private async procesar(trabajo: TrabajoImpresion): Promise<void> {
    try {
      await imprimirTrabajo(this.cfg, trabajo)
      const { error } = await this.sb.rpc('fn_imprimir_confirmar', {
        p_token: this.cfg.token,
        p_trabajo_id: trabajo.id,
      })
      if (error) throw new Error(`Impresión OK pero no se pudo confirmar: ${error.message}`)
      this.estado.ultimaImpresion = new Date().toISOString()
      this.estado.trabajosImpresosSesion++
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e)
      log.error(`Falló trabajo ${trabajo.id}: ${mensaje}`, this.cfg.id)
      this.estado.ultimoError = mensaje
      this.estado.trabajosFallidosSesion++
      const { error } = await this.sb.rpc('fn_imprimir_fallar', {
        p_token: this.cfg.token,
        p_trabajo_id: trabajo.id,
        p_error: mensaje.slice(0, 500),
      })
      if (error) log.error(`Y además no se pudo registrar el fallo: ${error.message}`, this.cfg.id)
    }
  }
}
