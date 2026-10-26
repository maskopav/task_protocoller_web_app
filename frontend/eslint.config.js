import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // public/ holds vendored minified bundles (flac, vad); coverage/ is generated output.
  globalIgnores(['dist', 'coverage', 'public']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // eslint-plugin-react-hooks 7 added React Compiler rules. purity and static-components
      // are on. The three below stay off: fixing them means restructuring components
      // (set-state-in-effect: 49 violations, refs: 11, immutability: 1 = the countdown effect in
      // useVoiceRecorder that calls stopRecording before its declaration; moving it would reorder
      // effects in the recorder).
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'error',
      'react-hooks/static-components': 'error',
      'react-hooks/immutability': 'off',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
