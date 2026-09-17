import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit tests: pure logic, no database.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: false,
  },
});
