import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { companies, companyProductAccess, users } from '../db/schema/index.js'
import { env } from '../config/env.js'
import { generateToken, hashPassword } from '../utils/crypto.js'

/**
 * IMPORTANT: These are the initial seed tokens.
 * In production, rotate all tokens immediately after first deploy via:
 *   POST /v1/companies/:id/rotate-token
 * Then remove this file from source control.
 */
const SEED_COMPANIES = [
  {
    key:            'rane',
    displayName:    'Rane Industries Ltd',
    accessToken:    'r7Kx9mNpQ2wLvYtA8bZeJ3dF',
    allowedProducts: ['uniklean-sp', 'uniklean-fe', 'uniflow-ecm', 'uniprotect-oil'],
    contactPerson:  'Ravi Kumar',
    email:          'procurement@raneindustries.in',
    phone:          '9444012345',
    gstNumber:      '33AABCR1234F1Z5',
    address:        'No. 12, Raneipuram Industrial Estate, Ambattur',
    city:           'Chennai',
    state:          'Tamil Nadu',
    pincode:        '600058',
  },
  {
    key:            'sanmar',
    displayName:    'Sanmar Group',
    accessToken:    'sN4wP8tRmXkL2vBqA7cYeJ5G',
    allowedProducts: ['uniklean-sp'],
    contactPerson:  'Priya Shankar',
    email:          'chemicals@sanmargroup.com',
    phone:          '9840056789',
    gstNumber:      '33AADCS5678G1Z2',
    address:        'Sanmar House, 23 Cathedral Road',
    city:           'Chennai',
    state:          'Tamil Nadu',
    pincode:        '600086',
  },
  {
    key:            'galva',
    displayName:    'Galva Industries',
    accessToken:    'gL3mQ9xNvKpR7wYtA2bZeJ8F',
    allowedProducts: ['unicool-al'],
    contactPerson:  'Suresh Babu',
    email:          'ops@galvaindustries.in',
    phone:          '9500078901',
    gstNumber:      '33AABCG9012H1Z8',
    address:        'Plot 7, SIPCOT Industrial Complex, Gummidipoondi',
    city:           'Chennai',
    state:          'Tamil Nadu',
    pincode:        '601201',
  },
  {
    key:            'tvs',
    displayName:    'TVS Motor Company',
    accessToken:    'tV5kR2mNpQ8wLxYtA7bZeJ4G',
    allowedProducts: ['uniklean-sp', 'uniklean-fe', 'uniprotect-oil'],
    contactPerson:  'Anand Krishnamurthy',
    email:          'vendor@tvsmotor.com',
    phone:          '9751023456',
    gstNumber:      '33AABCT3456J1Z4',
    address:        'Jayalakshmi Estates, 29 Haddows Road',
    city:           'Hosur',
    state:          'Tamil Nadu',
    pincode:        '635109',
  },
  {
    key:            'sundaramfasteners',
    displayName:    'Sundram Fasteners Limited (SEZ Unit)',
    accessToken:    'sf9Np4xRmKvL7wYtA3bZeJ2Q',
    allowedProducts: ['uniklean-sp'],
    contactPerson:  'Meena Raghunathan',
    email:          'purchase@sundaramfasteners.com',
    phone:          '+91 44 27460702',
    gstNumber:      '33AAACS8779D2Z6',
    address:        'AA1, Central Avenue, Auto Ancillary SEZ, Mahindra World City, Natham Post, Kancheepuram District',
    city:           'Chengalpet',
    state:          'Tamil Nadu',
    pincode:        '603002',
  },
]

/**
 * Password for a seeded staff user, from env. Outside production a missing value
 * falls back to a random one printed once; in production the user is not created.
 */
function seedPassword(envName: 'SEED_ADMIN_PASSWORD' | 'SEED_OPERATOR_PASSWORD'): string | null {
  const fromEnv = env[envName]
  if (fromEnv) return fromEnv
  if (env.NODE_ENV === 'production') return null
  const generated = generateToken(18)
  console.log(`   🔑 ${envName} not set — generated password: ${generated}`)
  return generated
}

