import express from 'express';
import cors from 'cors';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 6001;

// Use OpenSearch client for Bonsai, Elasticsearch client for local
const esUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
const isOpenSearch = esUrl.includes('bonsai');
const esClient = isOpenSearch
  ? new OpenSearchClient({ node: esUrl })
  : new ElasticsearchClient({ node: esUrl });

console.log(`Using ${isOpenSearch ? 'OpenSearch' : 'Elasticsearch'} client`);

const INDEX_NAME = 'books';

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../client')));

// Check if phonetic fields are available (detected at startup)
let hasPhoneticFields = false;

async function checkPhoneticSupport() {
  try {
    const mapping = await esClient.indices.getMapping({ index: INDEX_NAME });
    const indexMapping = mapping[INDEX_NAME] || mapping.body?.[INDEX_NAME];
    const titleFields = indexMapping?.mappings?.properties?.title?.fields || {};
    hasPhoneticFields = 'phonetic' in titleFields;
    console.log(`Phonetic fields available: ${hasPhoneticFields}`);
  } catch (e) {
    console.log('Could not check phonetic support, assuming not available');
    hasPhoneticFields = false;
  }
}

// Initialize phonetic check
checkPhoneticSupport();

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const health = await esClient.cluster.health();
    res.json({ status: 'ok', elasticsearch: health.status || health.body?.status });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Federated suggest endpoint - categorized suggestions
app.get('/api/suggest', async (req, res) => {
  const { q, authors = '', genres = '', years = '' } = req.query;

  if (!q || q.length < 2) {
    return res.json({ authors: [], titles: [], genres: [], years: [], query: q });
  }

  // Parse active filters
  const activeFilters = {
    authors: authors ? authors.split(',') : [],
    genres: genres ? genres.split(',') : [],
    years: years ? years.split(',').map(Number).filter(Boolean) : [],
  };

  // Extract year pattern from query (3-4 digits)
  const yearPattern = q.match(/\b(19|20)\d{0,2}\b/g);
  const textQuery = q.replace(/\b(19|20)\d{0,2}\b/g, '').trim();
  const queryTerms = textQuery.toLowerCase().split(/\s+/).filter(Boolean);

  // Build filter clause from active selections
  const buildFilterClause = () => {
    const filters = [];
    if (activeFilters.authors.length > 0) {
      filters.push({ terms: { 'author.keyword': activeFilters.authors } });
    }
    if (activeFilters.genres.length > 0) {
      filters.push({ terms: { genre: activeFilters.genres } });
    }
    if (activeFilters.years.length > 0) {
      filters.push({ terms: { releaseYear: activeFilters.years } });
    }
    return filters;
  };

  try {
    // Run parallel searches for each category
    const [authorsResult, titlesResult, genresResult, yearsResult] = await Promise.all([
      // Authors search (includes nameVariants for phonetic matching)
      textQuery.length >= 2
        ? esClient.search({
            index: INDEX_NAME,
            body: {
              size: 0,
              query: {
                bool: {
                  must: [
                    {
                      bool: {
                        should: [
                          { match: { 'author.autocomplete': { query: textQuery, operator: 'or' } } },
                          // Search name variants (e.g., "kristoffer" matches "Christopher")
                          { match: { nameVariants: { query: textQuery, boost: 0.8 } } },
                          // Only include phonetic search if available
                          ...(hasPhoneticFields
                            ? [{ match: { 'author.phonetic': { query: textQuery, boost: 0.5 } } }]
                            : []),
                        ],
                      },
                    },
                  ],
                  filter: buildFilterClause().filter((f) => !f.terms?.['author.keyword']),
                },
              },
              aggs: {
                authors: {
                  terms: { field: 'author.keyword', size: 5 },
                },
              },
            },
          })
        : { aggregations: { authors: { buckets: [] } } },

      // Titles search (returns actual books - matches on title OR author)
      textQuery.length >= 2
        ? esClient.search({
            index: INDEX_NAME,
            body: {
              size: 5,
              query: {
                bool: {
                  must: [
                    {
                      bool: {
                        should: [
                          { match: { 'title.autocomplete': { query: textQuery, operator: 'or', boost: 2 } } },
                          { match: { 'author.autocomplete': { query: textQuery, operator: 'or' } } },
                          { match: { nameVariants: { query: textQuery, boost: 0.8 } } },
                          ...(hasPhoneticFields
                            ? [
                                { match: { 'title.phonetic': { query: textQuery, boost: 0.5 } } },
                                { match: { 'author.phonetic': { query: textQuery, boost: 0.3 } } },
                              ]
                            : []),
                        ],
                      },
                    },
                  ],
                  filter: buildFilterClause(),
                },
              },
              _source: ['title', 'author', 'releaseYear', 'rating', 'genre'],
            },
          })
        : { hits: { hits: [] } },

      // Genres search
      textQuery.length >= 2
        ? esClient.search({
            index: INDEX_NAME,
            body: {
              size: 0,
              query: {
                bool: {
                  must: [
                    {
                      bool: {
                        should: queryTerms.map((term) => ({
                          prefix: { genre: { value: term, case_insensitive: true } },
                        })),
                      },
                    },
                  ],
                  filter: buildFilterClause().filter((f) => !f.terms?.genre),
                },
              },
              aggs: {
                genres: {
                  terms: { field: 'genre', size: 5 },
                },
              },
            },
          })
        : { aggregations: { genres: { buckets: [] } } },

      // Years search (if year pattern found) - use autocomplete field for prefix matching
      yearPattern
        ? esClient.search({
            index: INDEX_NAME,
            body: {
              size: 0,
              query: {
                bool: {
                  must: [
                    {
                      bool: {
                        should: yearPattern.map((yp) => ({
                          match: { 'releaseYear.autocomplete': { query: yp } },
                        })),
                        minimum_should_match: 1,
                      },
                    },
                  ],
                  filter: buildFilterClause().filter((f) => !f.terms?.releaseYear),
                },
              },
              aggs: {
                years: {
                  terms: { field: 'releaseYear', size: 10, order: { _key: 'desc' } },
                },
              },
            },
          })
        : { aggregations: { years: { buckets: [] } } },
    ]);

    // Helper to find which query terms matched a value
    const findMatchedTerms = (value, terms) => {
      const valueLower = value.toLowerCase();
      return terms.filter((term) => valueLower.includes(term));
    };

    // Helper to unwrap OpenSearch response (wraps in body) vs Elasticsearch (doesn't)
    const unwrap = (result) => result.body || result;

    // Process results (unwrap for OpenSearch compatibility)
    const authorsData = unwrap(authorsResult);
    const titlesData = unwrap(titlesResult);
    const genresData = unwrap(genresResult);
    const yearsData = unwrap(yearsResult);

    const authors = (authorsData.aggregations?.authors?.buckets || []).map((b) => ({
      value: b.key,
      count: b.doc_count,
      matchedTerms: findMatchedTerms(b.key, queryTerms),
    }));

    const titles = (titlesData.hits?.hits || []).map((hit) => ({
      id: hit._id,
      value: hit._source.title,
      author: hit._source.author,
      year: hit._source.releaseYear,
      rating: hit._source.rating,
      matchedTerms: findMatchedTerms(hit._source.title, queryTerms),
    }));

    const genresList = (genresData.aggregations?.genres?.buckets || []).map((b) => ({
      value: b.key,
      count: b.doc_count,
      matchedTerms: findMatchedTerms(b.key, queryTerms),
    }));

    // Filter years by the pattern
    let yearsList = (yearsData.aggregations?.years?.buckets || []).map((b) => ({
      value: b.key,
      count: b.doc_count,
    }));

    // If we have a year pattern, filter to matching years
    if (yearPattern) {
      yearsList = yearsList.filter((y) =>
        yearPattern.some((yp) => String(y.value).startsWith(yp))
      );
    }

    res.json({
      query: q,
      textQuery,
      yearPattern,
      authors,
      titles,
      genres: genresList,
      years: yearsList,
      activeFilters,
    });
  } catch (error) {
    console.error('Suggest error:', error.message, error.meta?.body || error);
    res.status(500).json({ error: error.message, details: error.meta?.body?.error || null });
  }
});

