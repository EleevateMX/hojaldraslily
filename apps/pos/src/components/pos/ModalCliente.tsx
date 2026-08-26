import React, { useState } from 'react'
import { usePosStore } from '@/store/posStore'
import { sb } from '../../lib/sb'
import { identificarCliente, registrarCliente, promosParaCliente } from '@shake/supabase'
import type { ClienteConLealtad } from '@shake/supabase'
import type { Promocion } from '@shake/types'
import { mensajeDeError } from '@shake/utils'

interface Props {
  open: boolean
  onClose: () => void
  onCliente: (cliente: ClienteConLealtad, promos: Promocion[]) => void
  onQuitar: () => void
}

export function ModalCliente({ open, onClose, onCliente, onQuitar }: Props) {
  const clienteActivo = usePosStore((s) => s.cliente)
  const [busqueda, setBusqueda] = useState('')
  const [encontrado, setEncontrado] = useState<ClienteConLealtad | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  // Alta de cliente nuevo desde caja
  const [modoAlta, setModoAlta] = useState(false)
  const [altaNombre, setAltaNombre] = useState('')
  const [altaTelefono, setAltaTelefono] = useState('')
  const [registrando, setRegistrando] = useState(false)

  if (!open) return null

  async function buscar() {
    setMsg(null)
    setEncontrado(null)
    setBuscando(true)
    try {
      const c = await identificarCliente(sb, busqueda)
      if (!c) setMsg('Cliente no encontrado. Puedes darlo de alta aquí mismo.')
      else setEncontrado(c)
    } catch (e) {
      setMsg(mensajeDeError(e))
    } finally {
      setBuscando(false)
    }
  }

  async function darDeAlta() {
    const nombre = altaNombre.trim()
    const telefono = altaTelefono.trim()
    if (!nombre || telefono.length < 10 || registrando) return
    setMsg(null)
    setRegistrando(true)
    try {
      // Si el teléfono ya existe, mejor seleccionarlo que duplicarlo.
      const existente = await identificarCliente(sb, telefono)
      if (existente) {
        setMsg('Ese teléfono ya está registrado — se seleccionó el cliente existente.')
        await seleccionar(existente)
        return
      }
      const c = await registrarCliente(sb, { nombre, telefono })
      await seleccionar({ ...c, cupones: [] })
    } catch (e) {
      setMsg(mensajeDeError(e))
    } finally {
      setRegistrando(false)
    }
  }

  async function seleccionar(c: ClienteConLealtad) {
    const promos = await promosParaCliente(sb, c.id).catch(() => [])
    onCliente(c, promos)
    setBusqueda('')
    setEncontrado(null)
    setMsg(null)
    setModoAlta(false)
    setAltaNombre('')
    setAltaTelefono('')
    onClose()
  }

  function quitar() {
    onQuitar()
    setBusqueda('')
    setEncontrado(null)
    setMsg(null)
    setModoAlta(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-sa-green-deep/60" onClick={onClose} />
      <div className="relative bg-sa-cream-soft rounded-sa-lg shadow-sa w-full max-w-sm">
        <div className="px-5 py-4 border-b border-sa-green-ink/10 flex items-center justify-between">
          <h3 className="font-display text-2xl text-sa-green-ink">Identificar cliente</h3>
          {clienteActivo && (
            <button
              onClick={quitar}
              className="font-mono text-xs uppercase tracking-wide text-sa-strawberry hover:brightness-110"
            >
              Quitar
            </button>
          )}
        </div>

        <div className="p-4">
          {!modoAlta ? (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }}
                  placeholder="Teléfono o QR (SHK-…)"
                  className="flex-1 px-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-body text-sm text-sa-green-ink placeholder:font-mono placeholder:text-sa-green-ink/40 focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                  autoFocus
                />
                <button
                  onClick={() => void buscar()}
                  disabled={buscando || !busqueda.trim()}
                  className="px-4 py-2 bg-sa-green disabled:opacity-40 text-sa-cream rounded-sa font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
                >
                  {buscando ? '…' : 'Buscar'}
                </button>
              </div>
              {msg && <p className="font-mono text-xs text-sa-strawberry mt-2">{msg}</p>}
              <button
                onClick={() => {
                  setModoAlta(true)
                  setMsg(null)
                  // Si buscaron por teléfono y no existía, precargarlo al alta.
                  if (/^\d{10}$/.test(busqueda.trim())) setAltaTelefono(busqueda.trim())
                }}
                className="w-full mt-3 border border-dashed border-sa-green/40 text-sa-green py-2.5 rounded-sa font-mono text-xs uppercase tracking-wide hover:bg-sa-green/5"
              >
                ➕ Nuevo cliente
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                value={altaNombre}
                onChange={(e) => setAltaNombre(e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full px-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-body text-sm text-sa-green-ink placeholder:font-mono placeholder:text-sa-green-ink/40 focus:outline-none focus:ring-2 focus:ring-sa-green/30"
                autoFocus
              />
              <input
                type="tel"
                inputMode="numeric"
                value={altaTelefono}
                onChange={(e) => setAltaTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onKeyDown={(e) => { if (e.key === 'Enter') void darDeAlta() }}
                placeholder="Teléfono (10 dígitos)"
                className="w-full mt-2 px-4 py-3 bg-white border border-sa-green-ink/10 rounded-sa font-mono text-sm text-sa-green-ink placeholder:text-sa-green-ink/40 focus:outline-none focus:ring-2 focus:ring-sa-green/30"
              />
              {msg && <p className="font-mono text-xs text-sa-strawberry mt-2">{msg}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setModoAlta(false); setMsg(null) }}
                  className="flex-1 border border-sa-green-ink/15 bg-white text-sa-green-ink/70 py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-cream-warm"
                >
                  ← Buscar
                </button>
                <button
                  onClick={() => void darDeAlta()}
                  disabled={registrando || !altaNombre.trim() || altaTelefono.length < 10}
                  className="flex-1 bg-sa-green disabled:opacity-40 text-sa-cream py-2.5 rounded-full font-mono text-xs uppercase tracking-wide hover:bg-sa-green-deep"
                >
                  {registrando ? 'Registrando…' : 'Dar de alta'}
                </button>
              </div>
            </>
          )}
        </div>

        {encontrado && (
          <div className="px-4 pb-4">
            <button
              onClick={() => void seleccionar(encontrado)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-sa bg-white border-2 border-sa-green hover:bg-sa-cream-warm/40 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-sa-green flex items-center justify-center text-sa-cream font-display text-xl flex-shrink-0">
                {encontrado.nombre[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base text-sa-green-ink leading-tight">{encontrado.nombre}</p>
                <div className="flex gap-3 mt-1">
                  <span className="font-mono text-xs text-sa-green-ink/60">🏋️ {encontrado.mancuernas} mancuernas</span>
                  {encontrado.cupones.length > 0 && (
                    <span className="font-mono text-xs text-sa-blueberry">
                      🎁 {encontrado.cupones.length} cupón{encontrado.cupones.length === 1 ? '' : 'es'}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sa-green text-lg flex-shrink-0">→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
