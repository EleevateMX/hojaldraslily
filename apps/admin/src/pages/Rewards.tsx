import { useEffect, useState } from 'react'
import { rewardsAdmin, generarTarjetas, type RewardsAdmin, type TarjetaGenerada } from '@shake/supabase'
import { mensajeDeError, mxn } from '@shake/utils'
import { sb } from '../lib/sb'
import { PageHeader, Loading, ErrorMsg, cx } from '../ui'

/**
 * Rewards visto desde gerencia.
 *
 * El número que manda es el **saldo en la calle**: las mancuernas
 * compradas son dinero que ya entró a la caja pero que todavía se debe en
 * producto. Es un pasivo, y por eso se muestra aparte de las ganadas, que
 * son promoción y no le deben nada a nadie. Sumarlas en un solo total
 * escondería justo el dato que le importa al negocio.
 */
export default function Rewards() {
  const [dx, setDx] = useState<RewardsAdmin | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    try {
      setDx(await rewardsAdmin(sb))
      setError(null)
    } catch (e) {
      setError(mensajeDeError(e))
    }
  }
  useEffect(() => { void cargar() }, [])

  if (!dx && !error) return <Loading>Contando mancuernas…</Loading>

  return (
    <div>
      <PageHeader
        title="Rewards"
        subtitle="Saldo en la calle, tarjetas de regalo y movimientos"
        action={<button className={cx.btnPrimary} onClick={() => void cargar()}>Actualizar</button>}
      />
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {dx && (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Tarjeta
              titulo="Saldo comprado en la calle"
              dato={mxn(dx.en_la_calle.compradas_pesos)}
              pie={`${dx.en_la_calle.compradas.toLocaleString('es-MX')} mancuernas · ${dx.en_la_calle.clientes_con_saldo} clientes`}
              nota="Dinero que ya cobraste y debes en producto."
              alerta
            />
            <Tarjeta
              titulo="Mancuernas ganadas"
              dato={mxn(dx.en_la_calle.ganadas_pesos)}
              pie={`${dx.en_la_calle.ganadas.toLocaleString('es-MX')} mancuernas`}
              nota="Promoción. No le debes dinero a nadie por esto."
            />
            <Tarjeta
              titulo="Tarjetas de sellos llenas"
              dato={String(dx.sellos.bebida_listas + dx.sellos.alimento_listas)}
              pie={`${dx.sellos.bebida_listas} de bebidas · ${dx.sellos.alimento_listas} de comida`}
              nota={`${dx.sellos.con_sellos} clientes juntando.`}
            />
          </div>

          <GenerarLote alGenerar={() => void cargar()} />

          {dx.tarjetas.length > 0 && (
            <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5 mb-6">
              <h2 className="font-display text-xl text-sa-green-ink mb-1">Lotes de tarjetas</h2>
              <p className="text-xs text-sa-green-ink/55 mb-3">
                Una tarjeta impresa no vale nada hasta que alguien la canjea: nace en
                <b> nueva</b> y solo entonces se vuelve saldo.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">
                      <th className="py-2">Lote</th><th>Valor</th><th>Total</th>
                      <th>Sin usar</th><th>Canjeadas</th><th className="text-right">Por canjear</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sa-green-ink/10">
                    {dx.tarjetas.map((t) => (
                      <tr key={t.lote + t.mancuernas}>
                        <td className="py-2 font-mono text-xs">{t.lote}</td>
                        <td className="font-mono text-xs">{t.mancuernas.toLocaleString('es-MX')}</td>
                        <td>{t.total}</td>
                        <td>{t.nuevas}</td>
                        <td>{t.canjeadas}</td>
                        <td className="text-right font-mono">{mxn(t.pendiente_pesos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {dx.ultimos_movimientos.length > 0 && (
            <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5">
              <h2 className="font-display text-xl text-sa-green-ink mb-3">Últimos movimientos de saldo</h2>
              <div className="divide-y divide-sa-green-ink/10">
                {dx.ultimos_movimientos.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{m.cliente}</p>
                      <p className="font-mono text-[11px] text-sa-green-ink/50">
                        {m.descripcion ?? m.tipo} · {m.cuando}
                      </p>
                    </div>
                    <span className={`font-mono text-sm shrink-0 ${m.mancuernas > 0 ? 'text-sa-green' : 'text-sa-strawberry'}`}>
                      {m.mancuernas > 0 ? '+' : ''}{m.mancuernas.toLocaleString('es-MX')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function Tarjeta({
  titulo, dato, pie, nota, alerta,
}: { titulo: string; dato: string; pie: string; nota: string; alerta?: boolean }) {
  return (
    <div className={`rounded-sa-lg border p-5 ${alerta ? 'bg-sa-banana/15 border-sa-banana/50' : 'bg-white border-sa-green-ink/10'}`}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50">{titulo}</p>
      <p className="font-display text-3xl text-sa-green-ink leading-none mt-1">{dato}</p>
      <p className="font-mono text-[11px] text-sa-green-ink/55 mt-1.5">{pie}</p>
      <p className="text-[12px] text-sa-green-ink/65 mt-2 leading-snug">{nota}</p>
    </div>
  )
}

const VALORES = [
  { mancuernas: 2200, etiqueta: '$200 → 2,200' },
  { mancuernas: 5750, etiqueta: '$500 → 5,750' },
  { mancuernas: 12000, etiqueta: '$1,000 → 12,000' },
]

function GenerarLote({ alGenerar }: { alGenerar: () => void }) {
  const [cantidad, setCantidad] = useState('25')
  const [valor, setValor] = useState(2200)
  const [lote, setLote] = useState('')
  const [generando, setGenerando] = useState(false)
  const [salida, setSalida] = useState<TarjetaGenerada[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generar() {
    const n = Number(cantidad) || 0
    if (n < 1 || n > 500) { setError('Entre 1 y 500 por lote.'); return }
    if (!lote.trim()) { setError('Ponle nombre al lote para poder rastrearlo después.'); return }
    if (!confirm(`¿Generar ${n} tarjetas de ${valor.toLocaleString('es-MX')} mancuernas?`)) return
    setGenerando(true); setError(null)
    try {
      setSalida(await generarTarjetas(sb, n, valor, lote.trim()))
      alGenerar()
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setGenerando(false)
    }
  }

  return (
    <section className="rounded-sa-lg border border-sa-green-ink/10 bg-white p-5 mb-6">
      <h2 className="font-display text-xl text-sa-green-ink mb-1">Generar tarjetas de regalo</h2>
      <p className="text-xs text-sa-green-ink/55 mb-4">
        Los códigos no son secuenciales a propósito: con lotes numerados, quien compra
        una tarjeta podría adivinar las de al lado.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mb-1">Cuántas</span>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))}
                 inputMode="numeric"
                 className="w-24 rounded-sa border border-sa-green-ink/15 px-3 py-2 font-mono" />
        </label>
        <label className="block">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mb-1">Valor</span>
          <select value={valor} onChange={(e) => setValor(Number(e.target.value))}
                  className="rounded-sa border border-sa-green-ink/15 px-3 py-2 text-sm">
            {VALORES.map((v) => <option key={v.mancuernas} value={v.mancuernas}>{v.etiqueta}</option>)}
          </select>
        </label>
        <label className="block flex-1 min-w-[180px]">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-sa-green-ink/50 mb-1">Lote</span>
          <input value={lote} onChange={(e) => setLote(e.target.value.toUpperCase())}
                 placeholder="NAVIDAD-2026"
                 className="w-full rounded-sa border border-sa-green-ink/15 px-3 py-2 font-mono uppercase" />
        </label>
        <button className={cx.btnPrimary} onClick={() => void generar()} disabled={generando}>
          {generando ? 'Generando…' : 'Generar'}
        </button>
      </div>

      {error && <p className="text-sa-strawberry text-sm mt-3">{error}</p>}

      {salida && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm text-sa-green-ink/80">
              <b>{salida.length} tarjetas generadas.</b> Cópialas y mándalas a imprimir —
              esta lista no se vuelve a mostrar.
            </p>
            <button
              className={cx.btnSec}
              onClick={() => void navigator.clipboard.writeText(salida.map((t) => t.codigo).join('\n'))}
            >
              Copiar códigos
            </button>
          </div>
          <textarea
            readOnly
            value={salida.map((t) => t.codigo).join('\n')}
            rows={Math.min(12, salida.length)}
            className="w-full rounded-sa border border-sa-green-ink/15 p-3 font-mono text-xs bg-sa-cream-paper"
          />
        </div>
      )}
    </section>
  )
}
