import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Provider integration tests against local stand-ins (stripe-mock, MinIO, Mailpit).
// Each suite skips unless its *_TEST_* endpoint variable is set — so `pnpm test:providers`
// and CI set PROVIDER_TESTS_REQUIRED=true, and test/providers/global-setup.ts then fails
// the run when a stand-in is missing instead of letting it report an empty pass.
// See docs/control-tower/LOCAL_TEST_GUIDE.md.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/providers/**/*.int-spec.ts'],
    environment: 'node',
    globalSetup: ['test/providers/global-setup.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
