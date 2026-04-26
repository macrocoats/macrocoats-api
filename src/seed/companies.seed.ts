import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { companies, companyProductAccess, users } from '../db/schema/index.js'
import { hashPassword } from '../utils/crypto.js'

/**
 * IMPORTANT: These are the initial seed tokens.
 * In production, rotate all tokens immediately after first deploy via:
 *   POST /v1/companies/:id/rotate-token
 * Then remove this file from source control.
 */
const SEED_COMPANIES = [
  {
    key:            'rane',
    displayName:    'Rane',
    accessToken:    'r7Kx9mNpQ2wLvYtA8bZeJ3dF',
    allowedProducts: ['uniklean-sp', 'uniklean-fe', 'uniflow-ecm', 'uniprotect-oil'],
  },
  {
    key:            'sanmar',
    displayName:    'Sanmar',
    accessToken:    'sN4wP8tRmXkL2vBqA7cYeJ5G',
    allowedProducts: ['uniklean-sp'],
  },
  {
    key:            'galva',
    displayName:    'Galva',
    accessToken:    'gL3mQ9xNvKpR7wYtA2bZeJ8F',
    allowedProducts: ['unicool-al'],
  },
  {
    key:            'tvs',
    displayName:    'TVS',
    accessToken:    'tV5kR2mNpQ8wLxYtA7bZeJ4G',
    allowedProducts: ['uniklean-sp', 'uniklean-fe', 'uniprotect-oil'],
  },
  {
    key:            'sundaramfasteners',
    displayName:    'Sundaram Fasteners',
    accessToken:    'sf9Np4xRmKvL7wYtA3bZeJ2Q',
    allowedProducts: ['uniklean-sp'],
  },
]

const SUPERADMIN_TOKEN = 'mc2024Xp7NrK9L3vQeJbF2wTa'

export async function seedCompanies() {
  console.log('🌱 Seeding companies and users...')

  for (const co of SEED_COMPANIES) {
    // Upsert company
    const [existing] = await db.select().from(companies).where(eq(companies.key, co.key))

    let companyId: string

    if (existing) {
      companyId = existing.id
      console.log(`   ↩️  Company already exists: ${co.key}`)
    } else {
      const [inserted] = await db
        .insert(companies)
        .values({ key: co.key, displayName: co.displayName, accessToken: co.accessToken })
        .returning()
      companyId = inserted.id
      console.log(`   ✅ Created company: ${co.key}`)
    }

    // Replace product access rows
    await db.delete(companyProductAccess).where(eq(companyProductAccess.companyId, companyId))
    if (co.allowedProducts.length) {
      await db.insert(companyProductAccess).values(
        co.allowedProducts.map((productKey) => ({ companyId, productKey })),
      )
    }

    // Upsert company user (username = company key, password = access token)
    const [existingUser] = await db.select().from(users).where(eq(users.username, co.key))
    if (!existingUser) {
      const passwordHash = await hashPassword(co.accessToken)
      await db.insert(users).values({
        name:     co.displayName,
        username: co.key,
        passwordHash,
        role:     'company',
        companyId,
      })
      console.log(`   ✅ Created user: ${co.key}`)
    }
  }

  // Superadmin user
  const [existingAdmin] = await db.select().from(users).where(eq(users.username, 'admin'))
  if (!existingAdmin) {
    const passwordHash = await hashPassword(SUPERADMIN_TOKEN)
    await db.insert(users).values({
      name:         'Super Admin',
      username:     'admin',
      passwordHash,
      role:         'superadmin',
      companyId:    null,
    })
    console.log('   ✅ Created superadmin user (username: admin)')
  } else {
    console.log('   ↩️  Superadmin user already exists')
  }

  console.log(`   ✅ Seeded ${SEED_COMPANIES.length} companies`)
}
