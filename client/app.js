const API_BASE = '/api';

// State
const state = {
  query: '',
  filters: {
    authors: [],
    genres: [],
    years: [],
  },
  page: 1,
  sort: '',
  totalResults: 0,
};

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearSearch = document.getElementById('clearSearch');
const activeFiltersEl = document.getElementById('activeFilters');
const suggestionsDropdown = document.getElementById('suggestionsDropdown');
const titleSection = document.getElementById('titleSection');
const titleList = document.getElementById('titleList');
const authorSection = document.getElementById('authorSection');
const authorList = document.getElementById('authorList');
const genreSection = document.getElementById('genreSection');
const genreList = document.getElementById('genreList');
const yearSection = document.getElementById('yearSection');
const yearList = document.getElementById('yearList');
const welcome = document.getElementById('welcome');
const resultsHeader = document.getElementById('resultsHeader');
const searchTermEl = document.getElementById('searchTerm');
const resultsCountEl = document.getElementById('resultsCount');
const booksSection = document.getElementById('booksSection');
const booksGrid = document.getElementById('booksGrid');
const bookCount = document.getElementById('bookCount');
const pagination = document.getElementById('pagination');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');
const sortSelect = document.getElementById('sortSelect');

const pageSize = 12;
let debounceTimer = null;

// Initialize
searchInput.addEventListener('input', handleInput);
searchInput.addEventListener('focus', () => {
  if (searchInput.value.length >= 2) {
    suggestionsDropdown.classList.add('active');
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-bar-container')) {
    suggestionsDropdown.classList.remove('active');
  }
});
clearSearch.addEventListener('click', clearAll);
sortSelect.addEventListener('change', (e) => {
  state.sort = e.target.value;
  state.page = 1;
  performSearch();
});
prevPage.addEventListener('click', () => {
  if (state.page > 1) {
    state.page--;
    performSearch();
  }
});
nextPage.addEventListener('click', () => {
  const totalPages = Math.ceil(state.totalResults / pageSize);
  if (state.page < totalPages) {
    state.page++;
    performSearch();
  }
});

function handleInput(e) {
  const query = e.target.value;
  state.query = query;

  clearTimeout(debounceTimer);
  clearSearch.style.display = query || hasActiveFilters() ? 'block' : 'none';

  if (query.length < 2) {
    suggestionsDropdown.classList.remove('active');
    return;
  }

  debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
}

function hasActiveFilters() {
  return (
    state.filters.authors.length > 0 ||
    state.filters.genres.length > 0 ||
    state.filters.years.length > 0
  );
}

async function fetchSuggestions(query) {
  const params = new URLSearchParams({ q: query });
  if (state.filters.authors.length) params.set('authors', state.filters.authors.join(','));
  if (state.filters.genres.length) params.set('genres', state.filters.genres.join(','));
  if (state.filters.years.length) params.set('years', state.filters.years.join(','));

  try {
    const response = await fetch(`${API_BASE}/suggest?${params}`);
    const data = await response.json();
    renderSuggestions(data);
    suggestionsDropdown.classList.add('active');
  } catch (error) {
    console.error('Suggest error:', error);
  }
}

function renderSuggestions(data) {
  // Titles (books) - shown first, direct navigation
  if (data.titles && data.titles.length > 0) {
    titleSection.style.display = 'block';
    titleList.innerHTML = data.titles
      .map(
        (t) => `
        <div class="suggestion-item" data-type="title" data-id="${t.id}" data-title="${escapeAttr(t.value)}">
          <div class="suggestion-item-main">
            <span class="suggestion-item-title">${highlightMatches(t.value, data.textQuery)}</span>
            <span class="suggestion-item-subtitle">${escapeHtml(t.author)} · ${t.year}</span>
          </div>
          ${t.rating ? `<span class="suggestion-item-count">★ ${t.rating.toFixed(1)}</span>` : ''}
        </div>
      `
      )
      .join('');
  } else {
    titleSection.style.display = 'none';
  }

  // Authors
  if (data.authors && data.authors.length > 0) {
    authorSection.style.display = 'block';
    authorList.innerHTML = data.authors
      .map(
        (a) => `
        <div class="suggestion-item" data-type="author" data-value="${escapeAttr(a.value)}" data-matched="${a.matchedTerms.join(',')}">
          <span class="suggestion-item-title">${highlightMatches(a.value, data.textQuery)}</span>
          <span class="suggestion-item-count">${a.count} books</span>
        </div>
      `
      )
      .join('');
  } else {
    authorSection.style.display = 'none';
  }

  // Genres
  if (data.genres && data.genres.length > 0) {
    genreSection.style.display = 'block';
    genreList.innerHTML = data.genres
      .map(
        (g) => `
        <div class="suggestion-item" data-type="genre" data-value="${escapeAttr(g.value)}" data-matched="${g.matchedTerms.join(',')}">
          <span class="suggestion-item-title">${highlightMatches(g.value, data.textQuery)}</span>
          <span class="suggestion-item-count">${g.count} books</span>
        </div>
      `
      )
      .join('');
  } else {
    genreSection.style.display = 'none';
  }

  // Years
  if (data.years && data.years.length > 0) {
    yearSection.style.display = 'block';
    yearList.innerHTML = data.years
      .map(
        (y) => `
        <span class="year-pill" data-type="year" data-value="${y.value}">${y.value}</span>
      `
      )
      .join('');
  } else {
    yearSection.style.display = 'none';
  }

  // Add click handlers
  suggestionsDropdown.querySelectorAll('[data-type]').forEach((el) => {
    el.addEventListener('click', () => handleSuggestionClick(el));
  });
}

