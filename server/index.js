import express from 'express';
import cors from 'cors';
import { Client } from '@elastic/elasticsearch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 6001;

// Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});

const INDEX_NAME = 'books';

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../client')));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const health = await esClient.cluster.health();
    res.json({ status: 'ok', elasticsearch: health.status });
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
                          { match: { 'author.phonetic': { query: textQuery, boost: 0.5 } } },
                          // Search name variants (e.g., "kristoffer" matches "Christopher")
                          { match: { nameVariants: { query: textQuery, boost: 0.8 } } },
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

      // Titles search (returns actual books)
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
                          { match: { 'title.autocomplete': { query: textQuery, operator: 'or' } } },
                          { match: { 'title.phonetic': { query: textQuery, boost: 0.5 } } },
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

    // Process results
    const authors = (authorsResult.aggregations?.authors?.buckets || []).map((b) => ({
      value: b.key,
      count: b.doc_count,
      matchedTerms: findMatchedTerms(b.key, queryTerms),
    }));

    const titles = (titlesResult.hits?.hits || []).map((hit) => ({
      id: hit._id,
      value: hit._source.title,
      author: hit._source.author,
      year: hit._source.releaseYear,
      rating: hit._source.rating,
      matchedTerms: findMatchedTerms(hit._source.title, queryTerms),
    }));

    const genresList = (genresResult.aggregations?.genres?.buckets || []).map((b) => ({
      value: b.key,
      count: b.doc_count,
      matchedTerms: findMatchedTerms(b.key, queryTerms),
    }));

    // Filter years by the pattern
    let yearsList = (yearsResult.aggregations?.years?.buckets || []).map((b) => ({
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
    console.error('Suggest error:', error);
    res.status(500).json({ error: error.message });
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
      must.push({
        bool: {
          should: [
            { match: { 'title.autocomplete': { query: q, operator: 'or', boost: 3 } } },
            { match: { 'title.phonetic': { query: q, boost: 1 } } },
            { match: { 'author.autocomplete': { query: q, operator: 'or', boost: 2 } } },
            { match: { 'author.phonetic': { query: q, boost: 0.5 } } },
            // Name variants (e.g., "kristoffer" matches "Christopher")
            { match: { nameVariants: { query: q, boost: 0.8 } } },
          ],
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

    const result = await esClient.search({
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
