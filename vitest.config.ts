import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    include:     ['tests/**/*.test.ts'],
    // Run tests sequentially — integration tests share a DB
    pool:        'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter:  ['text', 'lcov'],
      include:   ['src/**'],
      exclude:   ['src/seed/**', 'src/db/migrations/**'],
    },
  },
})
