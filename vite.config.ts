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
      minify: false, // set true to minify in prod
    }),
  ],
})
