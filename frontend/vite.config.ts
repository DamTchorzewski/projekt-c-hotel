import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // VITE_BASE ustawia hosting pod własnym adresem, domyślnie budujemy pod GitHub Pages. (DamianTchorzewski_72206)
  base:
    process.env.VITE_BASE ?? (command === 'build' ? '/projekt-c-hotel/' : '/'),
}))
