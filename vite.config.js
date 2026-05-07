import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8012',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
