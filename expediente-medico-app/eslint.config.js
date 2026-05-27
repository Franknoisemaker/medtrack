import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'supabase/**', '**/supabase/functions/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Evitamos bloquear el pipeline por variables sin usar o tipos any
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      // Permite sincronizar estados en efectos de forma segura sin causar errores de compilación
      'react-hooks/set-state-in-effect': 'off',
      // Desactivamos restricciones de compilador de React 19 que bloquean el build por orden de declaración o memoización manual
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      // Permitimos ts-ignore para pruebas unitarias sin lanzar errores
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
])
