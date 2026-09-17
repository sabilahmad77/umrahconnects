import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration + security tests: full Nest app over HTTP against a disposable
// PostgreSQL database (TEST_DATABASE_URL, name must end in `_test`).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/env.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
