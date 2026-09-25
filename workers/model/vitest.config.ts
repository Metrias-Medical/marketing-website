import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Tests run inside workerd with the bindings from wrangler.toml (MODEL_KV is a local, in-memory
// namespace). Secrets are generated at random per test run in test/helpers.ts, never written
// here. Attio, PostHog, Resend and DoH are stubbed with a fetch mock; ASSETS is an in-memory stub.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
