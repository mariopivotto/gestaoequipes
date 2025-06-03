// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' 

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss() // Garante que o plugin está aqui
  ],
  build: {
    chunkSizeWarningLimit: 1000, 
  },
})