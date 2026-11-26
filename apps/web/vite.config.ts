import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const rootNodeModules = fileURLToPath(new URL('../../node_modules', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: `${rootNodeModules}/react/jsx-dev-runtime.js` },
      { find: 'react/jsx-runtime', replacement: `${rootNodeModules}/react/jsx-runtime.js` },
      { find: 'react-dom/client', replacement: `${rootNodeModules}/react-dom/client.js` },
      { find: 'react-dom', replacement: `${rootNodeModules}/react-dom` },
      { find: 'react', replacement: `${rootNodeModules}/react` },
    ],
  },
  optimizeDeps: {
    force: true,
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
  },
});