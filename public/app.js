const state = {
  companies: [],
  filters: { query: '', state: '', category: '', country: '' },
};

const elements = {
  grid: document.querySelector('#company-grid'),
  search: document.querySelector('#search'),
  stateFilter: document.querySelector('#state-filter'),
  categoryFilter: document.querySelector('#category-filter'),
  countryFilter: document.querySelector('#country-filter'),
  resultCount: document.querySelector('#result-count'),
  totalCount: document.querySelector('#total-count'),
  mainCount: document.querySelector('#main-count'),
  pendingCount: document.querySelector('#pending-count'),
  errorState: document.querySelector('#error-state'),
  emptyState: document.querySelector('#empty-state'),
  retryButton: document.querySelector('#retry-button'),
  clearButton: document.querySelector('#clear-button'),
  template: document.querySelector('#company-card-template'),
  dialog: document.querySelector('#company-dialog'),
  dialogContent: document.querySelector('#dialog-content'),
  dialogClose: document.querySelector('#dialog-close'),
};

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function addOptions(select, values) {
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function updateStats() {
  const total = state.companies.length;
  const main = state.companies.filter((company) => company.public_state === 'Main').length;
  const pending = state.companies.filter((company) => company.public_state === 'Pending').length;
  elements.totalCount.textContent = String(total);
  elements.mainCount.textContent = String(main);
  elements.pendingCount.textContent = String(pending);
}

function matches(company) {
  const query = state.filters.query.toLocaleLowerCase();
  const haystack = [company.name, company.category, company.country, company.evidence_summary]
    .map(clean)
    .join(' ')
    .toLocaleLowerCase();

  return (!query || haystack.includes(query))
    && (!state.filters.state || company.public_state === state.filters.state)
    && (!state.filters.category || company.category === state.filters.category)
    && (!state.filters.country || company.country === state.filters.country);
}

function stateClass(value) {
  return value === 'Main' ? 'main' : 'pending';
}

function fallbackSummary(company) {
  if (clean(company.evidence_summary)) return company.evidence_summary;
  if (clean(company.notes)) return company.notes;
  return 'Open the profile to review the current assessment.';
}

function render() {
  const filtered = state.companies.filter(matches);
  elements.grid.replaceChildren();
  elements.resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'company' : 'companies'}`;
  elements.emptyState.hidden = filtered.length > 0 || state.companies.length === 0;

  for (const company of filtered) {
    const fragment = elements.template.content.cloneNode(true);
    const article = fragment.querySelector('.company-card');
    const button = fragment.querySelector('.card-button');
    const pill = fragment.querySelector('.state-pill');
    const meta = fragment.querySelector('.card-meta');
    const heading = fragment.querySelector('h3');
    const summary = fragment.querySelector('.card-summary');
    const commercial = fragment.querySelector('.card-commercial');

    article.dataset.state = stateClass(company.public_state);
    pill.classList.add(stateClass(company.public_state));
    pill.textContent = clean(company.public_state) || 'Listed';
    meta.textContent = [clean(company.category), clean(company.country)].filter(Boolean).join(' · ') || 'Company';
    heading.textContent = clean(company.name) || 'Unnamed company';
    summary.textContent = fallbackSummary(company);
    commercial.textContent = clean(company.commercialised)
      ? `Commercial status · ${company.commercialised}`
      : 'Commercial status · Not specified';
    button.setAttribute('aria-label', `View ${heading.textContent}`);
    button.addEventListener('click', () => openCompany(company));
    elements.grid.append(fragment);
  }
}

function detailRow(label, value) {
  const text = clean(value);
  if (!text || text === '—') return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'detail-row';
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = text;
  wrapper.append(term, description);
  return wrapper;
}

function safeWebsite(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function openCompany(company) {
  const container = document.createElement('div');
  const pill = document.createElement('span');
  pill.className = `state-pill ${stateClass(company.public_state)}`;
  pill.textContent = clean(company.public_state) || 'Listed';

  const title = document.createElement('h2');
  title.id = 'dialog-title';
  title.textContent = clean(company.name) || 'Company';

  const meta = document.createElement('p');
  meta.className = 'dialog-meta';
  meta.textContent = [clean(company.category), clean(company.country)].filter(Boolean).join(' · ') || 'Company profile';

  const summary = document.createElement('p');
  summary.className = 'dialog-summary';
  summary.textContent = fallbackSummary(company);

  const details = document.createElement('dl');
  details.className = 'detail-list';
  [
    detailRow('Commercial status', company.commercialised),
    company.public_state === 'Pending' ? detailRow('What is still needed', company.what_it_needs_to_qualify) : null,
    detailRow('Assessment notes', company.notes),
    detailRow('Last reviewed', company.last_reviewed),
    detailRow('Methodology', company.methodology_version),
  ].filter(Boolean).forEach((row) => details.append(row));

  container.append(pill, title, meta, summary, details);

  const website = safeWebsite(company.website);
  if (website) {
    const link = document.createElement('a');
    link.className = 'website-link';
    link.href = website.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Visit ${title.textContent} ↗`;
    container.append(link);
  }

  elements.dialogContent.replaceChildren(container);
  elements.dialog.showModal();
}

function clearFilters() {
  state.filters = { query: '', state: '', category: '', country: '' };
  elements.search.value = '';
  elements.stateFilter.value = '';
  elements.categoryFilter.value = '';
  elements.countryFilter.value = '';
  render();
}

async function loadCompanies() {
  elements.grid.setAttribute('aria-busy', 'true');
  elements.errorState.hidden = true;
  elements.emptyState.hidden = true;
  elements.resultCount.textContent = 'Loading from Neon…';

  try {
    const response = await fetch('/api/companies', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const payload = await response.json();
    state.companies = Array.isArray(payload.companies) ? payload.companies : [];

    for (const select of [elements.stateFilter, elements.categoryFilter, elements.countryFilter]) {
      while (select.options.length > 1) select.remove(1);
    }
    addOptions(elements.stateFilter, unique(state.companies.map((company) => company.public_state)));
    addOptions(elements.categoryFilter, unique(state.companies.map((company) => company.category)));
    addOptions(elements.countryFilter, unique(state.companies.map((company) => company.country)));
    updateStats();
    render();
  } catch (error) {
    console.error(error);
    elements.resultCount.textContent = 'Unavailable';
    elements.errorState.hidden = false;
    elements.grid.replaceChildren();
  } finally {
    elements.grid.setAttribute('aria-busy', 'false');
  }
}

elements.search.addEventListener('input', (event) => {
  state.filters.query = event.currentTarget.value.trim();
  render();
});
elements.stateFilter.addEventListener('change', (event) => {
  state.filters.state = event.currentTarget.value;
  render();
});
elements.categoryFilter.addEventListener('change', (event) => {
  state.filters.category = event.currentTarget.value;
  render();
});
elements.countryFilter.addEventListener('change', (event) => {
  state.filters.country = event.currentTarget.value;
  render();
});
elements.retryButton.addEventListener('click', loadCompanies);
elements.clearButton.addEventListener('click', clearFilters);
elements.dialogClose.addEventListener('click', () => elements.dialog.close());
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

loadCompanies();
