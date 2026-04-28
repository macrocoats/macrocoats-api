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
    displayName:    'Sundaram Fasteners Ltd',
    accessToken:    'sf9Np4xRmKvL7wYtA3bZeJ2Q',
    allowedProducts: ['uniklean-sp'],
    contactPerson:  'Meena Raghunathan',
    email:          'purchase@sundaramfasteners.com',
    phone:          '9600034567',
    gstNumber:      '33AABCS7890K1Z6',
    address:        '98-A, VII Floor, Dr. Radhakrishnan Salai, Mylapore',
    city:           'Chennai',
    state:          'Tamil Nadu',
    pincode:        '600004',
  },
]

const SUPERADMIN_TOKEN = 'mc2024Xp7NrK9L3vQeJbF2wTa'

export async function seedCompanies() {
  console.log('🌱 Seeding companies and users...')

  for (const co of SEED_COMPANIES) {
    // Upsert company
    const [existing] = await db.select().from(companies).where(eq(companies.key, co.key))

    let companyId: string

    const contactPatch = {
      displayName:   co.displayName,
      contactPerson: co.contactPerson ?? null,
      email:         co.email ?? null,
      phone:         co.phone ?? null,
      gstNumber:     co.gstNumber ?? null,
      address:       co.address ?? null,
      city:          co.city ?? null,
      state:         co.state ?? null,
      pincode:       co.pincode ?? null,
    }

    if (existing) {
      companyId = existing.id
      await db.update(companies).set(contactPatch).where(eq(companies.id, companyId))
      console.log(`   ↩️  Updated contact fields for: ${co.key}`)
    } else {
      const [inserted] = await db
        .insert(companies)
        .values({ key: co.key, accessToken: co.accessToken, ...contactPatch })
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