export async function seedCompanies() {
  console.log('🌱 Seeding companies and users...')

  // SEED_COMPANIES are test fixtures whose access tokens (and so their users'
  // passwords) live in source control. Production companies are managed through
  // the admin UI — a production seed run once recreated a test company deleted
  // there months earlier, along with a working repo-known login.
  const seedTestCompanies = process.env.NODE_ENV !== 'production'
  if (!seedTestCompanies) {
    console.log(`   ⏭️  NODE_ENV=production — skipping ${SEED_COMPANIES.length} test companies`)
  }

  for (const co of seedTestCompanies ? SEED_COMPANIES : []) {
    const [existing] = await db.select().from(companies).where(eq(companies.key, co.key))

    let companyId: string

    if (existing) {
      companyId = existing.id
      console.log(`   ↩️  Company already exists, skipping: ${co.key}`)
    } else {
      const [inserted] = await db
        .insert(companies)
        .values({
          key:           co.key,
          accessToken:   co.accessToken,
          displayName:   co.displayName,
          contactPerson: co.contactPerson ?? null,
          email:         co.email ?? null,
          phone:         co.phone ?? null,
          gstNumber:     co.gstNumber ?? null,
          address:       co.address ?? null,
          city:          co.city ?? null,
          state:         co.state ?? null,
          pincode:       co.pincode ?? null,
        })
        .returning()
      companyId = inserted.id
      console.log(`   ✅ Created company: ${co.key}`)
    }

    // Insert only missing product access rows
    const existingAccess = await db
      .select({ productKey: companyProductAccess.productKey })
      .from(companyProductAccess)
      .where(eq(companyProductAccess.companyId, companyId))
    const existingProductKeys = new Set(existingAccess.map((r) => r.productKey))

    const missingAccess = co.allowedProducts.filter((pk) => !existingProductKeys.has(pk))
    if (missingAccess.length > 0) {
      await db.insert(companyProductAccess).values(
        missingAccess.map((productKey) => ({ companyId, productKey })),
      )
      console.log(`   ✅ Added product access for ${co.key}: ${missingAccess.join(', ')}`)
    }

    // Insert company user only if not exists
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
  const adminPassword = existingAdmin ? null : seedPassword('SEED_ADMIN_PASSWORD')
  if (!existingAdmin && !adminPassword) {
    console.warn('   ⚠️  SEED_ADMIN_PASSWORD not set — superadmin user NOT created')
  } else if (!existingAdmin && adminPassword) {
    const passwordHash = await hashPassword(adminPassword)
    await db.insert(users).values({
      name:         'Aswin Kumar S',
      username:     'admin',
      passwordHash,
      role:         'superadmin',
      companyId:    null,
    })
    console.log('   ✅ Created superadmin user (username: admin)')
  } else {
    console.log('   ↩️  Superadmin user already exists')
  }

  // Factory Operator user — batches/finished-goods/dispatch/production-planning
  // access only, no pricing/formula visibility. See root CLAUDE.md's RBAC notes.
  const [existingOperator] = await db.select().from(users).where(eq(users.username, 'operator'))
  const operatorPassword = existingOperator ? null : seedPassword('SEED_OPERATOR_PASSWORD')
  if (!existingOperator && !operatorPassword) {
    console.warn('   ⚠️  SEED_OPERATOR_PASSWORD not set — operator user NOT created')
  } else if (!existingOperator && operatorPassword) {
    const passwordHash = await hashPassword(operatorPassword)
    await db.insert(users).values({
      name:         'Factory Operator',
      username:     'operator',
      passwordHash,
      role:         'operator',
      companyId:    null,
    })
    console.log('   ✅ Created operator user (username: operator)')
  } else {
    console.log('   ↩️  Operator user already exists')
  }

  if (seedTestCompanies) console.log(`   ✅ Seeded ${SEED_COMPANIES.length} companies`)
}
