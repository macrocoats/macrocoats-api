// Ported from safteyDataSheet/src/config/ghs.jsx (GHS_PRINT_DIAMOND, GHS_P_DESCRIPTIONS)
// and safteyDataSheet/src/pages/Products/MSDSPage.jsx (parseStatements / pGroups) so the
// downloaded MSDS PDF renders hazard pictograms and statements identically to print-to-PDF.

export const GHS_PRINT_DIAMOND_SVG: Record<string, string> = {
  flammable: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
    <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="#cc2222" stroke-width="5"/>
    <path d="M50 78C40 72 34 60 37 50C38 46 41 42 42 37C44 42 42 49 46 53C47 45 51 40 52 34C55 42 53 51 57 55C61 48 59 41 57 35C63 43 65 53 61 63C63 57 64 51 62 45C67 54 65 66 59 73C55 76 52 78 50 78Z" fill="#1b2b3b"/>
  </svg>`,
  skull: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
    <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="#cc2222" stroke-width="5"/>
    <ellipse cx="50" cy="42" rx="20" ry="17" fill="#1b2b3b"/>
    <ellipse cx="42" cy="40" rx="6" ry="6" fill="white"/>
    <ellipse cx="58" cy="40" rx="6" ry="6" fill="white"/>
    <path d="M46 49L54 49L50 55Z" fill="white"/>
    <rect x="37" y="56" width="26" height="9" rx="2" fill="#1b2b3b"/>
    <rect x="43" y="56" width="5" height="9" fill="white"/>
    <rect x="52" y="56" width="5" height="9" fill="white"/>
    <line x1="28" y1="72" x2="72" y2="82" stroke="#1b2b3b" stroke-width="5" stroke-linecap="round"/>
    <line x1="72" y1="72" x2="28" y2="82" stroke="#1b2b3b" stroke-width="5" stroke-linecap="round"/>
    <circle cx="28" cy="72" r="4" fill="#1b2b3b"/>
    <circle cx="72" cy="72" r="4" fill="#1b2b3b"/>
    <circle cx="28" cy="82" r="4" fill="#1b2b3b"/>
    <circle cx="72" cy="82" r="4" fill="#1b2b3b"/>
  </svg>`,
  irritant: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
    <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="#cc2222" stroke-width="5"/>
    <rect x="45" y="22" width="10" height="34" rx="5" fill="#1b2b3b"/>
    <circle cx="50" cy="70" r="7" fill="#1b2b3b"/>
  </svg>`,
  healthhazard: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
    <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="#cc2222" stroke-width="5"/>
    <circle cx="50" cy="26" r="9" fill="#1b2b3b"/>
    <path d="M32 65Q32 46 50 42Q68 46 68 65Z" fill="#1b2b3b"/>
    <polygon points="50,30 52,36 58,36 53,40 55,46 50,42 45,46 47,40 42,36 48,36" fill="white"/>
  </svg>`,
  environment: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
    <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="#cc2222" stroke-width="5"/>
    <line x1="18" y1="76" x2="82" y2="76" stroke="#1b2b3b" stroke-width="3"/>
    <path d="M18 63q8-14 18-10Q32 42 38 36q6 6 4 15q6-4 10 2Q44 59 42 69q-10-4-18 0Z" fill="#1b2b3b"/>
    <line x1="70" y1="76" x2="70" y2="48" stroke="#1b2b3b" stroke-width="3"/>
    <ellipse cx="70" cy="42" rx="10" ry="8" fill="#1b2b3b"/>
  </svg>`,
  corrosive: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
    <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="#cc2222" stroke-width="5"/>
    <path d="M22 24v12q0 10 10 10h4q2 10-4 18-4 8-1 14" fill="none" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M32 78h12" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M52 44q8 0 8-10V24" fill="none" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <rect x="60" y="20" width="16" height="5" rx="2" fill="#1b2b3b"/>
    <line x1="68" y1="25" x2="68" y2="34" stroke="#1b2b3b" stroke-width="3"/>
    <ellipse cx="68" cy="44" rx="9" ry="8" fill="none" stroke="#1b2b3b" stroke-width="3.5"/>
  </svg>`,
  oxidiser: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
    <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="#cc2222" stroke-width="5"/>
    <circle cx="50" cy="44" r="14" fill="none" stroke="#1b2b3b" stroke-width="3.5"/>
    <line x1="50" y1="26" x2="50" y2="18" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="66" y1="32" x2="72" y2="26" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="70" y1="44" x2="78" y2="44" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="22" y1="44" x2="30" y2="44" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="34" y1="32" x2="28" y2="26" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M38 58Q50 72 62 58" fill="none" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="50" y1="72" x2="50" y2="80" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`,
  explosive: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="46" height="46">
    <polygon points="50,4 96,50 50,96 4,50" fill="white" stroke="#cc2222" stroke-width="5"/>
    <circle cx="50" cy="60" r="22" fill="#1b2b3b"/>
    <path d="M50 38Q58 24 68 20" fill="none" stroke="#1b2b3b" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="70" cy="18" r="4" fill="#1b2b3b"/>
    <line x1="70" y1="12" x2="70" y2="8" stroke="#1b2b3b" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="75" y1="14" x2="78" y2="11" stroke="#1b2b3b" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="77" y1="19" x2="81" y2="19" stroke="#1b2b3b" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
};

