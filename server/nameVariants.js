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
 * Uses a simpler, faster query that focuses on "said to be same as" relationships
 */
export async function getNameVariants(firstName) {
  const normalizedName = firstName.toLowerCase().trim();

  // Check cache first (includes pre-loaded common variants)
  if (cache.has(normalizedName)) {
    return cache.get(normalizedName);
  }

  try {
    // Simpler SPARQL query - just get "said to be same as" (P460) relationships
    // This is faster and returns actual name equivalents
    const query = `
      SELECT DISTINCT ?variantLabel WHERE {
        # Find given name by label
        ?name wdt:P31/wdt:P279* wd:Q202444 .
        ?name rdfs:label "${normalizedName}"@en .

        # Get "said to be the same as" names
        ?name wdt:P460 ?variant .
        ?variant rdfs:label ?variantLabel .
        FILTER(LANG(?variantLabel) = "en" || LANG(?variantLabel) = "sv")
      }
      LIMIT 20
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
    const variants = [...new Set(
      data.results.bindings
        .map(b => b.variantLabel?.value?.toLowerCase())
        .filter(Boolean)
        .filter(v => v !== normalizedName)
        .filter(isLatinName)
        .filter(v => v.length >= 2 && v.length <= 20)
    )];

    if (variants.length > 0) {
      console.log(`  ✓ Wikidata: "${firstName}" → ${variants.join(', ')}`);
    } else {
      console.log(`  · Wikidata: "${firstName}" → (no variants found)`);
    }

    cache.set(normalizedName, variants);
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
 * Pre-populate cache with common Swedish name variants
 * (Fallback when Wikidata is slow or unavailable)
 */
export function initializeCommonVariants() {
  // Common name variants - Swedish/English equivalents
  // This serves as both cache and fallback when Wikidata is slow/unavailable
  const commonVariants = {
    // C/K names
    'christopher': ['kristoffer', 'christoffer', 'christoph', 'chris', 'kristopher', 'kris'],
    'kristoffer': ['christopher', 'christoffer', 'christoph', 'chris', 'kristopher', 'kris'],
    'christoffer': ['christopher', 'kristoffer', 'christoph', 'chris', 'kristopher', 'kris'],

    // M names
    'mikael': ['michael', 'mikkel', 'michel', 'micke', 'mike', 'mick'],
    'michael': ['mikael', 'mikkel', 'michel', 'micke', 'mike', 'mick'],

    // S names
    'stefan': ['stephan', 'steven', 'steffen', 'steve', 'stephen'],
    'steve': ['stefan', 'stephan', 'steven', 'steffen', 'stephen'],
    'stieg': ['stig'],
    'stig': ['stieg'],

    // J names
    'johan': ['john', 'johannes', 'jon', 'johnny', 'jan', 'hans'],
    'john': ['johan', 'johannes', 'jon', 'johnny', 'jan', 'hans'],
    'jo': ['joe', 'johan', 'john', 'johannes'],
    'james': ['jim', 'jimmy', 'jakob', 'jacob'],
    'jonas': ['jonah', 'jon'],

    // E names
    'erik': ['eric', 'erich', 'erick'],
    'eric': ['erik', 'erich', 'erick'],

    // K/C names
    'karl': ['carl', 'charles', 'charlie'],
    'carl': ['karl', 'charles', 'charlie'],

    // F names
    'fredrik': ['frederick', 'fredric', 'freddie', 'fred', 'fritz'],
    'freida': ['frida', 'frieda'],
    'frida': ['freida', 'frieda'],

    // L names
    'lars': ['laurence', 'lawrence', 'larry'],
    'lena': ['helena', 'lina', 'helene'],

    // P names
    'per': ['peter', 'petter', 'pierre', 'pete'],
    'peter': ['per', 'petter', 'pierre', 'pete'],
    'paula': ['paulina', 'pauline', 'paola'],

    // A names
    'anders': ['andrew', 'andreas', 'andre', 'andy'],
    'andreas': ['anders', 'andrew', 'andre', 'andy'],
    'anna': ['anne', 'ann', 'hanna', 'hannah', 'anja'],

    // N names
    'niklas': ['nicholas', 'nicklas', 'nicolas', 'nick', 'nils'],
    'nicholas': ['niklas', 'nicklas', 'nicolas', 'nick', 'nils'],

    // K names (female)
    'katarina': ['katherine', 'catherine', 'katrina', 'karin', 'kate', 'katja'],

    // M names (female)
    'maria': ['marie', 'mary', 'maja', 'marion'],
    'monica': ['monika'],

    // S names (female)
    'sara': ['sarah', 'sahra'],

    // C names (female)
    'camilla': ['kamilla', 'camille'],

    // D names
    'dan': ['daniel', 'danny'],
    'daniel': ['dan', 'danny', 'danilo'],

    // G names
    'gillian': ['jillian', 'gill', 'jill'],

    // L names (female)
    'linda': ['lynda'],
  };

  for (const [name, variants] of Object.entries(commonVariants)) {
    cache.set(name, variants);
  }

  console.log(`Initialized ${Object.keys(commonVariants).length} common name variants in cache`);
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
