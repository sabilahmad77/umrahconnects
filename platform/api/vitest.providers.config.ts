import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Provider integration tests against local stand-ins (stripe-mock, MinIO, Mailpit).
// Each suite skips unless its *_TEST_* endpoint variable is set. See docs/control-tower/LOCAL_TEST_GUIDE.md.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/providers/**/*.int-spec.ts'],
    environment: 'node',
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