export const GHS_P_DESCRIPTIONS: Record<string, string> = {
  P201: 'Obtain special instructions before use.',
  P202: 'Do not handle until all safety precautions have been read and understood.',
  P210: 'Keep away from heat, hot surfaces, sparks, open flames and other ignition sources. No smoking.',
  P211: 'Do not spray on an open flame or other ignition source.',
  P220: 'Keep away from clothing and other combustible materials.',
  P221: 'Take precautionary measures against mixing with combustibles.',
  P230: 'Keep wetted with appropriate material.',
  P231: 'Handle and store contents under inert gas.',
  P232: 'Protect from moisture.',
  P233: 'Keep container tightly closed.',
  P234: 'Keep only in original packaging.',
  P235: 'Keep cool.',
  P240: 'Ground and bond container and receiving equipment.',
  P241: 'Use explosion-proof electrical/ventilating/lighting equipment.',
  P242: 'Use non-sparking tools.',
  P243: 'Take precautionary measures against static discharge.',
  P250: 'Do not subject to grinding, shock or friction.',
  P251: 'Do not pierce or burn, even after use.',
  P260: 'Do not breathe dust/fume/gas/mist/vapours/spray.',
  P261: 'Avoid breathing dust/fume/gas/mist/vapours/spray.',
  P262: 'Do not get in eyes, on skin, or on clothing.',
  P264: 'Wash hands thoroughly after handling.',
  P270: 'Do not eat, drink or smoke when using this product.',
  P271: 'Use only outdoors or in a well-ventilated area.',
  P272: 'Contaminated work clothing should not be allowed out of the workplace.',
  P273: 'Avoid release to the environment.',
  P280: 'Wear protective gloves/protective clothing/eye protection/face protection.',
  P281: 'Use personal protective equipment as required.',
  P282: 'Wear cold insulating gloves and either face shield or eye protection.',
  P283: 'Wear fire-resistant/flame-retardant clothing.',
  P284: 'Wear respiratory protection.',
  'P301+P310': 'IF SWALLOWED: Immediately call a POISON CENTER or doctor/physician.',
  'P301+P312': 'IF SWALLOWED: Call a POISON CENTER or doctor/physician if you feel unwell.',
  'P301+P330+P331': 'IF SWALLOWED: Rinse mouth. Do NOT induce vomiting.',
  'P302+P352': 'IF ON SKIN: Wash with plenty of soap and water.',
  'P303+P361+P353': 'IF ON SKIN (or hair): Remove/Take off immediately all contaminated clothing. Rinse skin with water/shower.',
  'P304+P340': 'IF INHALED: Remove person to fresh air and keep comfortable for breathing.',
  'P304+P341': 'IF INHALED: If breathing is difficult, remove to fresh air and keep at rest in a position comfortable for breathing.',
  'P305+P351+P338': 'IF IN EYES: Rinse cautiously with water for several minutes. Remove contact lenses if present and easy to do. Continue rinsing.',
  'P308+P313': 'IF exposed or concerned: Get medical advice/attention.',
  P310: 'Immediately call a POISON CENTER or doctor/physician.',
  P311: 'Call a POISON CENTER or doctor/physician.',
  P312: 'Call a POISON CENTER or doctor/physician if you feel unwell.',
  P313: 'Get medical advice/attention.',
  P314: 'Get medical advice/attention if you feel unwell.',
  P315: 'Get immediate medical advice/attention.',
  P321: 'Specific treatment (see first aid measures on this label).',
  P330: 'Rinse mouth.',
  P331: 'Do NOT induce vomiting.',
  'P332+P313': 'If skin irritation occurs: Get medical advice/attention.',
  'P333+P313': 'If skin irritation or rash occurs: Get medical advice/attention.',
  'P337+P313': 'If eye irritation persists: Get medical advice/attention.',
  P338: 'Remove contact lenses, if present and easy to do. Continue rinsing.',
  P340: 'Remove person to fresh air and keep comfortable for breathing.',
  P352: 'Wash with plenty of soap and water.',
  P362: 'Take off contaminated clothing and wash before reuse.',
  P363: 'Wash contaminated clothing before reuse.',
  'P370+P378': 'In case of fire: Use appropriate media to extinguish.',
  P391: 'Collect spillage.',
  P401: 'Store in accordance with local regulations.',
  P402: 'Store in a dry place.',
  P403: 'Store in a well-ventilated place.',
  'P403+P233': 'Store in a well-ventilated place. Keep container tightly closed.',
  'P403+P235': 'Store in a well-ventilated place. Keep cool.',
  P404: 'Store in a closed container.',
  P405: 'Store locked up.',
  P410: 'Protect from sunlight.',
  'P410+P403': 'Protect from sunlight. Store in a well-ventilated place.',
  P412: 'Do not expose to temperatures exceeding 50°C/122°F.',
  P420: 'Store separately.',
  P501: 'Dispose of contents/container in accordance with local regulations.',
  P502: 'Refer to manufacturer or supplier for information on recovery or recycling.',
};

