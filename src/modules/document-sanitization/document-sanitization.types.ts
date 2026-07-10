/** Minimal component shape consumed by the sanitization derivation functions. */
export interface RawComponent {
  materialName: string
  percentage:   number | null
  unit?:        'L' | 'Kg'
}

export interface SanitizedTdsCompositionRow {
  name:     string
  function: string
  percent:  string
  compat:   string
}

export interface SanitizedMsdsIngredientRow {
  name:        string
  description: string
  percent:     string
  ghsClass:    string
  tagType:     string
}

export interface MsdsIngredientDisclosure {
  ingredients: SanitizedMsdsIngredientRow[]
  note:        string
}

export interface HazardClassificationUnion {
  class:    string
  category: string
  tagType:  string
}

export interface HazardAggregate {
  pictograms:      string[]
  classifications: HazardClassificationUnion[]
  hStatements:     string
  pStatements:     string
  signalWord:      'DANGER' | 'Warning'
}

/** Per-ingredient breakdown of which classification was triggered — internal/QA view only. */
export interface InternalHazardBreakdownEntry {
  materialName:    string
  percentage:      number | null
  matched:         boolean
  triggeredClasses: HazardClassificationUnion[]
}

export interface InternalCompositionRow {
  materialName: string
  percentage:   number | null
  unit:         string | undefined
}
