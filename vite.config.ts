import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'canvas-vendor': ['konva', 'react-konva'],
          'io-vendor': ['jszip', 'papaparse', 'utif'],
          'schema-vendor': ['zod'],
        },
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
