import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usuarioActual, vincularClienteAuth } from '@shake/supabase'
import { useCarrito } from '@/store/carritoStore'
import { sb } from '@/lib/sb'

export function AuthCallback() {
  const navigate = useNavigate()
  const { setUsuario } = useCarrito()
  const [estado, setEstado] = useState('Verificando tu cuenta…')

  useEffect(() => {
    async function resolver() {
      // Give Supabase a moment to exchange the token from URL hash
      await new Promise((r) => setTimeout(r, 800))

      const user = await usuarioActual(sb)

      if (!user || !user.email) {
        navigate('/pago', { replace: true })
        return
      }

      setEstado('Buscando tu cuenta…')

      const nombre = (user.user_metadata?.full_name as string | undefined) ?? user.email

      // Sin este paso el cliente queda autenticado pero SIN ficha de lealtad,
      // la orden se crea con cliente_id nulo y no acumula nada: entrar con
      // Google no le serviría de nada. La ficha la resuelve el servidor a
      // partir de la sesión (crea la suya o reclama la que ya tenía en caja).
      let clienteId: string | null = null
      try {
        const cliente = await vincularClienteAuth(sb, { nombre })
        clienteId = cliente.id
      } catch (e) {
        // Si falla la vinculación no se le corta la compra: sigue al pago sin
        // acumular, que es mejor que dejarlo atorado en esta pantalla.
        console.error('[AuthCallback] no se pudo vincular la ficha de lealtad', e)
      }

      setUsuario({
        authId: user.id,
        nombre,
        email: user.email,
        clienteId,
      })

      navigate('/pago', { replace: true })
    }

    resolver().catch((e) => {
      console.error('[AuthCallback]', e)
      navigate('/pago', { replace: true })
    })
  }, [navigate, setUsuario])

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-sa-green-deep text-sa-cream gap-6">
      <div className="w-12 h-12 border-4 border-sa-cream/30 border-t-sa-cream rounded-full animate-spin" />
      <p className="font-display text-2xl">{estado}</p>
    </div>
  )
}
