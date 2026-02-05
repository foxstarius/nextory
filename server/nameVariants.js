// Name variants service - fetches alternative spellings from Wikidata
// Uses simple in-memory cache

const cache = new Map();

// Wikidata SPARQL endpoint
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';

/**
 * Check if a string contains only Latin characters (a-z, common accents)
 */
function isLatinName(str) {
  // Allow basic Latin, extended Latin (åäö, é, etc.), spaces, hyphens
  return /^[a-zA-ZÀ-ÿ\s\-']+$/.test(str);
}

/**
 * Fetches name variants from Wikidata for a given first name
 * Caches ALL variants so future lookups for any name in the family are instant
 */
export async function getNameVariants(firstName) {
  const normalizedName = firstName.toLowerCase().trim();

  // Check cache first (includes pre-loaded common variants)
  if (cache.has(normalizedName)) {
    return cache.get(normalizedName);
  }

  try {
    // SPARQL query - search multiple given name types and get P460 relationships
    // Q12308941 = male given name, Q11879590 = female given name, Q202444 = given name
    const capitalizedName = normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1);
    const query = `
      SELECT DISTINCT ?variantLabel WHERE {
        VALUES ?types { wd:Q12308941 wd:Q11879590 wd:Q202444 }
        ?name wdt:P31 ?types .
        ?name rdfs:label "${capitalizedName}"@en .

        # Get "said to be the same as" names
        ?name wdt:P460 ?variant .
        ?variant rdfs:label ?variantLabel .
        FILTER(LANG(?variantLabel) = "en" || LANG(?variantLabel) = "sv")
      }
      LIMIT 30
    `;

    const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'NextorySearchDemo/1.0 (contact: demo@example.com)',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`  Wikidata timeout/error for "${firstName}", using fallback`);
      cache.set(normalizedName, []);
      return [];
    }

    const data = await response.json();

    // Extract unique variants, filter to Latin characters only
    const allVariants = [...new Set(
      data.results.bindings
        .map(b => b.variantLabel?.value?.toLowerCase())
        .filter(Boolean)
        .filter(isLatinName)
        .filter(v => v.length >= 2 && v.length <= 20)
    )];

    // Build the complete name family (including the searched name)
    const nameFamily = [...new Set([normalizedName, ...allVariants])];

    // Cache ALL names in the family with their variants (excluding themselves)
    // This way, looking up "Christopher" also caches "Kristoffer", "Christoph", etc.
    for (const name of nameFamily) {
      if (!cache.has(name)) {
        const variantsForThisName = nameFamily.filter(v => v !== name);
        cache.set(name, variantsForThisName);
      }
    }

    // Return variants for the originally requested name
    const variants = nameFamily.filter(v => v !== normalizedName);

    if (variants.length > 0) {
      console.log(`  ✓ Wikidata: "${firstName}" → ${variants.slice(0, 5).join(', ')}${variants.length > 5 ? ` (+${variants.length - 5} more)` : ''} [cached ${nameFamily.length} names]`);
    } else {
      console.log(`  · Wikidata: "${firstName}" → (no variants found)`);
    }

    return variants;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`  ⏱ Wikidata timeout for "${firstName}"`);
    } else {
      console.log(`  ✗ Wikidata error for "${firstName}": ${error.message}`);
    }
    cache.set(normalizedName, []);
    return [];
  }
}

/**
 * Extracts first name from full author name
 */
export function extractFirstName(fullName) {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || null;
}

/**
 * Initialize cache (empty - will be populated from Wikidata during indexing)
 */
export function initializeCommonVariants() {
  // Cache starts empty - populated dynamically from Wikidata during seed
  console.log('Name variants cache initialized (empty - will populate from Wikidata)');
}

/**
 * Get cache stats
 */
export function getCacheStats() {
  return {
    size: cache.size,
    entries: [...cache.keys()],
  };
}

// Initialize common variants on module load
initializeCommonVariants();
