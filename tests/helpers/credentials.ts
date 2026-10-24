// Passwords of the seeded admin/operator users — the same env vars the seed reads
// (src/seed/companies.seed.ts), so tests never carry real credentials in source.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set to run the integration tests (see .env.local)`)
  return value
}

export const ADMIN_PASSWORD    = requireEnv('SEED_ADMIN_PASSWORD')
export const OPERATOR_PASSWORD = requireEnv('SEED_OPERATOR_PASSWORD')
