// The containers a liquid batch can be filled into. A batch stores a copy of
// its container (see createBatch), so changing a tare here never rewrites a
// batch that already exists. Served to the UI by GET /batches/pack-containers.
export const PACK_CONTAINERS = [
  { id: 'can-30-blue',    name: '30 L blue can',     capacityL: 30,  tareKg: 1.8 },
  { id: 'can-30-grey',    name: '30 L grey can',     capacityL: 30,  tareKg: 2 },
  { id: 'can-50',         name: '50 L can',          capacityL: 50,  tareKg: 2.5 },
  { id: 'drum-210-steel', name: '210 L steel drum',  capacityL: 210, tareKg: 18.25 },
  { id: 'drum-210-plastic', name: '210 L plastic drum', capacityL: 210, tareKg: 8 },
] as const

export type PackContainerId = typeof PACK_CONTAINERS[number]['id']

export const PACK_CONTAINER_IDS = PACK_CONTAINERS.map((c) => c.id) as [PackContainerId, ...PackContainerId[]]

export const findPackContainer = (id?: string) => PACK_CONTAINERS.find((c) => c.id === id)
