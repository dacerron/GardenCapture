// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [
    react(),
    glsl({
      include: ['**/*.glsl', '**/*.vert', '**/*.frag', '**/*.wgsl'],
      warnDuplicatedImports: true,
      defaultExtension: 'glsl',
      minify: false,
    }),
  ],
  assetsInclude: ['**/*.ksplat'],
  server: {
    proxy: {
        '/pins': { target: 'http://localhost:3000', changeOrigin: true },
      },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
