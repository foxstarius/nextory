import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { getNameVariants, extractFirstName, initializeCommonVariants } from '../server/nameVariants.js';

const esUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
const isOpenSearch = esUrl.includes('bonsai');

// Use OpenSearch client for Bonsai, Elasticsearch client for local
const esClient = isOpenSearch
  ? new OpenSearchClient({ node: esUrl })
  : new ElasticsearchClient({ node: esUrl });

console.log(`Using ${isOpenSearch ? 'OpenSearch' : 'Elasticsearch'} client`);

const INDEX_NAME = 'books';

// Flag to control Wikidata usage
const USE_WIKIDATA = process.env.USE_WIKIDATA !== 'false'; // default true

// Sample books with refined domain model
const sampleBooks = [
  {
    title: 'Min dotters man',
    author: 'Daniel Hurst',
    genre: ['Thriller', 'Psykologisk Thriller'],
    releaseYear: 2023,
    rating: 3.7,
    ratingCount: 1842,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 4521,
  },
  {
    title: 'Min dotters pojkvän',
    author: 'Daniel Hurst',
    genre: ['Thriller', 'Psykologisk Thriller'],
    releaseYear: 2024,
    rating: 3.6,
    ratingCount: 956,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 3200,
  },
  {
    title: 'Den yttersta hemligheten',
    author: 'Dan Brown',
    genre: ['Thriller', 'Äventyr'],
    releaseYear: 2017,
    rating: 3.6,
    ratingCount: 12453,
    language: 'sv',
    formats: ['audio'],
    trending: 890,
  },
  {
    title: 'Kickoff',
    author: 'Lena Berglin',
    genre: ['Thriller', 'Deckare'],
    releaseYear: 2024,
    rating: 3.5,
    ratingCount: 423,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 2100,
  },
  {
    title: 'Roadtrip',
    author: 'Lena Berglin',
    genre: ['Thriller', 'Spänning'],
    releaseYear: 2025,
    rating: 3.5,
    ratingCount: 187,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 5600,
  },
  {
    title: 'Läkarens fru',
    author: 'Daniel Hurst',
    genre: ['Thriller', 'Psykologisk Thriller'],
    releaseYear: 2022,
    rating: 3.8,
    ratingCount: 2341,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 1500,
  },
  {
    title: 'Fadern',
    author: 'Monica Rehn',
    genre: ['Thriller', 'Deckare'],
    releaseYear: 2025,
    rating: 3.8,
    ratingCount: 234,
    language: 'sv',
    formats: ['audio'],
    trending: 4200,
  },
  {
    title: 'The Housemaid',
    author: 'Freida McFadden',
    genre: ['Thriller', 'Psykologisk Thriller'],
    releaseYear: 2022,
    rating: 4.3,
    ratingCount: 89234,
    language: 'en',
    formats: ['audio', 'ebook'],
    trending: 12000,
  },
  {
    title: 'Gästspelet',
    author: 'Linda Ståhl',
    genre: ['Thriller', 'Deckare'],
    releaseYear: 2025,
    rating: 3.9,
    ratingCount: 156,
    language: 'sv',
    formats: ['audio'],
    trending: 3800,
  },
  {
    title: 'Djävulens advokat',
    author: 'Steve Cavanagh',
    genre: ['Thriller', 'Rättsthriller'],
    releaseYear: 2024,
    rating: 4.5,
    ratingCount: 4521,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 7800,
  },
  {
    title: 'Advokaten',
    author: 'Steve Cavanagh',
    genre: ['Thriller', 'Rättsthriller'],
    releaseYear: 2019,
    rating: 4.1,
    ratingCount: 8923,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 2300,
  },
  {
    title: 'Jag Är Zlatan Ibrahimovic : Min Historia',
    author: 'Zlatan Ibrahimovic',
    genre: ['Självbiografi', 'Sport'],
    releaseYear: 2011,
    rating: 4.2,
    ratingCount: 34521,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 1200,
  },
  {
    title: 'Jag Är Zlatan',
    author: 'Zlatan Ibrahimovic',
    genre: ['Självbiografi', 'Sport', 'Lättläst'],
    releaseYear: 2013,
    rating: 4.0,
    ratingCount: 5432,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 800,
  },
  {
    title: 'Thrill Ride',
    author: 'James Patterson',
    genre: ['Thriller', 'Action'],
    releaseYear: 2021,
    rating: 3.8,
    ratingCount: 2341,
    language: 'en',
    formats: ['audio', 'ebook'],
    trending: 450,
  },
  {
    title: 'Flickan med draktatueringen',
    author: 'Stieg Larsson',
    genre: ['Thriller', 'Deckare', 'Klassiker'],
    releaseYear: 2005,
    rating: 4.4,
    ratingCount: 156789,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 3400,
  },
  {
    title: 'Snömannen',
    author: 'Jo Nesbø',
    genre: ['Thriller', 'Deckare', 'Nordisk Noir'],
    releaseYear: 2007,
    rating: 4.2,
    ratingCount: 45678,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 2100,
  },
  {
    title: 'Gone Girl',
    author: 'Gillian Flynn',
    genre: ['Thriller', 'Psykologisk Thriller'],
    releaseYear: 2012,
    rating: 4.1,
    ratingCount: 234567,
    language: 'en',
    formats: ['audio', 'ebook'],
    trending: 5600,
  },
  {
    title: 'The Girl on the Train',
    author: 'Paula Hawkins',
    genre: ['Thriller', 'Psykologisk Thriller'],
    releaseYear: 2015,
    rating: 3.9,
    ratingCount: 189234,
    language: 'en',
    formats: ['audio', 'ebook'],
    trending: 4300,
  },
  {
    title: 'Hypnotisören',
    author: 'Lars Kepler',
    genre: ['Thriller', 'Deckare', 'Nordisk Noir'],
    releaseYear: 2009,
    rating: 4.0,
    ratingCount: 67234,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 2800,
  },
  {
    title: 'Sandmannen',
    author: 'Lars Kepler',
    genre: ['Thriller', 'Deckare', 'Nordisk Noir'],
    releaseYear: 2012,
    rating: 4.1,
    ratingCount: 45123,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 1900,
  },
  {
    title: 'Mördarens ape',
    author: 'Christopher Läckberg',
    genre: ['Thriller', 'Deckare'],
    releaseYear: 2023,
    rating: 3.9,
    ratingCount: 12345,
    language: 'sv',
    formats: ['audio', 'ebook'],
    trending: 3100,
  },
];

