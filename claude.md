# Nextory Search Concept Demo

A search demo built to showcase advanced Elasticsearch capabilities for Nextory (Swedish audiobook/ebook service).

## Tech Stack
- **Backend:** Node.js + Express (port 6001)
- **Frontend:** Vanilla JS (served via Express)
- **Search:** OpenSearch 2.19.2 (Bonsai.io hosted) / Elasticsearch 9.x (local)
- **Hosting:** Render.com

## Key Features
- **Federated autocomplete** - Categorized suggestions (Authors, Titles, Genres, Years)
- **Filter chips** - Click suggestions to add as filters
- **Phonetic matching** - Beider-Morse encoder for name variations
- **Name variants** - "kristoffer" matches "Christopher" via Wikidata integration + static cache
- **Edge n-gram** - Prefix matching for autocomplete
- **Swedish text analysis** - Stemming for Swedish content

## Project Structure
```
├── client/
│   ├── index.html      # Main HTML
│   ├── app.js          # Frontend logic, state management
│   └── styles.css      # Nextory purple theme
├── server/
│   ├── index.js        # Express server, /api/suggest & /api/search
│   └── nameVariants.js # Wikidata SPARQL + static cache for name variants
├── scripts/
│   └── seed-elasticsearch.js  # Index creation + book seeding
├── render.yaml         # Render deployment config
└── .env.example        # Environment variable template
```

## Deployment

### Bonsai (OpenSearch)
- **Cluster:** foxstarius_search_family
- **Region:** AWS US East (Virginia)
- **URL:** `https://8e190d5b70:a612380fa3de9060826b@foxstarius-search-fa-1m60zt63.us-east-1.bonsaisearch.net`
- **Credentials:** Also stored in Render environment variables

### Render
- **Service:** nextory-search
- **Environment Variable:** `ELASTICSEARCH_URL` = Bonsai Full Access URL

## Local Development
```bash
# Start local Elasticsearch (with phonetic plugin)
# Then:
npm install
npm run seed          # Seed local ES
npm run dev           # Start with nodemon (auto-reload)

# Or seed remote Bonsai:
ELASTICSEARCH_URL="https://..." USE_WIKIDATA=false npm run seed
```

## Important Notes
- Uses `@opensearch-project/opensearch` client for Bonsai (auto-detected via URL)
- Uses `@elastic/elasticsearch` client for local development
- Phonetic plugin not available on Bonsai free tier - name variants provide similar functionality
- UI is in English (requested for interview)
- `render.yaml` configured for free tier deployment

## Domain Model (books index)
- title, author, genre[], releaseYear, rating, ratingCount
- language, formats[], trending
- authorFirstName, nameVariants[] (enriched at index time)

## Known Quirks
- Express 5 requires `/{*splat}` instead of `*` for wildcard routes
- OpenSearch `indices.exists()` returns `{ body: boolean }` vs ES returns `boolean`
- Highlight function carefully avoids matching inside HTML tags
