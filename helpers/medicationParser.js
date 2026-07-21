// helpers/medicationParser.js

// Map of common nurse abbreviations and names to standardized inventory names
const ABBREVIATION_MAP = {
  "pcm": "Paracetamol 500mg",
  "lorat": "Loratadine 10mg",
  "azith": "Azithromycin 500mg",
  "brufen": "Ibuprofen 400mg",
  "diclo": "Diclofenac 50mg Tablets",
  "diclo tabs": "Diclofenac 50mg Tablets",
  "diclo gel": "Diclofenac Gel",
  "gel": "Diclofenac Gel",
  "omez": "Omeprazole 20mg",
  "busco": "Buscopan 10mg",
  "amoxclav": "Amoxicillin/Clavulanate 625mg",
  "amoxcalv": "Amoxicillin/Clavulanate 625mg", // Handle common nurse typo
  "amoxcalv bd": "Amoxicillin/Clavulanate 625mg",
  "amoxcalv tds": "Amoxicillin/Clavulanate 625mg",
  "amoxyl": "Amoxicillin 250mg",
  "cetr": "Cetirizine 10mg",
  "clozole cream": "Clotrimazole Cream",
  "brustan": "Brustan Tablets",
  "eteroxib": "Etoricoxib 90mg",
  "mr tabs": "Muscle Relaxant Tablets",
  "iodine": "Iodine Antiseptic Solution",
  "ampiclox": "Ampiclox Capsule",
  "abz": "Albendazole 400mg",
  "delased": "Delased Cough Syrup",
  "mlvit": "Multivitamin Tablets",
  "hydrocort cream": "Hydrocortisone Cream",
  "salt gargles": "Salt Water Gargles",
  "crepe": "Crepe Bandage",
  "deepheat": "Deep Heat Spray/Rub",
  "allugel": "Allugel Suspension",
  "mefsun": "Mefsun Tablets",
  "pdl": "Prednisolone 5mg"
};

// Keywords to completely ignore (administrative actions, referrals, etc.)
const ADMIN_KEYWORDS = [
  "refered", "referred", "refred", "kikuyu", "hospital", "hosp", "parent", "picked", 
  "to be", "for further", "orthopedic", "open shoes", "xray"
];

// Regex for removing common frequencies and generic dosage amounts (keeping forms like tabs/gel/cream)
const DOSAGE_REGEX = /\b(bd|od|qid|tds|stat|1\s*od|1\s*bd|1\s*tds|1|2|3|4|5|od,gel|bd,gel|,\s*)\b/gi;

/**
 * Parses raw comma-separated medication text into normalized inventory items with quantities.
 * e.g., "AZITH,PCM,LORAT" -> [ { name: "Azithromycin 500mg", quantity: 1 }, { name: "Paracetamol 500mg", quantity: 1 }, ... ]
 */
function parseMedications(rawText) {
  if (!rawText) return [];

  const segments = rawText.split(/[,+;\/&]|\band\b/i);
  const normalizedItems = [];

  for (let segment of segments) {
    let cleanSegment = segment.trim().toLowerCase();

    // 1. Skip if empty or matches any administrative keywords
    if (!cleanSegment || cleanSegment === "-" || ADMIN_KEYWORDS.some(k => cleanSegment.includes(k))) {
      continue;
    }

    // 2. Extract number of units if specified (e.g. "pdl 1" or "2 tabs")
    let qty = 1;
    const qtyMatch = cleanSegment.match(/\b(1|2|3|4|5)\b/);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[0]);
    }

    // 3. Remove frequencies, forms, and quantities to leave only the raw name/abbreviation
    cleanSegment = cleanSegment.replace(DOSAGE_REGEX, "").replace(/\s+/g, " ").trim();

    // 4. Match abbreviation/shorthand to standard name
    let officialName = null;

    if (ABBREVIATION_MAP[cleanSegment]) {
      officialName = ABBREVIATION_MAP[cleanSegment];
    } else {
      // Fuzzy substring matching for keys
      const matchingKey = Object.keys(ABBREVIATION_MAP).find(abbrev => cleanSegment.includes(abbrev));
      if (matchingKey) {
        officialName = ABBREVIATION_MAP[matchingKey];
      }
    }

    if (officialName) {
      normalizedItems.push({ name: officialName, quantity: qty });
    } else {
      // Fallback: use uppercase representation of the trimmed entry
      const fallbackName = cleanSegment.toUpperCase();
      if (fallbackName.length > 1) {
        normalizedItems.push({ name: fallbackName, quantity: qty });
      }
    }
  }

  return normalizedItems;
}

module.exports = {
  parseMedications
};