async function createIndex() {
  // Check if index exists (OpenSearch returns { body: boolean }, ES returns boolean)
  let exists = false;
  try {
    const existsResult = await esClient.indices.exists({ index: INDEX_NAME });
    exists = existsResult.body ?? existsResult;
  } catch (e) {
    exists = false;
  }

  if (exists) {
    console.log(`Deleting existing index: ${INDEX_NAME}`);
    await esClient.indices.delete({ index: INDEX_NAME });
  }

  // Check if phonetic plugin is available
  let hasPhoneticPlugin = false;
  try {
    const nodes = await esClient.nodes.info({ metric: 'plugins' });
    const nodeValues = Object.values(nodes.nodes || {});
    hasPhoneticPlugin = nodeValues.some((node) =>
      node.plugins?.some((p) => p.name === 'analysis-phonetic')
    );
  } catch (e) {
    console.log('Could not check for phonetic plugin');
  }

  console.log(`Phonetic plugin available: ${hasPhoneticPlugin}`);
  console.log(`Creating index: ${INDEX_NAME}`);

  // Build analyzers - add phonetic if plugin is available
  const filters = {
    swedish_stemmer: {
      type: 'stemmer',
      language: 'swedish',
    },
    // Edge ngram for autocomplete prefix matching
    edge_ngram_filter: {
      type: 'edge_ngram',
      min_gram: 2,
      max_gram: 15,
    },
    // Swedish-specific character normalization
    swedish_normalization: {
      type: 'pattern_replace',
      pattern: '([åä])',
      replacement: 'a',
    },
  };

  const analyzers = {
    swedish_analyzer: {
      type: 'custom',
      tokenizer: 'standard',
      filter: ['lowercase', 'swedish_stemmer'],
    },
    // For autocomplete - indexes edge ngrams
    autocomplete_index: {
      type: 'custom',
      tokenizer: 'standard',
      filter: ['lowercase', 'edge_ngram_filter'],
    },
    // For autocomplete search - doesn't use edge ngrams
    autocomplete_search: {
      type: 'custom',
      tokenizer: 'standard',
      filter: ['lowercase'],
    },
  };

  // Add phonetic analyzer if plugin is available
  if (hasPhoneticPlugin) {
    filters.swedish_phonetic = {
      type: 'phonetic',
      encoder: 'beider_morse',
      rule_type: 'approx',
      name_type: 'generic',
      languageset: ['german', 'english'], // Closest available to Swedish
    };
    analyzers.phonetic_analyzer = {
      type: 'custom',
      tokenizer: 'standard',
      filter: ['lowercase', 'swedish_phonetic'],
    };
  }

  await esClient.indices.create({
    index: INDEX_NAME,
    body: {
      settings: {
        analysis: {
          filter: filters,
          analyzer: analyzers,
        },
      },
      mappings: {
        properties: {
          title: {
            type: 'text',
            analyzer: 'swedish_analyzer',
            fields: {
              keyword: { type: 'keyword' },
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_index',
                search_analyzer: 'autocomplete_search',
              },
              // Add phonetic subfield if plugin available (will be ignored if not)
              ...(hasPhoneticPlugin && {
                phonetic: {
                  type: 'text',
                  analyzer: 'phonetic_analyzer',
                },
              }),
            },
          },
          author: {
            type: 'text',
            analyzer: 'standard',
            fields: {
              keyword: { type: 'keyword' },
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_index',
                search_analyzer: 'autocomplete_search',
              },
              ...(hasPhoneticPlugin && {
                phonetic: {
                  type: 'text',
                  analyzer: 'phonetic_analyzer',
                },
              }),
            },
          },
          genre: {
            type: 'keyword',
          },
          releaseYear: {
            type: 'integer',
            fields: {
              autocomplete: {
                type: 'text',
                analyzer: 'autocomplete_index',
                search_analyzer: 'autocomplete_search',
              },
            },
          },
          rating: {
            type: 'float',
          },
          ratingCount: {
            type: 'integer',
          },
          language: {
            type: 'keyword',
          },
          formats: {
            type: 'keyword',
          },
          trending: {
            type: 'integer',
          },
          // Name variants for phonetic/alternative spelling search
          authorFirstName: {
            type: 'keyword',
          },
          nameVariants: {
            type: 'text',
            analyzer: 'autocomplete_index',
            search_analyzer: 'autocomplete_search',
          },
        },
      },
    },
  });
}

