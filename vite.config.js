import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5179,
    strictPort: true,
    host: '127.0.0.1'
  },
  assetsInclude: ['**/*.glsl']
});