function handleSuggestionClick(el) {
  const type = el.dataset.type;
  const value = el.dataset.value;
  const matchedTerms = el.dataset.matched ? el.dataset.matched.split(',').filter(Boolean) : [];

  if (type === 'title') {
    // Direct navigation - for now, just search for this title
    state.query = el.dataset.title;
    searchInput.value = state.query;
    suggestionsDropdown.classList.remove('active');
    state.page = 1;
    performSearch();
    return;
  }

  // Add filter
  if (type === 'author' && !state.filters.authors.includes(value)) {
    state.filters.authors.push(value);
  } else if (type === 'genre' && !state.filters.genres.includes(value)) {
    state.filters.genres.push(value);
  } else if (type === 'year') {
    const yearVal = parseInt(value);
    if (!state.filters.years.includes(yearVal)) {
      state.filters.years.push(yearVal);
    }
  }

  // Remove matched terms from query
  if (matchedTerms.length > 0) {
    let newQuery = state.query;
    matchedTerms.forEach((term) => {
      // Remove the term (case insensitive, whole word or partial)
      const regex = new RegExp(`\\b${escapeRegex(term)}\\w*\\b`, 'gi');
      newQuery = newQuery.replace(regex, '');
    });
    state.query = newQuery.replace(/\s+/g, ' ').trim();
    searchInput.value = state.query;
  }

  // If year was selected, also remove year pattern from query
  if (type === 'year') {
    state.query = state.query.replace(/\b(19|20)\d{0,2}\b/g, '').replace(/\s+/g, ' ').trim();
    searchInput.value = state.query;
  }

  renderActiveFilters();
  suggestionsDropdown.classList.remove('active');
  state.page = 1;
  performSearch();

  // Refetch suggestions if there's remaining query
  if (state.query.length >= 2) {
    fetchSuggestions(state.query);
  }
}

function renderActiveFilters() {
  const chips = [];

  state.filters.authors.forEach((author) => {
    chips.push(`
      <span class="filter-chip" data-type="author" data-value="${escapeAttr(author)}">
        ${escapeHtml(author)}
        <button class="filter-chip-remove">&times;</button>
      </span>
    `);
  });

  state.filters.genres.forEach((genre) => {
    chips.push(`
      <span class="filter-chip" data-type="genre" data-value="${escapeAttr(genre)}">
        ${escapeHtml(genre)}
        <button class="filter-chip-remove">&times;</button>
      </span>
    `);
  });

  state.filters.years.forEach((year) => {
    chips.push(`
      <span class="filter-chip" data-type="year" data-value="${year}">
        ${year}
        <button class="filter-chip-remove">&times;</button>
      </span>
    `);
  });

  // Add "Clear filters" link if there are multiple filters
  if (chips.length > 1) {
    chips.push(`<button class="clear-all-filters">Clear filters</button>`);
  }

  activeFiltersEl.innerHTML = chips.join('');

  // Add remove handlers
  activeFiltersEl.querySelectorAll('.filter-chip-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chip = btn.closest('.filter-chip');
      const type = chip.dataset.type;
      const value = chip.dataset.value;

      if (type === 'author') {
        state.filters.authors = state.filters.authors.filter((a) => a !== value);
      } else if (type === 'genre') {
        state.filters.genres = state.filters.genres.filter((g) => g !== value);
      } else if (type === 'year') {
        state.filters.years = state.filters.years.filter((y) => y !== parseInt(value));
      }

      renderActiveFilters();
      state.page = 1;
      performSearch();
    });
  });

  // Clear all filters handler
  const clearAllBtn = activeFiltersEl.querySelector('.clear-all-filters');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      state.filters = { authors: [], genres: [], years: [] };
      renderActiveFilters();
      state.page = 1;
      performSearch();
    });
  }

  clearSearch.style.display = state.query || hasActiveFilters() ? 'block' : 'none';
}

