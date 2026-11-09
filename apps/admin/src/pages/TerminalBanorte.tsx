import { useEffect, useState } from 'react'
import { sb } from '../lib/sb'
import {
  listarTerminales, registrarTerminal, rotarTokenTerminal, activarTerminal,
  listarAlmacenes, type TerminalRegistrada,
} from '@lily/supabase'
import { Panel, Field, cx, ErrorMsg, OkMsg, Chip } from '../ui'
import { mensajeDeError, fechaHoraEnMerida } from '@lily/utils'

/**
 * La TERMINAL de Banorte (cobro con tarjeta por el agente DLL de la PC).
 *
 * El agente de la PC reclama los cobros de la caja por su TOKEN; esta pantalla
 * lo da de alta y entrega el token UNA vez, para pegarlo en el `.env` del
 * agente. Igual que las impresoras: el token es su única identidad.
 *
 * Lo que NO sale de aquí a propósito: las credenciales de Payworks
 * (`PAYWORKS_PASSWORD`) y la IP de la pinpad. Eso vive SOLO en la PC de la
 * tienda; esta pantalla solo entrega la parte de la nube (URL, llave
 * publicable y token).
 */
const SUPA_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://TU-PROYECTO.supabase.co'
const SUPA_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '(tu llave publicable)'

function bloqueEnv(token: string): string {
  return [
    '# --- Parte de la nube (la entrega Admin) ---',
    `SUPABASE_URL=${SUPA_URL}`,
    `SUPABASE_ANON_KEY=${SUPA_ANON}`,
    `TERMINAL_TOKEN=${token}`,
    '',
    '# --- Parte de la pinpad (se llena en la PC, NO sale de aquí) ---',
    '# PAYWORKS_USER=Terminal',
    '# PAYWORKS_PASSWORD=...        (vive solo en esta PC)',
    '# PINPAD_IP=192.168.0.50',
    '# PAYWORKS_MODE=AUT            (AUT prueba; PRD cobra de verdad)',
    '',
    '# Arranca el agente con:  node index.mjs cola',
  ].join('\n')
}