async function indexBooks() {
  console.log('Indexing sample books...');

  if (USE_WIKIDATA) {
    console.log('🌐 Fetching name variants from Wikidata...');
  } else {
    console.log('📦 Using cached name variants (set USE_WIKIDATA=true for live data)');
  }

  // Get unique first names to minimize API calls
  const uniqueFirstNames = [...new Set(
    sampleBooks
      .map((book) => extractFirstName(book.author))
      .filter(Boolean)
      .map((name) => name.toLowerCase())
  )];

  console.log(`Found ${uniqueFirstNames.length} unique first names to look up`);

  // Fetch variants for all unique names (in parallel with rate limiting)
  const variantsMap = new Map();

  for (const firstName of uniqueFirstNames) {
    const variants = await getNameVariants(firstName);
    variantsMap.set(firstName, variants);

    // Small delay to be nice to Wikidata API
    if (USE_WIKIDATA) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Enrich books with name variants
  const enrichedBooks = sampleBooks.map((book) => {
    const firstName = extractFirstName(book.author)?.toLowerCase();
    const variants = firstName ? variantsMap.get(firstName) || [] : [];

    return {
      ...book,
      authorFirstName: firstName,
      nameVariants: variants,
    };
  });

  // Log enrichment
  console.log('\nName variant mappings:');
  enrichedBooks.forEach((book) => {
    if (book.nameVariants.length > 0) {
      console.log(`  ${book.author} → ${book.nameVariants.slice(0, 5).join(', ')}${book.nameVariants.length > 5 ? ` (+${book.nameVariants.length - 5} more)` : ''}`);
    } else {
      console.log(`  ${book.author} → (no variants found)`);
    }
  });

  const operations = enrichedBooks.flatMap((book) => [
    { index: { _index: INDEX_NAME } },
    book,
  ]);

  const result = await esClient.bulk({ body: operations, refresh: true });

  if (result.errors) {
    console.error('Some documents failed to index:');
    result.items
      .filter((item) => item.index?.error)
      .forEach((item) => console.error(item.index.error));
  } else {
    console.log(`\n✅ Successfully indexed ${sampleBooks.length} books`);
  }
}

async function main() {
  try {
    console.log('Connecting to Elasticsearch...');
    const health = await esClient.cluster.health();
    console.log(`Cluster status: ${health.status}`);

    await createIndex();
    await indexBooks();

    // Verify
    const count = await esClient.count({ index: INDEX_NAME });
    console.log(`Total documents in index: ${count.count}`);

    console.log('\nSetup complete! Run `npm start` to start the server.');
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
}

main();
