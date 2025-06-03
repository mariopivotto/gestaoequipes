// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // NENHUM PLUGIN RELACIONADO A TAILWIND/POSTCSS AQUI
  ],
  build: {
    chunkSizeWarningLimit: 1000,
  },
})