export function SeccionTerminal() {
  const [sucursalId, setSucursalId] = useState<string | null>(null)
  const [terminales, setTerminales] = useState<TerminalRegistrada[]>([])
  const [cargando, setCargando] = useState(true)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  async function recargar() {
    try {
      const [almacenes, terms] = await Promise.all([listarAlmacenes(sb), listarTerminales(sb)])
      setSucursalId(almacenes[0]?.sucursal_id ?? null)
      setTerminales(terms)
    } catch (e) {
      setMsg({ error: mensajeDeError(e) })
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { void recargar() }, [])

  async function conectar() {
    if (!sucursalId) { setMsg({ error: 'No hay sucursal configurada todavía.' }); return }
    if (terminales.some((t) => t.activa) &&
        !confirm('Ya hay una terminal activa. Conectar otra desactiva la anterior y su token deja de servir. ¿Seguir?')) return
    setTrabajando(true); setMsg({})
    try {
      const { agente_token } = await registrarTerminal(sb, sucursalId, 'Banorte')
      setTokenNuevo(agente_token)
      setMsg({ ok: 'Terminal conectada. Copia el bloque de abajo al .env del agente de la PC.' })
      await recargar()
    } catch (e) {
      setMsg({ error: mensajeDeError(e) })
    } finally {
      setTrabajando(false)
    }
  }

  async function rotar(id: string) {
    if (!confirm('El token de ahora dejará de servir y el agente de la PC hay que reconfigurarlo con el nuevo. ¿Seguir?')) return
    setTrabajando(true); setMsg({})
    try {
      const token = await rotarTokenTerminal(sb, id)
      setTokenNuevo(token)
      setMsg({ ok: 'Token nuevo. Pégalo en el .env del agente y reinícialo.' })
    } catch (e) {
      setMsg({ error: mensajeDeError(e) })
    } finally {
      setTrabajando(false)
    }
  }

  async function alternar(t: TerminalRegistrada) {
    setTrabajando(true); setMsg({})
    try {
      await activarTerminal(sb, t.id, !t.activa)
      await recargar()
    } catch (e) {
      setMsg({ error: mensajeDeError(e) })
    } finally {
      setTrabajando(false)
    }
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setMsg({ ok: 'Copiado.' }) } catch { /* sin portapapeles */ }
  }

  return (
    <Panel title="Terminal de Banorte (cobro con tarjeta)" className="mb-8">
      <p className={`text-sm mb-4 ${cx.muted}`}>
        La caja cobra con tarjeta por el <b>agente de la PC</b> (el DLL certificado de Banorte). Aquí se
        conecta esa PC: se le da un <b>token</b> y se pega en su <code>.env</code>. Si no hay terminal
        conectada, la caja cobra la tarjeta <b>a mano en la pinpad</b>, como hasta hoy.
      </p>
      {msg.error && <ErrorMsg>{msg.error}</ErrorMsg>}
      {msg.ok && <OkMsg>{msg.ok}</OkMsg>}

      {cargando ? (
        <p className={cx.muted}>Cargando…</p>
      ) : (
        <>
          {terminales.length === 0 ? (
            <p className={`text-sm mb-4 ${cx.muted}`}>Todavía no hay ninguna terminal conectada.</p>
          ) : (
            <div className="overflow-x-auto mb-4">
              <table className={cx.table}>
                <thead>
                  <tr className={cx.thead}>
                    <th className={cx.th}>Terminal</th>
                    <th className={cx.th}>Estado</th>
                    <th className={cx.th}>Modo</th>
                    <th className={cx.th}>Agente</th>
                    <th className={cx.th}>Último latido</th>
                    <th className={cx.thNum}>Acciones</th>
                  </tr>
                </thead>
                <tbody className={cx.tbody}>
                  {terminales.map((t) => (
                    <tr key={t.id} className={cx.tr}>
                      <td className={cx.td}>{t.nombre}</td>
                      <td className={cx.td}>
                        {!t.activa
                          ? <Chip tone="neutral">Apagada</Chip>
                          : t.conectada
                            ? <Chip tone="si">Conectada</Chip>
                            : <Chip tone="no">Sin latido</Chip>}
                      </td>
                      <td className={cx.td}>
                        {t.modo
                          ? <Chip tone={t.modo === 'PRD' ? 'si' : 'no'}>{t.modo === 'PRD' ? 'Cobra (PRD)' : `Prueba (${t.modo})`}</Chip>
                          : <span className={cx.muted}>—</span>}
                      </td>
                      <td className={cx.td}>{t.agente_version ?? <span className={cx.muted}>—</span>}</td>
                      <td className={cx.td}>{t.ultima_conexion ? fechaHoraEnMerida(t.ultima_conexion) : <span className={cx.muted}>nunca</span>}</td>
                      <td className={cx.tdNum}>
                        <button className={cx.btnSec} disabled={trabajando} onClick={() => void alternar(t)}>
                          {t.activa ? 'Apagar' : 'Encender'}
                        </button>
                        <button className={`${cx.btnSec} ml-2`} disabled={trabajando} onClick={() => void rotar(t.id)}>
                          Rotar token
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className={cx.btnPrimary} disabled={trabajando} onClick={() => void conectar()}>
            Conectar la terminal de la PC
          </button>

          {tokenNuevo && (
            <Field label="Pega esto en el .env del agente de la PC (se muestra una sola vez)">
              <textarea
                readOnly
                className={`${cx.input} font-mono text-xs min-h-[180px]`}
                value={bloqueEnv(tokenNuevo)}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className={`${cx.btnSec} mt-2`} onClick={() => void copiar(bloqueEnv(tokenNuevo))}>
                Copiar
              </button>
            </Field>
          )}
        </>
      )}
    </Panel>
  )
}