export interface ParsedStatement {
  code: string;
  text: string;
}

/** Mirrors MSDSPage.jsx's parseStatements(): splits "CODE — text · CODE — text" into entries. */
export function parseStatements(raw: string | null | undefined): ParsedStatement[] {
  return (raw ?? '')
    .split(' · ')
    .filter(Boolean)
    .map((stmt) => {
      const [code, ...rest] = stmt.split(' — ');
      const parsedCode = (code ?? '').trim();
      const parsedText = rest.join(' — ') || GHS_P_DESCRIPTIONS[parsedCode] || '';
      return { code: parsedCode, text: parsedText };
    });
}

export interface PGroups {
  prevention: ParsedStatement[];
  response: ParsedStatement[];
  storage: ParsedStatement[];
  disposal: ParsedStatement[];
}

/** Mirrors MSDSPage.jsx's pGroups: buckets precautionary statements by P-code prefix. */
export function groupPrecautionary(pStmts: ParsedStatement[]): PGroups {
  return {
    prevention: pStmts.filter((p) => /^P2/.test(p.code)),
    response: pStmts.filter((p) => /^P3/.test(p.code)),
    storage: pStmts.filter((p) => /^P4/.test(p.code)),
    disposal: pStmts.filter((p) => /^P5/.test(p.code)),
  };
}
