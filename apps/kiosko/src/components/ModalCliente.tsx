import React, { useEffect, useRef, useState } from 'react'
import { identificarCliente, registrarCliente } from '@shake/supabase'
import type { ClienteConLealtad } from '@shake/supabase'
import { sb } from '@/lib/sb'
import { mensajeDeError } from '@shake/utils'

/**
 * Identificar al cliente en el kiosko-cajero, para que la compra le sume
 * mancuernas.
 *
 * Sin esto el programa de lealtad no funciona en el canal principal: el
 * trigger `fn_acumular_mancuernas` solo reparte puntos cuando la orden trae
 * `cliente_id`, y en modo cajero nunca se pedía. La gente se daba de alta en
 * Rewards y su tarjeta se quedaba en cero para siempre.
 *
 * Dos formas de identificar, las dos por el mismo campo:
 *   · Código SHK-XXXXXX  — el QR de la app; un lector de códigos lo teclea y
 *     manda Enter, así que funciona sin tocar la pantalla.
 *   · Teléfono           — para quien no trae el celular a la mano.
 *
 * Si no existe, se da de alta en el momento con nombre y teléfono. Ese alta
 * pasa por `fn_cliente_registrar` (SECURITY DEFINER): el saldo lo fija el
 * servidor en 0, nadie llega con mancuernas regaladas.
 */

interface Props {
  onCerrar: () => void
  onElegir: (cliente: ClienteConLealtad) => void
}

type Estado = 'buscar' | 'buscando' | 'encontrado' | 'no_existe' | 'registrando'

/** Diez dígitos, ignorando espacios y guiones: así se ve un móvil en México. */
const esTelefono = (t: string) => /^\d{10}$/.test(t.replace(/[\s-]/g, ''))

export function ModalCliente({ onCerrar, onElegir }: Props) {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<Estado>('buscar')
  const [cliente, setCliente] = useState<ClienteConLealtad | null>(null)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  // El lector de QR es un teclado: si el foco no está en el campo, lo que
  // escanea se pierde. Por eso el campo se enfoca al abrir.
  useEffect(() => { campo.current?.focus() }, [])

  async function buscar() {
    const q = texto.trim()
    if (!q) return
    setEstado('buscando')
    setError('')
    try {
      const encontrado = await identificarCliente(sb, q)
      if (encontrado) {
        setCliente(encontrado)
        setEstado('encontrado')
      } else {
        setEstado('no_existe')
      }
    } catch (e) {
      setError(mensajeDeError(e))
      setEstado('buscar')
    }
  }

  async function darDeAlta() {
    const tel = texto.trim().replace(/[\s-]/g, '')
    if (!nombre.trim()) { setError('Falta el nombre.'); return }
    setEstado('registrando')
    setError('')
    try {
      const nuevo = await registrarCliente(sb, { nombre: nombre.trim(), telefono: tel })
      // Recién creado: cero cupones. No hace falta ir a buscarlos.
      onElegir({ ...nuevo, cupones: [] })
    } catch (e) {
      setError(mensajeDeError(e))
      setEstado('no_existe')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-8">
      <div className="bg-sa-cream-paper w-full sm:max-w-lg rounded-t-sa-lg sm:rounded-sa-lg shadow-sa max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-6 py-5 bg-sa-green-deep text-sa-cream sm:rounded-t-sa-lg">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-sa-banana">
              Rewards
            </p>
            <h2 className="font-display text-2xl leading-none mt-1">¿Quién se lleva las mancuernas?</h2>
          </div>
          <button
            onClick={onCerrar}
            className="w-11 h-11 rounded-full bg-sa-green-ink hover:bg-sa-green flex items-center justify-center text-xl shrink-0"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>

        <div className="p-6 space-y-4">
          {estado === 'encontrado' && cliente ? (
            <>
              <div className="rounded-sa-lg bg-white p-5 shadow-sa-sm text-center">
                <p className="font-display text-3xl text-sa-green-ink leading-tight">{cliente.nombre}</p>
                <p className="font-mono text-sm text-sa-green-ink/50 mt-1">
                  {cliente.telefono ?? cliente.codigo}
                </p>
                <p className="font-display text-5xl text-sa-green mt-4 leading-none">
                  🏋️ {cliente.mancuernas}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/45 mt-1.5">
                  mancuernas acumuladas
                </p>
                {cliente.cupones.length > 0 && (
                  <p className="font-body text-sm text-sa-strawberry mt-3">
                    Tiene {cliente.cupones.length}{' '}
                    {cliente.cupones.length === 1 ? 'cupón activo' : 'cupones activos'} — pregúntale si
                    lo quiere usar (se canjea en el POS).
                  </p>
                )}
              </div>
              <button
                onClick={() => onElegir(cliente)}
                className="w-full bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-2xl active:scale-[0.98] transition-transform"
              >
                Es él / ella
              </button>
              <button
                onClick={() => { setEstado('buscar'); setTexto(''); setCliente(null); campo.current?.focus() }}
                className="w-full py-3 font-mono text-xs uppercase tracking-wide text-sa-green-ink/50"
              >
                Buscar otro
              </button>
            </>
          ) : estado === 'no_existe' || estado === 'registrando' ? (
            <>
              <p className="font-body text-sa-green-ink/70">
                No hay nadie con <b className="font-semibold">{texto.trim()}</b>.
                {esTelefono(texto)
                  ? ' Se puede dar de alta ahora mismo:'
                  : ' Revisa el código, o busca por teléfono.'}
              </p>

              {esTelefono(texto) && (
                <>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void darDeAlta() }}
                    placeholder="Nombre del cliente"
                    autoFocus
                    className="w-full rounded-sa-lg border-2 border-sa-green-ink/15 bg-white px-5 py-4 font-body text-xl focus:border-sa-green outline-none"
                  />
                  <button
                    onClick={() => void darDeAlta()}
                    disabled={estado === 'registrando'}
                    className="w-full bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-2xl active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    {estado === 'registrando' ? 'Dando de alta…' : 'Dar de alta y sumar'}
                  </button>
                </>
              )}

              <button
                onClick={() => { setEstado('buscar'); setError(''); campo.current?.focus() }}
                className="w-full py-3 font-mono text-xs uppercase tracking-wide text-sa-green-ink/50"
              >
                ← Volver a buscar
              </button>
            </>
          ) : (
            <>
              <input
                ref={campo}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }}
                placeholder="Escanea el QR o teclea el teléfono"
                inputMode="text"
                autoComplete="off"
                className="w-full rounded-sa-lg border-2 border-sa-green-ink/15 bg-white px-5 py-4 font-body text-xl focus:border-sa-green outline-none"
              />
              <button
                onClick={() => void buscar()}
                disabled={estado === 'buscando' || !texto.trim()}
                className="w-full bg-sa-green text-sa-cream py-4 rounded-sa-lg font-display text-2xl active:scale-[0.98] transition-transform disabled:opacity-40"
              >
                {estado === 'buscando' ? 'Buscando…' : 'Buscar'}
              </button>
              <p className="font-mono text-[11px] uppercase tracking-wide text-sa-green-ink/40 text-center">
                Sin cliente la venta se cobra igual — solo no suma mancuernas
              </p>
            </>
          )}

          {error && (
            <p className="font-mono text-sm text-sa-strawberry text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
