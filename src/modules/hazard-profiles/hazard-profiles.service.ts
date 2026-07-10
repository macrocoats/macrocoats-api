import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { ingredientHazardProfiles } from '../../db/schema/index.js'
import { cacheGet, cacheSet, cacheDel } from '../../plugins/redis.js'
import { normalizeIngredientName } from './hazard-profiles.normalize.js'
import type { CreateHazardProfileBody, UpdateHazardProfileBody } from './hazard-profiles.schema.js'

const MAP_CACHE_KEY = 'hazard-profiles:map'
const MAP_CACHE_TTL = 300

function toResponse(row: typeof ingredientHazardProfiles.$inferSelect) {
  return {
    id:                 row.id,
    canonicalName:      row.canonicalName,
    displayName:        row.displayName,
    aliases:            row.aliases,
    casNo:              row.casNo,
    genericDescription: row.genericDescription,
    functionCategory:   row.functionCategory,
    compatNotes:        row.compatNotes,
    hazardClassifications: row.hazardClassifications,
    pictograms:         row.pictograms,
    thresholdPercent:   Number(row.thresholdPercent),
    disclosureRequired: row.disclosureRequired,
    disclosureThresholdPercent: row.disclosureThresholdPercent !== null ? Number(row.disclosureThresholdPercent) : null,
    notes:              row.notes,
    isActive:           row.isActive,
    createdAt:          row.createdAt.toISOString(),
    updatedAt:          row.updatedAt.toISOString(),
    updatedBy:          row.updatedBy,
  }
}

export type HazardProfileRow = ReturnType<typeof toResponse>

export async function listHazardProfiles(includeInactive: boolean) {
  const rows = includeInactive
    ? await db.select().from(ingredientHazardProfiles).orderBy(asc(ingredientHazardProfiles.displayName))
    : await db.select().from(ingredientHazardProfiles).where(eq(ingredientHazardProfiles.isActive, true)).orderBy(asc(ingredientHazardProfiles.displayName))

  return rows.map(toResponse)
}

export async function getHazardProfileById(id: string) {
  const [row] = await db.select().from(ingredientHazardProfiles).where(eq(ingredientHazardProfiles.id, id))
  return row ? toResponse(row) : null
}

export async function createHazardProfile(data: CreateHazardProfileBody, updatedBy: string) {
  const [row] = await db
    .insert(ingredientHazardProfiles)
    .values({
      canonicalName:      normalizeIngredientName(data.canonicalName),
      displayName:        data.displayName,
      aliases:            data.aliases ?? [],
      casNo:              data.casNo ?? null,
      genericDescription: data.genericDescription,
      functionCategory:   data.functionCategory,
      compatNotes:        data.compatNotes ?? null,
      hazardClassifications: data.hazardClassifications ?? [],
      pictograms:         data.pictograms ?? [],
      thresholdPercent:   String(data.thresholdPercent ?? 1),
      disclosureRequired: data.disclosureRequired ?? false,
      disclosureThresholdPercent: data.disclosureThresholdPercent != null ? String(data.disclosureThresholdPercent) : null,
      notes:              data.notes ?? null,
      isActive:           data.isActive ?? true,
      updatedBy,
    })
    .returning()

  await cacheDel(MAP_CACHE_KEY)
  return toResponse(row)
}

export async function updateHazardProfile(id: string, data: UpdateHazardProfileBody, updatedBy: string) {
  const patch: Partial<typeof ingredientHazardProfiles.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy,
  }
  if (data.canonicalName          !== undefined) patch.canonicalName      = normalizeIngredientName(data.canonicalName)
  if (data.displayName            !== undefined) patch.displayName        = data.displayName
  if (data.aliases                !== undefined) patch.aliases            = data.aliases
  if (data.casNo                  !== undefined) patch.casNo              = data.casNo
  if (data.genericDescription     !== undefined) patch.genericDescription = data.genericDescription
  if (data.functionCategory       !== undefined) patch.functionCategory   = data.functionCategory
  if (data.compatNotes            !== undefined) patch.compatNotes        = data.compatNotes
  if (data.hazardClassifications  !== undefined) patch.hazardClassifications = data.hazardClassifications
  if (data.pictograms             !== undefined) patch.pictograms         = data.pictograms
  if (data.thresholdPercent       !== undefined) patch.thresholdPercent   = String(data.thresholdPercent)
  if (data.disclosureRequired     !== undefined) patch.disclosureRequired = data.disclosureRequired
  if (data.disclosureThresholdPercent !== undefined) patch.disclosureThresholdPercent = data.disclosureThresholdPercent != null ? String(data.disclosureThresholdPercent) : null
  if (data.notes                  !== undefined) patch.notes              = data.notes
  if (data.isActive               !== undefined) patch.isActive           = data.isActive

  const [row] = await db
    .update(ingredientHazardProfiles)
    .set(patch)
    .where(eq(ingredientHazardProfiles.id, id))
    .returning()

  await cacheDel(MAP_CACHE_KEY)
  return row ? toResponse(row) : null
}

/** Soft-delete — sets isActive=false. Never hard-deletes the dictionary row. */
export async function deactivateHazardProfile(id: string, updatedBy: string) {
  const [row] = await db
    .update(ingredientHazardProfiles)
    .set({ isActive: false, updatedAt: new Date(), updatedBy })
    .where(eq(ingredientHazardProfiles.id, id))
    .returning()

  await cacheDel(MAP_CACHE_KEY)
  return row ? toResponse(row) : null
}

/**
 * Builds (and Redis-caches) a lookup map keyed by every normalized
 * canonicalName + alias → the owning profile row. Consumed by
 * document-sanitization.service.ts for TDS/MSDS derivation.
 */
export async function getHazardProfileMap(): Promise<Map<string, HazardProfileRow>> {
  const cached = await cacheGet<Array<[string, HazardProfileRow]>>(MAP_CACHE_KEY)
  if (cached) return new Map(cached)

  const rows = await db.select().from(ingredientHazardProfiles).where(eq(ingredientHazardProfiles.isActive, true))

  const map = new Map<string, HazardProfileRow>()
  for (const row of rows) {
    const response = toResponse(row)
    map.set(normalizeIngredientName(row.canonicalName), response)
    for (const alias of (row.aliases as string[]) ?? []) {
      map.set(normalizeIngredientName(alias), response)
    }
  }

  await cacheSet(MAP_CACHE_KEY, Array.from(map.entries()), MAP_CACHE_TTL)
  return map
}