// Search endpoint - for full search results (with filters)
app.get('/api/search', async (req, res) => {
  const { q, page = 1, size = 12, authors, genres, years, sort } = req.query;
  const from = (parseInt(page) - 1) * parseInt(size);

  // Parse filters
  const authorList = authors ? authors.split(',') : [];
  const genreList = genres ? genres.split(',') : [];
  const yearList = years ? years.split(',').map(Number).filter(Boolean) : [];

  try {
    const must = [];
    const filter = [];

    // Text query (if any remaining after filter extraction)
    if (q && q.trim()) {
      const shouldClauses = [
        { match: { 'title.autocomplete': { query: q, operator: 'or', boost: 3 } } },
        { match: { 'author.autocomplete': { query: q, operator: 'or', boost: 2 } } },
        // Name variants (e.g., "kristoffer" matches "Christopher")
        { match: { nameVariants: { query: q, boost: 0.8 } } },
      ];

      // Only add phonetic searches if available
      if (hasPhoneticFields) {
        shouldClauses.push(
          { match: { 'title.phonetic': { query: q, boost: 1 } } },
          { match: { 'author.phonetic': { query: q, boost: 0.5 } } }
        );
      }

      must.push({
        bool: {
          should: shouldClauses,
          minimum_should_match: 1,
        },
      });
    }

    // Apply filters
    if (authorList.length > 0) {
      filter.push({ terms: { 'author.keyword': authorList } });
    }
    if (genreList.length > 0) {
      filter.push({ terms: { genre: genreList } });
    }
    if (yearList.length > 0) {
      filter.push({ terms: { releaseYear: yearList } });
    }

    const sortOptions = [];
    if (sort === 'rating') {
      sortOptions.push({ rating: 'desc' });
    } else if (sort === 'title') {
      sortOptions.push({ 'title.keyword': 'asc' });
    } else if (sort === 'year') {
      sortOptions.push({ releaseYear: 'desc' });
    } else if (sort === 'trending') {
      sortOptions.push({ trending: 'desc' });
    } else {
      sortOptions.push('_score');
    }

    const rawResult = await esClient.search({
      index: INDEX_NAME,
      body: {
        from,
        size: parseInt(size),
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        sort: sortOptions,
        aggs: {
          authors: { terms: { field: 'author.keyword', size: 20 } },
          genres: { terms: { field: 'genre', size: 20 } },
          years: { terms: { field: 'releaseYear', size: 20, order: { _key: 'desc' } } },
        },
      },
    });

    // Unwrap for OpenSearch compatibility (wraps response in body)
    const result = rawResult.body || rawResult;

    const hits = result.hits.hits.map((hit) => ({
      id: hit._id,
      score: hit._score,
      ...hit._source,
    }));

    res.json({
      total: result.hits.total.value,
      page: parseInt(page),
      size: parseInt(size),
      results: hits,
      facets: {
        authors: result.aggregations?.authors?.buckets || [],
        genres: result.aggregations?.genres?.buckets || [],
        years: result.aggregations?.years?.buckets || [],
      },
      activeFilters: { authors: authorList, genres: genreList, years: yearList },
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the client (Express 5 syntax)
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(__dirname, '../client/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