function clearAll() {
  state.query = '';
  state.filters = { authors: [], genres: [], years: [] };
  state.page = 1;
  searchInput.value = '';
  renderActiveFilters();
  suggestionsDropdown.classList.remove('active');
  clearSearch.style.display = 'none';

  // Show welcome, hide results
  welcome.style.display = 'block';
  resultsHeader.style.display = 'none';
  booksSection.style.display = 'none';
  pagination.style.display = 'none';
}

async function performSearch() {
  // Only search if we have query or filters
  if (!state.query && !hasActiveFilters()) {
    welcome.style.display = 'block';
    resultsHeader.style.display = 'none';
    booksSection.style.display = 'none';
    pagination.style.display = 'none';
    return;
  }

  welcome.style.display = 'none';
  resultsHeader.style.display = 'block';
  booksSection.style.display = 'block';
  pagination.style.display = 'flex';

  // Build search description
  const parts = [];
  if (state.query) parts.push(`"${state.query}"`);
  if (state.filters.authors.length) parts.push(state.filters.authors.join(', '));
  if (state.filters.genres.length) parts.push(state.filters.genres.join(', '));
  if (state.filters.years.length) parts.push(state.filters.years.join(', '));
  searchTermEl.textContent = parts.join(' + ') || 'All books';

  booksGrid.innerHTML = '<div class="loading">Searching...</div>';

  const params = new URLSearchParams({
    page: state.page,
    size: pageSize,
  });
  if (state.query) params.set('q', state.query);
  if (state.filters.authors.length) params.set('authors', state.filters.authors.join(','));
  if (state.filters.genres.length) params.set('genres', state.filters.genres.join(','));
  if (state.filters.years.length) params.set('years', state.filters.years.join(','));
  if (state.sort) params.set('sort', state.sort);

  try {
    const response = await fetch(`${API_BASE}/search?${params}`);
    const data = await response.json();

    state.totalResults = data.total;
    resultsCountEl.textContent = `${data.total} results`;
    bookCount.textContent = data.total;

    renderBooks(data.results);
    updatePagination();
  } catch (error) {
    console.error('Search error:', error);
    booksGrid.innerHTML = '<p class="error">An error occurred while searching</p>';
  }
}

function renderBooks(books) {
  if (!books || books.length === 0) {
    booksGrid.innerHTML = '<p>No books found</p>';
    return;
  }

  booksGrid.innerHTML = books
    .map((book, index) => {
      const rank = (state.page - 1) * pageSize + index + 1;
      const hasAudio = book.formats?.includes('audio');
      const hasEbook = book.formats?.includes('ebook');

      return `
        <div class="book-card">
          <div class="book-cover">
            <span class="book-cover-placeholder">📚</span>
            ${book.releaseYear >= 2024 ? '<span class="book-badge">Ny</span>' : ''}
            ${book.rating ? `
              <span class="book-rating">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                ${book.rating.toFixed(1)}
              </span>
            ` : ''}
            <span class="book-rank">#${rank}</span>
          </div>
          <div class="book-info">
            <h3 class="book-title" title="${escapeAttr(book.title)}">${escapeHtml(book.title)}</h3>
            <p class="book-author">${escapeHtml(book.author)}</p>
            <div class="book-formats">
              ${hasAudio ? `<svg class="format-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>` : ''}
              ${hasEbook ? `<svg class="format-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>` : ''}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function updatePagination() {
  const totalPages = Math.ceil(state.totalResults / pageSize);
  pageInfo.textContent = `Page ${state.page} of ${totalPages || 1}`;
  prevPage.disabled = state.page <= 1;
  nextPage.disabled = state.page >= totalPages;
}

// Utilities
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return (text || '').replace(/"/g, '&quot;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatches(text, query) {
  if (!query) return escapeHtml(text);
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const escaped = escapeHtml(text);

  // Find all matches first, then wrap them (to avoid matching inside our own tags)
  const matches = [];
  terms.forEach((term) => {
    const regex = new RegExp(escapeRegex(term), 'gi');
    let match;
    while ((match = regex.exec(escaped)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
    }
  });

  if (matches.length === 0) return escaped;

  // Sort by position and merge overlapping
  matches.sort((a, b) => a.start - b.start);
  const merged = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const last = merged[merged.length - 1];
    if (matches[i].start <= last.end) {
      last.end = Math.max(last.end, matches[i].end);
      last.text = escaped.slice(last.start, last.end);
    } else {
      merged.push(matches[i]);
    }
  }

  // Build result string
  let result = '';
  let pos = 0;
  merged.forEach((m) => {
    result += escaped.slice(pos, m.start);
    result += `<span class="highlight">${m.text}</span>`;
    pos = m.end;
  });
  result += escaped.slice(pos);

  return result;
}
