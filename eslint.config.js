// Lint plano para todo el monorepo (8 apps + paquetes compartidos).
// Reglas mínimas pero reales: nada de `any` implícito silenciado, hooks de
// React usados correctamente, sin variables/imports muertos. No es
// exhaustivo (no reemplaza `tsc --noEmit`, que ya corre en cada build) —
// es una segunda pasada de correctitud + limpieza.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'agente-impresion/dist/**',
      'apps/costos/**', // index.html estático del cliente, no TS
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off', // varios archivos exportan tipos junto al componente
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
  {
    files: ['agente-impresion/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node, no navegador: utilidades de línea de comandos, empaquetadores y
    // los agentes de la PC de la tienda. agente-banorte usa Buffer para leer
    // los campos del DLL. (agente-banorte está fuera del workspace de pnpm,
    // pero igual se lintea porque vive en el repo.)
    files: ['scripts/**/*.mjs', 'apps/agente-banorte/**/*.mjs', 'apps/agente-caja/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
  {
    // verificar-instalables.mjs evalúa código DENTRO del navegador con
    // Playwright (page.evaluate): ahí viven navigator, document y fetch.
    files: ['scripts/verificar-instalables.mjs'],
    languageOptions: {
      globals: { navigator: 'readonly', document: 'readonly', fetch: 'readonly' },
    },
  },
  {
    // Las pruebas del agente de caja comparan bytes ESC/POS crudos: las
    // expresiones regulares traen caracteres de control a propósito.
    files: ['apps/agente-caja/**/*.test.ts'],
    rules: { 'no-control-regex': 'off' },
  },
)
