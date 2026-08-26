export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _respaldo_pruebas_28jul: {
        Row: {
          fila: Json
          guardado_en: string
          tabla: string
        }
        Insert: {
          fila: Json
          guardado_en?: string
          tabla: string
        }
        Update: {
          fila?: Json
          guardado_en?: string
          tabla?: string
        }
        Relationships: []
      }
      _respaldo_pruebas_30jul: {
        Row: {
          fila: Json
          guardado_en: string
          tabla: string
        }
        Insert: {
          fila: Json
          guardado_en?: string
          tabla: string
        }
        Update: {
          fila?: Json
          guardado_en?: string
          tabla?: string
        }
        Relationships: []
      }
      almacenes: {
        Row: {
          activo: boolean
          id: string
          nombre: string
          sucursal_id: string
          tipo: Database["public"]["Enums"]["tipo_almacen"]
        }
        Insert: {
          activo?: boolean
          id?: string
          nombre: string
          sucursal_id: string
          tipo: Database["public"]["Enums"]["tipo_almacen"]
        }
        Update: {
          activo?: boolean
          id?: string
          nombre?: string
          sucursal_id?: string
          tipo?: Database["public"]["Enums"]["tipo_almacen"]
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      app_data: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string
          hash: string
          username: string
        }
        Insert: {
          created_at?: string
          hash: string
          username: string
        }
        Update: {
          created_at?: string
          hash?: string
          username?: string
        }
        Relationships: []
      }
      caja_cortes: {
        Row: {
          abierto_en: string
          caja_id: string
          cerrado_en: string | null
          efectivo_contado: number | null
          empleado_apertura_id: string | null
          empleado_cierre_id: string | null
          estado: Database["public"]["Enums"]["estado_corte"]
          fondo_inicial: number
          id: string
          notas: string | null
        }
        Insert: {
          abierto_en?: string
          caja_id: string
          cerrado_en?: string | null
          efectivo_contado?: number | null
          empleado_apertura_id?: string | null
          empleado_cierre_id?: string | null
          estado?: Database["public"]["Enums"]["estado_corte"]
          fondo_inicial?: number
          id?: string
          notas?: string | null
        }
        Update: {
          abierto_en?: string
          caja_id?: string
          cerrado_en?: string | null
          efectivo_contado?: number | null
          empleado_apertura_id?: string | null
          empleado_cierre_id?: string | null
          estado?: Database["public"]["Enums"]["estado_corte"]
          fondo_inicial?: number
          id?: string
          notas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_cortes_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_cortes_empleado_apertura_id_fkey"
            columns: ["empleado_apertura_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_cortes_empleado_cierre_id_fkey"
            columns: ["empleado_cierre_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          activa: boolean
          id: string
          nombre: string
          sucursal_id: string
        }
        Insert: {
          activa?: boolean
          id?: string
          nombre: string
          sucursal_id: string
        }
        Update: {
          activa?: boolean
          id?: string
          nombre?: string
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activa: boolean
          cocina_id: string
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activa?: boolean
          cocina_id: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activa?: boolean
          cocina_id?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "categorias_cocina_id_fkey"
            columns: ["cocina_id"]
            isOneToOne: false
            referencedRelation: "cocinas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          codigo: string | null
          created_at: string
          email: string | null
          fecha_nacimiento: string | null
          id: string
          mancuernas: number
          nombre: string
          notas: string | null
          sabor_favorito: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          codigo?: string | null
          created_at?: string
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          mancuernas?: number
          nombre: string
          notas?: string | null
          sabor_favorito?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          codigo?: string | null
          created_at?: string
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          mancuernas?: number
          nombre?: string
          notas?: string | null
          sabor_favorito?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      cocina_items: {
        Row: {
          cantidad: number
          estado: Database["public"]["Enums"]["estado_cocina"]
          id: string
          orden_item_id: string
          pedido_id: string
          personalizacion: string | null
          producto_id: string | null
        }
        Insert: {
          cantidad?: number
          estado?: Database["public"]["Enums"]["estado_cocina"]
          id?: string
          orden_item_id: string
          pedido_id: string
          personalizacion?: string | null
          producto_id?: string | null
        }
        Update: {
          cantidad?: number
          estado?: Database["public"]["Enums"]["estado_cocina"]
          id?: string
          orden_item_id?: string
          pedido_id?: string
          personalizacion?: string | null
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cocina_items_orden_item_id_fkey"
            columns: ["orden_item_id"]
            isOneToOne: true
            referencedRelation: "orden_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocina_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_cocina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocina_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocina_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocina_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocina_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_producto_extras"
            referencedColumns: ["extra_id"]
          },
          {
            foreignKeyName: "cocina_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_productos_mas_vendidos"
            referencedColumns: ["id"]
          },
        ]
      }
      cocinas: {
        Row: {
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      combo_items: {
        Row: {
          cantidad: number
          combo_id: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          combo_id: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          combo_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "vw_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "vw_producto_extras"
            referencedColumns: ["extra_id"]
          },
          {
            foreignKeyName: "combo_items_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "vw_productos_mas_vendidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_producto_extras"
            referencedColumns: ["extra_id"]
          },
          {
            foreignKeyName: "combo_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_productos_mas_vendidos"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_kiosko: {
        Row: {
          clip_configurado: boolean
          expira_minutos: number
          modo_pago: Database["public"]["Enums"]["modo_pago_kiosko"]
          sucursal_id: string
          updated_at: string
        }
        Insert: {
          clip_configurado?: boolean
          expira_minutos?: number
          modo_pago?: Database["public"]["Enums"]["modo_pago_kiosko"]
          sucursal_id: string
          updated_at?: string
        }
        Update: {
          clip_configurado?: boolean
          expira_minutos?: number
          modo_pago?: Database["public"]["Enums"]["modo_pago_kiosko"]
          sucursal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_kiosko_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: true
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      costos_stock_sync: {
        Row: {
          almacen_id: string
          insumo_id: string
          ultimo_valor: number
          updated_at: string
        }
        Insert: {
          almacen_id: string
          insumo_id: string
          ultimo_valor?: number
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          insumo_id?: string
          ultimo_valor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "costos_stock_sync_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_stock_sync_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      cupones: {
        Row: {
          beneficio: string
          cliente_id: string
          codigo: string
          estado: Database["public"]["Enums"]["estado_cupon"]
          generado_en: string
          id: string
          orden_id_uso: string | null
          tipo: Database["public"]["Enums"]["tipo_cupon"]
          usado_en: string | null
          vence_en: string
        }
        Insert: {
          beneficio?: string
          cliente_id: string
          codigo?: string
          estado?: Database["public"]["Enums"]["estado_cupon"]
          generado_en?: string
          id?: string
          orden_id_uso?: string | null
          tipo?: Database["public"]["Enums"]["tipo_cupon"]
          usado_en?: string | null
          vence_en: string
        }
        Update: {
          beneficio?: string
          cliente_id?: string
          codigo?: string
          estado?: Database["public"]["Enums"]["estado_cupon"]
          generado_en?: string
          id?: string
          orden_id_uso?: string | null
          tipo?: Database["public"]["Enums"]["tipo_cupon"]
          usado_en?: string | null
          vence_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "cupones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupones_orden_id_uso_fkey"
            columns: ["orden_id_uso"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      empleados: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          created_at: string
          id: string
          nombre: string
          pin_hash: string | null
          rol_id: string
          sucursal_id: string | null
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          nombre: string
          pin_hash?: string | null
          rol_id: string
          sucursal_id?: string | null
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
          pin_hash?: string | null
          rol_id?: string
          sucursal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleados_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      entrada_lineas: {
        Row: {
          caducidad: string | null
          cantidad: number
          contenido_capturado: number | null
          contenido_insumo_antes: number | null
          costo_compra_insumo_antes: number | null
          costo_unitario_capturado: number
          costo_unitario_final: number
          created_at: string
          entrada_id: string
          envio_prorrateado: number
          id: string
          insumo_id: string
          lote_id: string | null
          presentacion_capturada: string | null
          subtotal: number
        }
        Insert: {
          caducidad?: string | null
          cantidad: number
          contenido_capturado?: number | null
          contenido_insumo_antes?: number | null
          costo_compra_insumo_antes?: number | null
          costo_unitario_capturado: number
          costo_unitario_final: number
          created_at?: string
          entrada_id: string
          envio_prorrateado?: number
          id?: string
          insumo_id: string
          lote_id?: string | null
          presentacion_capturada?: string | null
          subtotal: number
        }
        Update: {
          caducidad?: string | null
          cantidad?: number
          contenido_capturado?: number | null
          contenido_insumo_antes?: number | null
          costo_compra_insumo_antes?: number | null
          costo_unitario_capturado?: number
          costo_unitario_final?: number
          created_at?: string
          entrada_id?: string
          envio_prorrateado?: number
          id?: string
          insumo_id?: string
          lote_id?: string | null
          presentacion_capturada?: string | null
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "entrada_lineas_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "entradas_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrada_lineas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrada_lineas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      entradas_compra: {
        Row: {
          almacen_id: string
          cancelada_at: string | null
          costo_envio: number
          created_at: string
          estado: string
          factura: string | null
          fecha: string
          forma_pago: string | null
          id: string
          proveedor: string | null
          subtotal_mercancia: number
          total: number
        }
        Insert: {
          almacen_id: string
          cancelada_at?: string | null
          costo_envio?: number
          created_at?: string
          estado?: string
          factura?: string | null
          fecha: string
          forma_pago?: string | null
          id?: string
          proveedor?: string | null
          subtotal_mercancia?: number
          total?: number
        }
        Update: {
          almacen_id?: string
          cancelada_at?: string | null
          costo_envio?: number
          created_at?: string
          estado?: string
          factura?: string | null
          fecha?: string
          forma_pago?: string | null
          id?: string
          proveedor?: string | null
          subtotal_mercancia?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "entradas_compra_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      impresion_auditoria: {
        Row: {
          created_at: string
          empleado_id: string | null
          id: string
          motivo: string | null
          trabajo_id: string
          trabajo_original_id: string | null
        }
        Insert: {
          created_at?: string
          empleado_id?: string | null
          id?: string
          motivo?: string | null
          trabajo_id: string
          trabajo_original_id?: string | null
        }
        Update: {
          created_at?: string
          empleado_id?: string | null
          id?: string
          motivo?: string | null
          trabajo_id?: string
          trabajo_original_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impresion_auditoria_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impresion_auditoria_trabajo_id_fkey"
            columns: ["trabajo_id"]
            isOneToOne: false
            referencedRelation: "trabajos_impresion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impresion_auditoria_trabajo_original_id_fkey"
            columns: ["trabajo_original_id"]
            isOneToOne: false
            referencedRelation: "trabajos_impresion"
            referencedColumns: ["id"]
          },
        ]
      }
      impresoras: {
        Row: {
          activa: boolean
          agente_id: string | null
          agente_token: string
          ancho_papel: Database["public"]["Enums"]["ancho_papel"]
          buzzer: boolean
          cocina_id: string | null
          copias: number
          corte_automatico: boolean
          created_at: string
          id: string
          ip: string | null
          nombre: string
          nombre_dispositivo: string | null
          puerto: number | null
          sucursal_id: string
          tipo_conexion: Database["public"]["Enums"]["tipo_conexion_impresora"]
          ultima_conexion: string | null
          ultima_impresion: string | null
        }
        Insert: {
          activa?: boolean
          agente_id?: string | null
          agente_token?: string
          ancho_papel?: Database["public"]["Enums"]["ancho_papel"]
          buzzer?: boolean
          cocina_id?: string | null
          copias?: number
          corte_automatico?: boolean
          created_at?: string
          id?: string
          ip?: string | null
          nombre: string
          nombre_dispositivo?: string | null
          puerto?: number | null
          sucursal_id: string
          tipo_conexion?: Database["public"]["Enums"]["tipo_conexion_impresora"]
          ultima_conexion?: string | null
          ultima_impresion?: string | null
        }
        Update: {
          activa?: boolean
          agente_id?: string | null
          agente_token?: string
          ancho_papel?: Database["public"]["Enums"]["ancho_papel"]
          buzzer?: boolean
          cocina_id?: string | null
          copias?: number
          corte_automatico?: boolean
          created_at?: string
          id?: string
          ip?: string | null
          nombre?: string
          nombre_dispositivo?: string | null
          puerto?: number | null
          sucursal_id?: string
          tipo_conexion?: Database["public"]["Enums"]["tipo_conexion_impresora"]
          ultima_conexion?: string | null
          ultima_impresion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impresoras_cocina_id_fkey"
            columns: ["cocina_id"]
            isOneToOne: false
            referencedRelation: "cocinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impresoras_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      insumo_categorias: {
        Row: {
          activa: boolean
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      insumos: {
        Row: {
          activo: boolean
          categoria_id: string | null
          codigo: string | null
          codigo_barras: string | null
          contenido: number
          costo_compra: number
          costo_unitario: number | null
          created_at: string
          fecha_caducidad: string | null
          ganancia_pct: number | null
          id: string
          marca: string | null
          nombre: string
          porciones: Json
          precio_individual: number | null
          presentacion: string | null
          proveedor: string | null
          stock_base: number | null
          tipo: Database["public"]["Enums"]["tipo_insumo"]
          ultima_compra: string | null
          unidad: string
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string | null
          codigo_barras?: string | null
          contenido?: number
          costo_compra?: number
          costo_unitario?: number | null
          created_at?: string
          fecha_caducidad?: string | null
          ganancia_pct?: number | null
          id?: string
          marca?: string | null
          nombre: string
          porciones?: Json
          precio_individual?: number | null
          presentacion?: string | null
          proveedor?: string | null
          stock_base?: number | null
          tipo: Database["public"]["Enums"]["tipo_insumo"]
          ultima_compra?: string | null
          unidad?: string
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string | null
          codigo_barras?: string | null
          contenido?: number
          costo_compra?: number
          costo_unitario?: number | null
          created_at?: string
          fecha_caducidad?: string | null
          ganancia_pct?: number | null
          id?: string
          marca?: string | null
          nombre?: string
          porciones?: Json
          precio_individual?: number | null
          presentacion?: string | null
          proveedor?: string | null
          stock_base?: number | null
          tipo?: Database["public"]["Enums"]["tipo_insumo"]
          ultima_compra?: string | null
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "insumo_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_movimientos: {
        Row: {
          almacen_id: string | null
          cantidad: number
          costo_unitario: number | null
          created_at: string
          id: string
          insumo_id: string
          nota: string | null
          referencia_id: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
        }
        Insert: {
          almacen_id?: string | null
          cantidad: number
          costo_unitario?: number | null
          created_at?: string
          id?: string
          insumo_id: string
          nota?: string | null
          referencia_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
        }
        Update: {
          almacen_id?: string | null
          cantidad?: number
          costo_unitario?: number | null
          created_at?: string
          id?: string
          insumo_id?: string
          nota?: string | null
          referencia_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
        }
        Relationships: [
          {
            foreignKeyName: "inventario_movimientos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_movimientos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_stock: {
        Row: {
          almacen_id: string
          id: string
          insumo_id: string
          stock_actual: number
          stock_minimo: number
        }
        Insert: {
          almacen_id: string
          id?: string
          insumo_id: string
          stock_actual?: number
          stock_minimo?: number
        }
        Update: {
          almacen_id?: string
          id?: string
          insumo_id?: string
          stock_actual?: number
          stock_minimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventario_stock_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          almacen_id: string
          cantidad_actual: number
          cantidad_inicial: number
          costo_unitario: number | null
          created_at: string
          fecha_caducidad: string | null
          id: string
          insumo_id: string
          numero_lote: string | null
        }
        Insert: {
          almacen_id: string
          cantidad_actual: number
          cantidad_inicial: number
          costo_unitario?: number | null
          created_at?: string
          fecha_caducidad?: string | null
          id?: string
          insumo_id: string
          numero_lote?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad_actual?: number
          cantidad_inicial?: number
          costo_unitario?: number | null
          created_at?: string
          fecha_caducidad?: string | null
          id?: string
          insumo_id?: string
          numero_lote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      mancuernas_movimientos: {
        Row: {
          cliente_id: string
          created_at: string
          descripcion: string | null
          id: string
          orden_id: string | null
          puntos: number
          tipo: Database["public"]["Enums"]["tipo_mancuerna"]
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descripcion?: string | null
          id?: string
          orden_id?: string | null
          puntos: number
          tipo: Database["public"]["Enums"]["tipo_mancuerna"]
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          orden_id?: string | null
          puntos?: number
          tipo?: Database["public"]["Enums"]["tipo_mancuerna"]
        }
        Relationships: [
          {
            foreignKeyName: "mancuernas_movimientos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mancuernas_movimientos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      mermas: {
        Row: {
          almacen_id: string
          cantidad: number
          created_at: string
          id: string
          insumo_id: string
          motivo: string | null
        }
        Insert: {
          almacen_id: string
          cantidad: number
          created_at?: string
          id?: string
          insumo_id: string
          motivo?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          created_at?: string
          id?: string
          insumo_id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mermas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mermas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_items: {
        Row: {
          cantidad: number
          cocina_slug: string | null
          id: string
          orden_id: string
          padre_item_id: string | null
          personalizacion: string | null
          precio_unitario: number
          producto_id: string
        }
        Insert: {
          cantidad: number
          cocina_slug?: string | null
          id?: string
          orden_id: string
          padre_item_id?: string | null
          personalizacion?: string | null
          precio_unitario: number
          producto_id: string
        }
        Update: {
          cantidad?: number
          cocina_slug?: string | null
          id?: string
          orden_id?: string
          padre_item_id?: string | null
          personalizacion?: string | null
          precio_unitario?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orden_items_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_items_padre_item_id_fkey"
            columns: ["padre_item_id"]
            isOneToOne: false
            referencedRelation: "orden_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_producto_extras"
            referencedColumns: ["extra_id"]
          },
          {
            foreignKeyName: "orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_productos_mas_vendidos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes: {
        Row: {
          almacen_id: string | null
          canal: Database["public"]["Enums"]["canal_orden"]
          cliente_id: string | null
          clip_recibo: string | null
          codigo_corto: string | null
          corte_id: string | null
          created_at: string
          descuento: number
          empleado_id: string | null
          es_demo: boolean
          estado: Database["public"]["Enums"]["estado_orden"]
          estado_pago_orden: Database["public"]["Enums"]["estado_pago_orden"]
          expira_en: string | null
          folio: number
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
          nombre_cliente: string | null
          pagado: boolean
          sucursal_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          almacen_id?: string | null
          canal?: Database["public"]["Enums"]["canal_orden"]
          cliente_id?: string | null
          clip_recibo?: string | null
          codigo_corto?: string | null
          corte_id?: string | null
          created_at?: string
          descuento?: number
          empleado_id?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["estado_orden"]
          estado_pago_orden?: Database["public"]["Enums"]["estado_pago_orden"]
          expira_en?: string | null
          folio?: number
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          nombre_cliente?: string | null
          pagado?: boolean
          sucursal_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          almacen_id?: string | null
          canal?: Database["public"]["Enums"]["canal_orden"]
          cliente_id?: string | null
          clip_recibo?: string | null
          codigo_corto?: string | null
          corte_id?: string | null
          created_at?: string
          descuento?: number
          empleado_id?: string | null
          es_demo?: boolean
          estado?: Database["public"]["Enums"]["estado_orden"]
          estado_pago_orden?: Database["public"]["Enums"]["estado_pago_orden"]
          expira_en?: string | null
          folio?: number
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"] | null
          nombre_cliente?: string | null
          pagado?: boolean
          sucursal_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "caja_cortes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "vw_corte_resumen"
            referencedColumns: ["corte_id"]
          },
          {
            foreignKeyName: "ordenes_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_auditoria: {
        Row: {
          created_at: string
          detalle: Json | null
          evento: string
          id: string
          orden_id: string
        }
        Insert: {
          created_at?: string
          detalle?: Json | null
          evento: string
          id?: string
          orden_id: string
        }
        Update: {
          created_at?: string
          detalle?: Json | null
          evento?: string
          id?: string
          orden_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_auditoria_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          autorizado_por: string | null
          clip_payload: Json | null
          clip_payment_id: string | null
          clip_terminal_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_pago"]
          estado_transaccion: Database["public"]["Enums"]["estado_transaccion_pago"]
          id: string
          idempotency_key: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          orden_id: string
          proveedor: string
          proveedor_error: string | null
          proveedor_payment_id: string | null
          referencia: string | null
          updated_at: string
        }
        Insert: {
          autorizado_por?: string | null
          clip_payload?: Json | null
          clip_payment_id?: string | null
          clip_terminal_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          estado_transaccion?: Database["public"]["Enums"]["estado_transaccion_pago"]
          id?: string
          idempotency_key?: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          orden_id: string
          proveedor?: string
          proveedor_error?: string | null
          proveedor_payment_id?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Update: {
          autorizado_por?: string | null
          clip_payload?: Json | null
          clip_payment_id?: string | null
          clip_terminal_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_pago"]
          estado_transaccion?: Database["public"]["Enums"]["estado_transaccion_pago"]
          id?: string
          idempotency_key?: string | null
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto?: number
          orden_id?: string
          proveedor?: string
          proveedor_error?: string | null
          proveedor_payment_id?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_autorizado_por_fkey"
            columns: ["autorizado_por"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          clave_compras: string
          clave_traspaso: string
          food_cost_meta: number
          id: string
          iva: number
          mano_obra: number
          merma_default: number
          updated_at: string
        }
        Insert: {
          clave_compras?: string
          clave_traspaso?: string
          food_cost_meta?: number
          id?: string
          iva?: number
          mano_obra?: number
          merma_default?: number
          updated_at?: string
        }
        Update: {
          clave_compras?: string
          clave_traspaso?: string
          food_cost_meta?: number
          id?: string
          iva?: number
          mano_obra?: number
          merma_default?: number
          updated_at?: string
        }
        Relationships: []
      }
      pedidos_cocina: {
        Row: {
          cocina_id: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_cocina"]
          id: string
          orden_id: string
          updated_at: string
        }
        Insert: {
          cocina_id: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cocina"]
          id?: string
          orden_id: string
          updated_at?: string
        }
        Update: {
          cocina_id?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_cocina"]
          id?: string
          orden_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cocina_cocina_id_fkey"
            columns: ["cocina_id"]
            isOneToOne: false
            referencedRelation: "cocinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cocina_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_extras: {
        Row: {
          extra_id: string
          producto_id: string
        }
        Insert: {
          extra_id: string
          producto_id: string
        }
        Update: {
          extra_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "vw_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "vw_producto_extras"
            referencedColumns: ["extra_id"]
          },
          {
            foreignKeyName: "producto_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "vw_productos_mas_vendidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_producto_extras"
            referencedColumns: ["extra_id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_productos_mas_vendidos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          categoria_id: string | null
          codigo: string | null
          codigo_barras: string | null
          created_at: string
          descripcion: string | null
          es_combo: boolean
          es_extra: boolean
          es_reventa: boolean
          id: string
          imagen_url: string | null
          iva_incluido: boolean
          mano_obra: number
          marca: string | null
          merma_pct: number | null
          nombre: string
          onzas: number | null
          orden: number
          precio: number
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string | null
          codigo_barras?: string | null
          created_at?: string
          descripcion?: string | null
          es_combo?: boolean
          es_extra?: boolean
          es_reventa?: boolean
          id?: string
          imagen_url?: string | null
          iva_incluido?: boolean
          mano_obra?: number
          marca?: string | null
          merma_pct?: number | null
          nombre: string
          onzas?: number | null
          orden?: number
          precio?: number
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string | null
          codigo_barras?: string | null
          created_at?: string
          descripcion?: string | null
          es_combo?: boolean
          es_extra?: boolean
          es_reventa?: boolean
          id?: string
          imagen_url?: string | null
          iva_incluido?: boolean
          mano_obra?: number
          marca?: string | null
          merma_pct?: number | null
          nombre?: string
          onzas?: number | null
          orden?: number
          precio?: number
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      promocion_aplicaciones: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          orden_id: string | null
          promocion_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          orden_id?: string | null
          promocion_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          orden_id?: string | null
          promocion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promocion_aplicaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocion_aplicaciones_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocion_aplicaciones_promocion_id_fkey"
            columns: ["promocion_id"]
            isOneToOne: false
            referencedRelation: "promociones"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones: {
        Row: {
          activa: boolean
          categoria_gratis: string | null
          created_at: string
          descripcion: string | null
          dias_semana: number[] | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          min_compras_30d: number | null
          nombre: string
          sabor_favorito: string | null
          tipo: Database["public"]["Enums"]["tipo_promocion"]
          valor: number
          vence_en: string | null
        }
        Insert: {
          activa?: boolean
          categoria_gratis?: string | null
          created_at?: string
          descripcion?: string | null
          dias_semana?: number[] | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          min_compras_30d?: number | null
          nombre: string
          sabor_favorito?: string | null
          tipo: Database["public"]["Enums"]["tipo_promocion"]
          valor?: number
          vence_en?: string | null
        }
        Update: {
          activa?: boolean
          categoria_gratis?: string | null
          created_at?: string
          descripcion?: string | null
          dias_semana?: number[] | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          min_compras_30d?: number | null
          nombre?: string
          sabor_favorito?: string | null
          tipo?: Database["public"]["Enums"]["tipo_promocion"]
          valor?: number
          vence_en?: string | null
        }
        Relationships: []
      }
      recetas: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          nota: string | null
          producto_id: string
        }
        Insert: {
          cantidad?: number
          id?: string
          insumo_id: string
          nota?: string | null
          producto_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          nota?: string | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recetas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_producto_extras"
            referencedColumns: ["extra_id"]
          },
          {
            foreignKeyName: "recetas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_productos_mas_vendidos"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          id: string
          nombre: string
          slug: string
        }
        Insert: {
          id?: string
          nombre: string
          slug: string
        }
        Update: {
          id?: string
          nombre?: string
          slug?: string
        }
        Relationships: []
      }
      sucursales: {
        Row: {
          activa: boolean
          created_at: string
          direccion: string | null
          es_produccion: boolean
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          direccion?: string | null
          es_produccion?: boolean
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          direccion?: string | null
          es_produccion?: boolean
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      trabajos_impresion: {
        Row: {
          claim_expires_at: string | null
          claimed_by: string | null
          copia_de: string | null
          created_at: string
          error_ultimo: string | null
          estacion_id: string | null
          estado: Database["public"]["Enums"]["estado_trabajo_impresion"]
          failed_at: string | null
          id: string
          idempotency_key: string | null
          intentos: number
          max_intentos: number
          next_retry_at: string | null
          numero_copia: number
          orden_id: string | null
          payload: Json
          pedido_id: string | null
          printed_at: string | null
          printer_id: string | null
          processing_at: string | null
          queued_at: string
          tipo_documento: Database["public"]["Enums"]["tipo_documento_impresion"]
        }
        Insert: {
          claim_expires_at?: string | null
          claimed_by?: string | null
          copia_de?: string | null
          created_at?: string
          error_ultimo?: string | null
          estacion_id?: string | null
          estado?: Database["public"]["Enums"]["estado_trabajo_impresion"]
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          intentos?: number
          max_intentos?: number
          next_retry_at?: string | null
          numero_copia?: number
          orden_id?: string | null
          payload: Json
          pedido_id?: string | null
          printed_at?: string | null
          printer_id?: string | null
          processing_at?: string | null
          queued_at?: string
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_impresion"]
        }
        Update: {
          claim_expires_at?: string | null
          claimed_by?: string | null
          copia_de?: string | null
          created_at?: string
          error_ultimo?: string | null
          estacion_id?: string | null
          estado?: Database["public"]["Enums"]["estado_trabajo_impresion"]
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          intentos?: number
          max_intentos?: number
          next_retry_at?: string | null
          numero_copia?: number
          orden_id?: string | null
          payload?: Json
          pedido_id?: string | null
          printed_at?: string | null
          printer_id?: string | null
          processing_at?: string | null
          queued_at?: string
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_impresion"]
        }
        Relationships: [
          {
            foreignKeyName: "trabajos_impresion_copia_de_fkey"
            columns: ["copia_de"]
            isOneToOne: false
            referencedRelation: "trabajos_impresion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_impresion_estacion_id_fkey"
            columns: ["estacion_id"]
            isOneToOne: false
            referencedRelation: "cocinas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_impresion_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_impresion_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_cocina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabajos_impresion_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "impresoras"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencia_items: {
        Row: {
          cantidad: number
          id: string
          insumo_id: string
          transferencia_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          insumo_id: string
          transferencia_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          insumo_id?: string
          transferencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_items_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias: {
        Row: {
          created_at: string
          destino_id: string
          estado: string
          firma: string | null
          id: string
          origen_id: string
        }
        Insert: {
          created_at?: string
          destino_id: string
          estado?: string
          firma?: string | null
          id?: string
          origen_id: string
        }
        Update: {
          created_at?: string
          destino_id?: string
          estado?: string
          firma?: string | null
          id?: string
          origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_destino_id_fkey"
            columns: ["destino_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_origen_id_fkey"
            columns: ["origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_confirmaciones: {
        Row: {
          confirmado_en: string
          orden_id: string
          pago_id: string
        }
        Insert: {
          confirmado_en?: string
          orden_id: string
          pago_id: string
        }
        Update: {
          confirmado_en?: string
          orden_id?: string
          pago_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_confirmaciones_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: true
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_confirmaciones_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          cfdi_solicitado: boolean
          created_at: string
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          orden_id: string
          total: number
        }
        Insert: {
          cfdi_solicitado?: boolean
          created_at?: string
          id?: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"]
          orden_id: string
          total: number
        }
        Update: {
          cfdi_solicitado?: boolean
          created_at?: string
          id?: string
          metodo_pago?: Database["public"]["Enums"]["metodo_pago"]
          orden_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: true
            referencedRelation: "ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_combos: {
        Row: {
          activo: boolean | null
          categoria_id: string | null
          categoria_nombre: string | null
          componentes: Json | null
          costo_insumos: number | null
          costo_total: number | null
          food_cost_pct: number | null
          id: string | null
          margen: number | null
          margen_pct: number | null
          nombre: string | null
          precio: number | null
          precio_sin_iva: number | null
          precio_sugerido: number | null
          todos_componentes_activos: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_corte_resumen: {
        Row: {
          abierto_en: string | null
          caja: string | null
          caja_id: string | null
          cerrado_en: string | null
          corte_id: string | null
          diferencia: number | null
          efectivo_contado: number | null
          efectivo_esperado: number | null
          estado: Database["public"]["Enums"]["estado_corte"] | null
          fondo_inicial: number | null
          num_ordenes: number | null
          total_clip: number | null
          total_cortesia: number | null
          total_efectivo: number | null
          total_otro: number | null
          total_pagado: number | null
          total_tarjeta: number | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_cortes_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_costeo_producto: {
        Row: {
          codigo: string | null
          costo_con_merma: number | null
          costo_empaque: number | null
          costo_insumos: number | null
          costo_receta: number | null
          costo_total: number | null
          es_combo: boolean | null
          es_reventa: boolean | null
          food_cost_pct: number | null
          id: string | null
          iva_incluido: boolean | null
          mano_obra: number | null
          margen: number | null
          margen_pct: number | null
          nombre: string | null
          precio: number | null
          precio_con_iva: number | null
          precio_sin_iva: number | null
          precio_sugerido: number | null
        }
        Relationships: []
      }
      vw_producto_extras: {
        Row: {
          activo: boolean | null
          extra_id: string | null
          nombre: string | null
          precio: number | null
          producto_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_costeo_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_producto_extras"
            referencedColumns: ["extra_id"]
          },
          {
            foreignKeyName: "producto_extras_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "vw_productos_mas_vendidos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_productos_mas_vendidos: {
        Row: {
          categoria: string | null
          id: string | null
          nombre: string | null
          total_ingresos: number | null
          total_vendido: number | null
        }
        Relationships: []
      }
      vw_stock_almacen: {
        Row: {
          almacen: string | null
          almacen_id: string | null
          almacen_tipo: Database["public"]["Enums"]["tipo_almacen"] | null
          bajo_minimo: boolean | null
          id: string | null
          insumo: string | null
          insumo_id: string | null
          insumo_tipo: Database["public"]["Enums"]["tipo_insumo"] | null
          stock_actual: number | null
          stock_minimo: number | null
          unidad: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_stock_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_stock_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ventas_diarias: {
        Row: {
          clip: number | null
          cortesia: number | null
          dia: string | null
          efectivo: number | null
          num_ordenes: number | null
          otro: number | null
          sucursal_id: string | null
          tarjeta: number | null
          ticket_promedio: number | null
          total_ventas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _aplicar_delta_almacen: {
        Args: {
          p_almacen: string
          p_cual: string
          p_tipo: Database["public"]["Enums"]["tipo_movimiento"]
        }
        Returns: undefined
      }
      fn_activar_impresora: {
        Args: { p_activa: boolean; p_id: string }
        Returns: undefined
      }
      fn_actualizar_configuracion_kiosko: {
        Args: {
          p_clip_configurado?: boolean
          p_expira_minutos?: number
          p_modo_pago: Database["public"]["Enums"]["modo_pago_kiosko"]
          p_sucursal_id: string
        }
        Returns: {
          clip_configurado: boolean
          expira_minutos: number
          modo_pago: Database["public"]["Enums"]["modo_pago_kiosko"]
          sucursal_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "configuracion_kiosko"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_actualizar_empleado: {
        Args: {
          p_activo?: boolean
          p_id: string
          p_nombre?: string
          p_pin?: string
          p_rol_id?: string
        }
        Returns: undefined
      }
      fn_actualizar_impresora: {
        Args: {
          p_ancho_papel: Database["public"]["Enums"]["ancho_papel"]
          p_buzzer: boolean
          p_cocina_id: string
          p_copias: number
          p_corte_automatico: boolean
          p_id: string
          p_ip: string
          p_nombre: string
          p_nombre_dispositivo: string
          p_puerto: number
          p_tipo_conexion: Database["public"]["Enums"]["tipo_conexion_impresora"]
        }
        Returns: undefined
      }
      fn_admin_empleados: {
        Args: never
        Returns: {
          activo: boolean
          id: string
          nombre: string
          rol: string
          rol_id: string
          sucursal_id: string
          tiene_pin: boolean
        }[]
      }
      fn_admin_impresoras: {
        Args: never
        Returns: {
          activa: boolean
          agente_id: string
          ancho_papel: Database["public"]["Enums"]["ancho_papel"]
          buzzer: boolean
          cocina_id: string
          conectada: boolean
          copias: number
          corte_automatico: boolean
          created_at: string
          id: string
          ip: string
          nombre: string
          nombre_dispositivo: string
          puerto: number
          sucursal_id: string
          tipo_conexion: Database["public"]["Enums"]["tipo_conexion_impresora"]
          ultima_conexion: string
          ultima_impresion: string
        }[]
      }
      fn_canjear_cupon: {
        Args: { p_cupon_id: string; p_orden_id?: string }
        Returns: {
          beneficio: string
          cliente_id: string
          codigo: string
          estado: Database["public"]["Enums"]["estado_cupon"]
          generado_en: string
          id: string
          orden_id_uso: string | null
          tipo: Database["public"]["Enums"]["tipo_cupon"]
          usado_en: string | null
          vence_en: string
        }
        SetofOptions: {
          from: "*"
          to: "cupones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_cliente_actualizar: {
        Args: {
          p_email?: string
          p_id: string
          p_nombre: string
          p_notas?: string
          p_telefono?: string
        }
        Returns: {
          activo: boolean
          auth_user_id: string | null
          codigo: string | null
          created_at: string
          email: string | null
          fecha_nacimiento: string | null
          id: string
          mancuernas: number
          nombre: string
          notas: string | null
          sabor_favorito: string | null
          telefono: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clientes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_cliente_desactivar: { Args: { p_id: string }; Returns: undefined }
      fn_cliente_registrar: {
        Args: {
          p_email?: string
          p_fecha_nacimiento?: string
          p_nombre: string
          p_notas?: string
          p_sabor_favorito?: string
          p_telefono?: string
        }
        Returns: {
          activo: boolean
          auth_user_id: string | null
          codigo: string | null
          created_at: string
          email: string | null
          fecha_nacimiento: string | null
          id: string
          mancuernas: number
          nombre: string
          notas: string | null
          sabor_favorito: string | null
          telefono: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clientes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_cobrar_orden: {
        Args: {
          p_autorizado_por?: string
          p_idempotency_key?: string
          p_metodo: Database["public"]["Enums"]["metodo_pago"]
          p_monto: number
          p_orden_id: string
          p_referencia?: string
        }
        Returns: {
          autorizado_por: string | null
          clip_payload: Json | null
          clip_payment_id: string | null
          clip_terminal_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_pago"]
          estado_transaccion: Database["public"]["Enums"]["estado_transaccion_pago"]
          id: string
          idempotency_key: string | null
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto: number
          orden_id: string
          proveedor: string
          proveedor_error: string | null
          proveedor_payment_id: string | null
          referencia: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pagos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_cocina_de_producto: {
        Args: { p_producto_id: string }
        Returns: string
      }
      fn_combo_recalcular: { Args: { p_combo_id: string }; Returns: undefined }
      fn_confirmar_venta: {
        Args: { p_orden_id: string; p_pago_id: string }
        Returns: {
          almacen_id: string | null
          canal: Database["public"]["Enums"]["canal_orden"]
          cliente_id: string | null
          clip_recibo: string | null
          codigo_corto: string | null
          corte_id: string | null
          created_at: string
          descuento: number
          empleado_id: string | null
          es_demo: boolean
          estado: Database["public"]["Enums"]["estado_orden"]
          estado_pago_orden: Database["public"]["Enums"]["estado_pago_orden"]
          expira_en: string | null
          folio: number
          id: string
          metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
          nombre_cliente: string | null
          pagado: boolean
          sucursal_id: string | null
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "ordenes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_crear_empleado: {
        Args: {
          p_nombre: string
          p_pin?: string
          p_rol_id: string
          p_sucursal?: string
        }
        Returns: string
      }
      fn_crear_impresora: {
        Args: {
          p_ancho_papel?: Database["public"]["Enums"]["ancho_papel"]
          p_buzzer?: boolean
          p_cocina_id: string
          p_copias?: number
          p_corte_automatico?: boolean
          p_ip?: string
          p_nombre: string
          p_nombre_dispositivo?: string
          p_puerto?: number
          p_sucursal_id: string
          p_tipo_conexion: Database["public"]["Enums"]["tipo_conexion_impresora"]
        }
        Returns: {
          agente_token: string
          id: string
        }[]
      }
      fn_crear_orden:
        | {
            Args: {
              p_almacen_id: string
              p_canal: Database["public"]["Enums"]["canal_orden"]
              p_cliente_id?: string
              p_corte_id?: string
              p_descuento?: number
              p_empleado_id?: string
              p_items: Json
              p_sucursal_id: string
            }
            Returns: {
              almacen_id: string | null
              canal: Database["public"]["Enums"]["canal_orden"]
              cliente_id: string | null
              clip_recibo: string | null
              codigo_corto: string | null
              corte_id: string | null
              created_at: string
              descuento: number
              empleado_id: string | null
              es_demo: boolean
              estado: Database["public"]["Enums"]["estado_orden"]
              estado_pago_orden: Database["public"]["Enums"]["estado_pago_orden"]
              expira_en: string | null
              folio: number
              id: string
              metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
              nombre_cliente: string | null
              pagado: boolean
              sucursal_id: string | null
              total: number
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "ordenes"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_almacen_id: string
              p_canal: Database["public"]["Enums"]["canal_orden"]
              p_cliente_id?: string
              p_corte_id?: string
              p_descuento?: number
              p_empleado_id?: string
              p_es_demo?: boolean
              p_items: Json
              p_sucursal_id: string
            }
            Returns: {
              almacen_id: string | null
              canal: Database["public"]["Enums"]["canal_orden"]
              cliente_id: string | null
              clip_recibo: string | null
              codigo_corto: string | null
              corte_id: string | null
              created_at: string
              descuento: number
              empleado_id: string | null
              es_demo: boolean
              estado: Database["public"]["Enums"]["estado_orden"]
              estado_pago_orden: Database["public"]["Enums"]["estado_pago_orden"]
              expira_en: string | null
              folio: number
              id: string
              metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
              nombre_cliente: string | null
              pagado: boolean
              sucursal_id: string | null
              total: number
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "ordenes"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_almacen_id: string
              p_canal: Database["public"]["Enums"]["canal_orden"]
              p_cliente_id?: string
              p_corte_id?: string
              p_descuento?: number
              p_empleado_id?: string
              p_es_demo?: boolean
              p_items: Json
              p_nombre_cliente?: string
              p_sucursal_id: string
            }
            Returns: {
              almacen_id: string | null
              canal: Database["public"]["Enums"]["canal_orden"]
              cliente_id: string | null
              clip_recibo: string | null
              codigo_corto: string | null
              corte_id: string | null
              created_at: string
              descuento: number
              empleado_id: string | null
              es_demo: boolean
              estado: Database["public"]["Enums"]["estado_orden"]
              estado_pago_orden: Database["public"]["Enums"]["estado_pago_orden"]
              expira_en: string | null
              folio: number
              id: string
              metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
              nombre_cliente: string | null
              pagado: boolean
              sucursal_id: string | null
              total: number
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "ordenes"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      fn_crear_orden_kiosko_caja:
        | {
            Args: {
              p_almacen_id: string
              p_cliente_id?: string
              p_descuento?: number
              p_items: Json
              p_sucursal_id: string
            }
            Returns: {
              almacen_id: string | null
              canal: Database["public"]["Enums"]["canal_orden"]
              cliente_id: string | null
              clip_recibo: string | null
              codigo_corto: string | null
              corte_id: string | null
              created_at: string
              descuento: number
              empleado_id: string | null
              es_demo: boolean
              estado: Database["public"]["Enums"]["estado_orden"]
              estado_pago_orden: Database["public"]["Enums"]["estado_pago_orden"]
              expira_en: string | null
              folio: number
              id: string
              metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
              nombre_cliente: string | null
              pagado: boolean
              sucursal_id: string | null
              total: number
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "ordenes"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_almacen_id: string
              p_cliente_id?: string
              p_descuento?: number
              p_items: Json
              p_nombre_cliente?: string
              p_sucursal_id: string
            }
            Returns: {
              almacen_id: string | null
              canal: Database["public"]["Enums"]["canal_orden"]
              cliente_id: string | null
              clip_recibo: string | null
              codigo_corto: string | null
              corte_id: string | null
              created_at: string
              descuento: number
              empleado_id: string | null
              es_demo: boolean
              estado: Database["public"]["Enums"]["estado_orden"]
              estado_pago_orden: Database["public"]["Enums"]["estado_pago_orden"]
              expira_en: string | null
              folio: number
              id: string
              metodo_pago: Database["public"]["Enums"]["metodo_pago"] | null
              nombre_cliente: string | null
              pagado: boolean
              sucursal_id: string | null
              total: number
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "ordenes"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      fn_diagnostico_impresora: {
        Args: { p_token: string }
        Returns: {
          activa: boolean
          ancho_papel: Database["public"]["Enums"]["ancho_papel"]
          buzzer: boolean
          cocina_id: string
          cocina_nombre: string
          copias: number
          corte_automatico: boolean
          id: string
          ip: string
          nombre: string
          nombre_dispositivo: string
          puerto: number
          sucursal_id: string
          sucursal_nombre: string
          tipo_conexion: Database["public"]["Enums"]["tipo_conexion_impresora"]
          ultima_conexion: string
          ultima_impresion: string
        }[]
      }
      fn_empleados_activos: {
        Args: { p_sucursal?: string }
        Returns: {
          id: string
          nombre: string
          rol: string
          sucursal_id: string
        }[]
      }
      fn_encolar_comanda_para_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      fn_entrada_cancelar: {
        Args: { p_clave: string; p_entrada_id: string }
        Returns: {
          almacen_id: string
          cancelada_at: string | null
          costo_envio: number
          created_at: string
          estado: string
          factura: string | null
          fecha: string
          forma_pago: string | null
          id: string
          proveedor: string | null
          subtotal_mercancia: number
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "entradas_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_entrada_confirmar: {
        Args: {
          p_almacen_id: string
          p_clave: string
          p_costo_envio: number
          p_factura: string
          p_fecha: string
          p_forma_pago: string
          p_lineas: Json
          p_proveedor: string
        }
        Returns: {
          almacen_id: string
          cancelada_at: string | null
          costo_envio: number
          created_at: string
          estado: string
          factura: string | null
          fecha: string
          forma_pago: string | null
          id: string
          proveedor: string | null
          subtotal_mercancia: number
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "entradas_compra"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_entrada_historial: { Args: { p_limite?: number }; Returns: Json }
      fn_entrada_previsualizar: {
        Args: { p_costo_envio?: number; p_lineas: Json }
        Returns: Json
      }
      fn_expirar_cupones: { Args: never; Returns: number }
      fn_expirar_ordenes_kiosko: { Args: never; Returns: number }
      fn_extra_bebida_activar: {
        Args: { p_activo: boolean; p_id: string }
        Returns: undefined
      }
      fn_extra_bebida_guardar: {
        Args: { p_aplicar?: string; p_nombre: string; p_precio?: number }
        Returns: {
          activo: boolean
          categoria_id: string | null
          codigo: string | null
          codigo_barras: string | null
          created_at: string
          descripcion: string | null
          es_combo: boolean
          es_extra: boolean
          es_reventa: boolean
          id: string
          imagen_url: string | null
          iva_incluido: boolean
          mano_obra: number
          marca: string | null
          merma_pct: number | null
          nombre: string
          onzas: number | null
          orden: number
          precio: number
        }
        SetofOptions: {
          from: "*"
          to: "productos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_extra_bebida_productos: {
        Args: { p_extra_id: string }
        Returns: {
          categoria: string
          nombre: string
          ofrecido: boolean
          producto_id: string
        }[]
      }
      fn_extra_bebida_vincular: {
        Args: { p_extra_id: string; p_ofrecer: boolean; p_producto_id: string }
        Returns: undefined
      }
      fn_extras_bebida_admin: {
        Args: never
        Returns: {
          activo: boolean
          id: string
          ligado_a: number
          nombre: string
          precio: number
        }[]
      }
      fn_extras_disponibles: { Args: { p_producto_id: string }; Returns: Json }
      fn_generar_codigo_corto: { Args: never; Returns: string }
      fn_generar_cupones_cumpleanos: { Args: never; Returns: number }
      fn_guardar_extra: {
        Args: {
          p_cantidad?: number
          p_insumo_id: string
          p_nombre: string
          p_precio: number
          p_producto_id: string
        }
        Returns: {
          activo: boolean
          categoria_id: string | null
          codigo: string | null
          codigo_barras: string | null
          created_at: string
          descripcion: string | null
          es_combo: boolean
          es_extra: boolean
          es_reventa: boolean
          id: string
          imagen_url: string | null
          iva_incluido: boolean
          mano_obra: number
          marca: string | null
          merma_pct: number | null
          nombre: string
          onzas: number | null
          orden: number
          precio: number
        }
        SetofOptions: {
          from: "*"
          to: "productos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_imprimir_confirmar: {
        Args: { p_token: string; p_trabajo_id: string }
        Returns: undefined
      }
      fn_imprimir_fallar: {
        Args: { p_error: string; p_token: string; p_trabajo_id: string }
        Returns: undefined
      }
      fn_imprimir_latido: { Args: { p_token: string }; Returns: undefined }
      fn_imprimir_liberar_vencidos: { Args: never; Returns: number }
      fn_imprimir_prueba: {
        Args: { p_token: string }
        Returns: {
          claim_expires_at: string | null
          claimed_by: string | null
          copia_de: string | null
          created_at: string
          error_ultimo: string | null
          estacion_id: string | null
          estado: Database["public"]["Enums"]["estado_trabajo_impresion"]
          failed_at: string | null
          id: string
          idempotency_key: string | null
          intentos: number
          max_intentos: number
          next_retry_at: string | null
          numero_copia: number
          orden_id: string | null
          payload: Json
          pedido_id: string | null
          printed_at: string | null
          printer_id: string | null
          processing_at: string | null
          queued_at: string
          tipo_documento: Database["public"]["Enums"]["tipo_documento_impresion"]
        }
        SetofOptions: {
          from: "*"
          to: "trabajos_impresion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_imprimir_reclamar_trabajos: {
        Args: { p_agente: string; p_limite?: number; p_token: string }
        Returns: {
          claim_expires_at: string | null
          claimed_by: string | null
          copia_de: string | null
          created_at: string
          error_ultimo: string | null
          estacion_id: string | null
          estado: Database["public"]["Enums"]["estado_trabajo_impresion"]
          failed_at: string | null
          id: string
          idempotency_key: string | null
          intentos: number
          max_intentos: number
          next_retry_at: string | null
          numero_copia: number
          orden_id: string | null
          payload: Json
          pedido_id: string | null
          printed_at: string | null
          printer_id: string | null
          processing_at: string | null
          queued_at: string
          tipo_documento: Database["public"]["Enums"]["tipo_documento_impresion"]
        }[]
        SetofOptions: {
          from: "*"
          to: "trabajos_impresion"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_imprimir_reimprimir: {
        Args: {
          p_empleado_id?: string
          p_motivo?: string
          p_printer_id?: string
          p_trabajo_id: string
        }
        Returns: {
          claim_expires_at: string | null
          claimed_by: string | null
          copia_de: string | null
          created_at: string
          error_ultimo: string | null
          estacion_id: string | null
          estado: Database["public"]["Enums"]["estado_trabajo_impresion"]
          failed_at: string | null
          id: string
          idempotency_key: string | null
          intentos: number
          max_intentos: number
          next_retry_at: string | null
          numero_copia: number
          orden_id: string | null
          payload: Json
          pedido_id: string | null
          printed_at: string | null
          printer_id: string | null
          processing_at: string | null
          queued_at: string
          tipo_documento: Database["public"]["Enums"]["tipo_documento_impresion"]
        }
        SetofOptions: {
          from: "*"
          to: "trabajos_impresion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_items_comanda: { Args: { p_pedido_id: string }; Returns: Json }
      fn_login_cajero: {
        Args: { p_pin: string }
        Returns: {
          id: string
          nombre: string
          rol: string
          sucursal_id: string
        }[]
      }
      fn_nombres_pedido_frecuentes: {
        Args: { p_limite?: number }
        Returns: {
          nombre: string
          veces: number
        }[]
      }
      fn_producto_mover_categoria: {
        Args: { p_categoria_id: string; p_producto_id: string }
        Returns: undefined
      }
      fn_promos_cliente: {
        Args: { p_cliente: string }
        Returns: {
          activa: boolean
          categoria_gratis: string | null
          created_at: string
          descripcion: string | null
          dias_semana: number[] | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          min_compras_30d: number | null
          nombre: string
          sabor_favorito: string | null
          tipo: Database["public"]["Enums"]["tipo_promocion"]
          valor: number
          vence_en: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "promociones"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_quitar_extra: {
        Args: { p_extra_id: string; p_producto_id: string }
        Returns: undefined
      }
      fn_reactivacion: { Args: never; Returns: number }
      fn_reconciliar_pagos: {
        Args: never
        Returns: {
          accion: string
          detalle: string
          orden_id: string
        }[]
      }
      fn_roles: {
        Args: never
        Returns: {
          id: string
          nombre: string
          slug: string
        }[]
      }
      fn_rotar_token_impresora: { Args: { p_id: string }; Returns: string }
      fn_salud_sistema: {
        Args: never
        Returns: {
          impresoras_activas: number
          impresoras_conectadas: number
          ordenes_esperando_caja: number
          ordenes_expiradas_24h: number
          pagos_desconocidos: number
          pagos_pendientes: number
          pedidos_sin_comanda: number
          trabajos_impresion_fallidos: number
          ventas_sin_movimiento_inventario: number
        }[]
      }
      fn_sync_app_data: { Args: never; Returns: undefined }
      fn_sync_stock_costos: { Args: never; Returns: undefined }
      fn_vincular_cliente_auth: {
        Args: { p_nombre?: string }
        Returns: {
          activo: boolean
          auth_user_id: string | null
          codigo: string | null
          created_at: string
          email: string | null
          fecha_nacimiento: string | null
          id: string
          mancuernas: number
          nombre: string
          notas: string | null
          sabor_favorito: string | null
          telefono: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clientes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      ancho_papel: "58mm" | "80mm"
      canal_orden: "kiosko" | "pos" | "delivery"
      estado_cocina:
        | "pendiente"
        | "en_preparacion"
        | "listo"
        | "entregado"
        | "cancelado"
      estado_corte: "abierta" | "cerrada"
      estado_cupon: "activo" | "usado" | "expirado" | "cancelado"
      estado_orden:
        | "pendiente"
        | "en_preparacion"
        | "lista"
        | "entregada"
        | "cancelada"
      estado_pago: "pendiente" | "aprobado" | "rechazado" | "cancelado"
      estado_pago_orden:
        | "draft"
        | "pending_payment"
        | "awaiting_counter_payment"
        | "payment_processing"
        | "paid"
        | "cancelled"
        | "expired"
        | "payment_unknown"
        | "refunded_partial"
        | "refunded_full"
      estado_trabajo_impresion:
        | "pending"
        | "claimed"
        | "printing"
        | "printed"
        | "retry"
        | "failed"
        | "cancelled"
      estado_transaccion_pago:
        | "created"
        | "pending"
        | "processing"
        | "authorized"
        | "declined"
        | "cancelled"
        | "expired"
        | "unknown"
        | "refunded_partial"
        | "refunded_full"
      metodo_pago: "clip" | "efectivo" | "tarjeta" | "cortesia" | "otro"
      modo_pago_kiosko: "clip" | "pagar_en_caja" | "demo" | "cajero"
      tipo_almacen: "bodega" | "kiosko"
      tipo_conexion_impresora: "usb" | "red"
      tipo_cupon: "mancuernas" | "cumpleanos"
      tipo_documento_impresion: "comanda" | "ticket"
      tipo_insumo: "proteina" | "shake" | "alimento" | "empaque" | "reventa"
      tipo_mancuerna: "ganadas" | "canje" | "ajuste" | "promo" | "proximidad"
      tipo_movimiento: "compra" | "venta" | "traspaso" | "ajuste" | "merma"
      tipo_promocion: "descuento_pct" | "descuento_monto" | "producto_gratis"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ancho_papel: ["58mm", "80mm"],
      canal_orden: ["kiosko", "pos", "delivery"],
      estado_cocina: [
        "pendiente",
        "en_preparacion",
        "listo",
        "entregado",
        "cancelado",
      ],
      estado_corte: ["abierta", "cerrada"],
      estado_cupon: ["activo", "usado", "expirado", "cancelado"],
      estado_orden: [
        "pendiente",
        "en_preparacion",
        "lista",
        "entregada",
        "cancelada",
      ],
      estado_pago: ["pendiente", "aprobado", "rechazado", "cancelado"],
      estado_pago_orden: [
        "draft",
        "pending_payment",
        "awaiting_counter_payment",
        "payment_processing",
        "paid",
        "cancelled",
        "expired",
        "payment_unknown",
        "refunded_partial",
        "refunded_full",
      ],
      estado_trabajo_impresion: [
        "pending",
        "claimed",
        "printing",
        "printed",
        "retry",
        "failed",
        "cancelled",
      ],
      estado_transaccion_pago: [
        "created",
        "pending",
        "processing",
        "authorized",
        "declined",
        "cancelled",
        "expired",
        "unknown",
        "refunded_partial",
        "refunded_full",
      ],
      metodo_pago: ["clip", "efectivo", "tarjeta", "cortesia", "otro"],
      modo_pago_kiosko: ["clip", "pagar_en_caja", "demo", "cajero"],
      tipo_almacen: ["bodega", "kiosko"],
      tipo_conexion_impresora: ["usb", "red"],
      tipo_cupon: ["mancuernas", "cumpleanos"],
      tipo_documento_impresion: ["comanda", "ticket"],
      tipo_insumo: ["proteina", "shake", "alimento", "empaque", "reventa"],
      tipo_mancuerna: ["ganadas", "canje", "ajuste", "promo", "proximidad"],
      tipo_movimiento: ["compra", "venta", "traspaso", "ajuste", "merma"],
      tipo_promocion: ["descuento_pct", "descuento_monto", "producto_gratis"],
    },
  },
} as const
