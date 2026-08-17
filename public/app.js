const appMain = document.querySelector('#app-main');
const dialog = document.querySelector('#company-dialog');
const dialogContent = document.querySelector('#dialog-content');
const dialogClose = document.querySelector('#dialog-close');
let routeVersion = 0;
let directoryCache = null;
let assetsCache = null;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function stateClass(value) {
  return value === 'Main' ? 'main' : 'pending';
}

function fallbackSummary(company) {
  if (clean(company.evidence_summary)) return company.evidence_summary;
  return 'Description under editorial review.';
}

function entityType(entity) {
  const type = clean(entity?.entity_type).toLocaleLowerCase();
  return ['asset', 'drug'].includes(type) ? type : 'company';
}

function entityLabel(entity) {
  const type = entityType(entity);
  if (type === 'drug') return 'Drug developer';
  if (type === 'asset') return 'Clinical asset';
  return 'Company';
}

function commercialStage(value) {
  const status = clean(value);
  const normalized = status.toLocaleLowerCase();
  if (!normalized) return 'Not specified';
  if (
    normalized.startsWith('yes')
    || normalized.startsWith('commercial')
    || normalized.startsWith('commercialised')
  ) return 'Commercial';
  if (normalized.startsWith('early') || normalized.startsWith('partial')) return 'Early commercial';
  if (
    normalized.includes('pilot')
    || normalized.includes('field trial')
    || normalized.includes('initial sale')
  ) return 'Pilot';
  if (
    normalized.includes('pre-commercial')
    || normalized.includes('preclinical')
    || normalized.includes('prototype')
    || normalized.includes('proof of concept')
    || normalized.includes('r&d')
    || normalized.includes('developing')
    || normalized.includes('research use')
    || normalized.startsWith('no /')
  ) return 'Pre-commercial';
  return status;
}

function safeWebsite(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`API ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function getDirectory() {
  if (!directoryCache) {
    directoryCache = fetchJson('/api/companies').then((payload) => ({
      companies: Array.isArray(payload.companies) ? payload.companies : [],
      screening: payload.screening && typeof payload.screening === 'object' ? payload.screening : {},
    })).catch((error) => {
      directoryCache = null;
      throw error;
    });
  }
  return directoryCache;
}

async function getAssetsDirectory() {
  if (!assetsCache) {
    assetsCache = fetchJson('/api/assets').then((payload) => ({
      assets: Array.isArray(payload.assets) ? payload.assets : [],
      assetCount: Number(payload.asset_count || 0),
      mainCount: Number(payload.main_count || 0),
      pendingCount: Number(payload.pending_count || 0),
    })).catch((error) => {
      assetsCache = null;
      throw error;
    });
  }
  return assetsCache;
}

function detailRow(label, value) {
  const text = clean(value);
  if (!text || text === '—') return null;
  const wrapper = createElement('div', 'detail-row');
  wrapper.append(createElement('dt', '', label), createElement('dd', '', text));
  return wrapper;
}

function companyCard(company) {
  const article = createElement('article', 'company-card');
  article.dataset.state = stateClass(company.public_state);
  article.dataset.entityType = entityType(company);
  const button = createElement('button', 'card-button');
  button.type = 'button';
  button.setAttribute('aria-label', `View ${clean(company.name) || entityLabel(company).toLocaleLowerCase()}`);

  const topLine = createElement('div', 'card-topline');
  const pill = createElement('span', `state-pill ${stateClass(company.public_state)}`, clean(company.public_state) || 'Listed');
  topLine.append(pill, createElement('span', 'card-arrow', '↗'));
  topLine.lastElementChild.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  const metadata = entityType(company) === 'company'
    ? [clean(company.category), clean(company.country)]
    : [entityLabel(company), clean(company.category), clean(company.country)];
  body.append(
    createElement('p', 'card-meta', metadata.filter(Boolean).join(' · ') || entityLabel(company)),
    createElement('h3', '', clean(company.name) || 'Unnamed company'),
    createElement('p', 'card-summary', fallbackSummary(company)),
  );

  const commercial = `Commercial stage · ${commercialStage(company.commercialised)}`;
  const cardFooter = createElement('div', 'card-footer');
  const investors = Array.isArray(company.investors) ? company.investors : [];
  if (investors.length) {
    const names = investors.slice(0, 3).map((investor) => investor.name).join(' · ');
    const remainder = investors.length > 3 ? ` +${investors.length - 3}` : '';
    cardFooter.append(createElement('p', 'card-investors', `Investors · ${names}${remainder}`));
  }
  cardFooter.append(createElement('p', 'card-commercial', commercial));
  button.append(topLine, body, cardFooter);
  button.addEventListener('click', () => openCompany(company));
  article.append(button);
  return article;
}

function renderCompanyGrid(grid, companies) {
  grid.replaceChildren(...companies.map(companyCard));
  grid.setAttribute('aria-busy', 'false');
}

function openCompany(company) {
  const container = document.createElement('div');
  const pill = createElement('span', `state-pill ${stateClass(company.public_state)}`, clean(company.public_state) || 'Listed');
  const title = createElement('h2', '', clean(company.name) || entityLabel(company));
  title.id = 'dialog-title';
  const meta = createElement(
    'p',
    'dialog-meta',
    [entityType(company) === 'company' ? '' : entityLabel(company), clean(company.category), clean(company.country)]
      .filter(Boolean).join(' · ') || `${entityLabel(company)} profile`,
  );
  const summary = createElement('p', 'dialog-summary', fallbackSummary(company));
  const details = createElement('dl', 'detail-list');
  [
    detailRow('Commercial status', company.commercialised),
    company.public_state === 'Pending' ? detailRow('What is still needed', company.what_it_needs_to_qualify) : null,
    detailRow('Assessment notes', company.notes),
    detailRow('Last reviewed', formatDate(company.last_reviewed)),
    detailRow('Methodology', company.methodology_version),
  ].filter(Boolean).forEach((row) => details.append(row));
  container.append(pill, title, meta, summary, details);

  const profileLinks = createElement('div', 'profile-links');
  if (clean(company.country)) {
    const countryLink = createElement('a', 'secondary-link', `Explore ${company.country}`);
    countryLink.href = `/countries/${countrySlug(company.country)}`;
    countryLink.dataset.route = '';
    profileLinks.append(countryLink);
  }
  if (Array.isArray(company.investors)) {
    for (const investor of company.investors) {
      const investorLink = createElement('a', 'secondary-link', investor.name);
      investorLink.href = `/investors/${investor.slug}`;
      investorLink.dataset.route = '';
      profileLinks.append(investorLink);
    }
  }
  if (profileLinks.childElementCount) container.append(profileLinks);

  const website = safeWebsite(company.website);
  if (website) {
    const link = createElement('a', 'website-link', `Visit ${title.textContent} ↗`);
    link.href = website.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    container.append(link);
  }

  dialogContent.replaceChildren(container);
  dialog.showModal();
}

function countrySlug(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addOptions(select, values) {
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function setupDirectoryFilters(entities, labels = {}) {
  const singular = labels.singular || 'company';
  const pluralForm = labels.plural || 'companies';
  const elements = {
    grid: document.querySelector('#company-grid'),
    search: document.querySelector('#search'),
    stateFilter: document.querySelector('#state-filter'),
    categoryFilter: document.querySelector('#category-filter'),
    countryFilter: document.querySelector('#country-filter'),
    investorFilter: document.querySelector('#investor-filter'),
    resultCount: document.querySelector('#result-count'),
    emptyState: document.querySelector('#empty-state'),
    clearButton: document.querySelector('#clear-button'),
  };
  const filters = { query: '', state: '', category: '', country: '', investor: '' };

  addOptions(elements.stateFilter, unique(entities.map((entity) => entity.public_state)));
  addOptions(elements.categoryFilter, unique(entities.map((entity) => entity.category)));
  addOptions(elements.countryFilter, unique(entities.map((entity) => entity.country)));
  addOptions(elements.investorFilter, unique(entities.flatMap((entity) =>
    Array.isArray(entity.investors) ? entity.investors.map((investor) => investor.name) : [],
  )));

  const update = () => {
    const query = filters.query.toLocaleLowerCase();
    const filtered = entities.filter((entity) => {
      const investorNames = Array.isArray(entity.investors)
        ? entity.investors.map((investor) => investor.name)
        : [];
      const haystack = [entity.name, entity.category, entity.country, entity.evidence_summary, ...investorNames]
        .map(clean).join(' ').toLocaleLowerCase();
      return (!query || haystack.includes(query))
        && (!filters.state || entity.public_state === filters.state)
        && (!filters.category || entity.category === filters.category)
        && (!filters.country || entity.country === filters.country)
        && (!filters.investor || investorNames.includes(filters.investor));
    });
    elements.resultCount.textContent = plural(filtered.length, singular, pluralForm);
    elements.emptyState.hidden = filtered.length > 0;
    renderCompanyGrid(elements.grid, filtered);
  };

  elements.search.addEventListener('input', (event) => { filters.query = event.currentTarget.value.trim(); update(); });
  elements.stateFilter.addEventListener('change', (event) => { filters.state = event.currentTarget.value; update(); });
  elements.categoryFilter.addEventListener('change', (event) => { filters.category = event.currentTarget.value; update(); });
  elements.countryFilter.addEventListener('change', (event) => { filters.country = event.currentTarget.value; update(); });
  elements.investorFilter.addEventListener('change', (event) => { filters.investor = event.currentTarget.value; update(); });
  elements.clearButton.addEventListener('click', () => {
    Object.assign(filters, { query: '', state: '', category: '', country: '', investor: '' });
    elements.search.value = '';
    elements.stateFilter.value = '';
    elements.categoryFilter.value = '';
    elements.countryFilter.value = '';
    elements.investorFilter.value = '';
    update();
  });
  update();
}

function showLoading(label = 'Loading from Neon…') {
  appMain.innerHTML = `
    <section class="loading-view" aria-live="polite">
      <span class="loading-dot" aria-hidden="true"></span>
      <p>${label}</p>
    </section>
  `;
}

function renderFailure() {
  document.title = 'Temporarily unavailable — useful.vc';
  appMain.innerHTML = `
    <section class="message-view">
      <p class="eyebrow">Connection issue</p>
      <h1>We could not load this page.</h1>
      <p>The directory is still safe in Neon. Please try again in a moment.</p>
      <button class="primary-button" id="page-retry" type="button">Retry</button>
    </section>
  `;
  document.querySelector('#page-retry').addEventListener('click', route);
}

function renderNotFound(type) {
  document.title = `${type} not found — useful.vc`;
  appMain.innerHTML = `
    <section class="message-view">
      <p class="eyebrow">Not found</p>
      <h1>This ${type.toLowerCase()} is not published.</h1>
      <p>It may have moved, or it may not belong to the public directory.</p>
      <a class="website-link" href="/" data-route>Back to the directory</a>
    </section>
  `;
}

async function renderHome(version) {
  document.title = 'useful.vc — Companies worth knowing';
  appMain.innerHTML = `
    <section class="hero" aria-labelledby="hero-title">
      <p class="eyebrow">The useful company index</p>
      <h1 id="hero-title">Companies moving the world<br />in a useful direction.</h1>
      <p class="hero-copy">Every company is screened against eight structural criteria. Companies that pass are listed as Main when evidence-ready or Pending when further proof is still required. The rest are not published.</p>
      <div class="stats screening-stats" aria-label="Screening outcomes">
        <div><strong id="screened-count">—</strong><span>Fully screened</span></div>
        <div><strong id="main-percentage">—</strong><span id="main-outcome">Reached Main</span></div>
        <div><strong id="pending-percentage">—</strong><span id="pending-outcome">Are Pending</span></div>
      </div>
      <p id="screening-note" class="screening-note">Percentages use all fully screened companies as the denominator.</p>
    </section>
    <section class="directory" aria-labelledby="directory-title">
      <div class="directory-heading">
        <div><p class="eyebrow">Directory</p><h2 id="directory-title">Explore the companies</h2></div>
        <p id="result-count" class="result-count" aria-live="polite">Loading from Neon…</p>
      </div>
      <div class="filters" aria-label="Directory filters">
        <label class="search-field"><span class="sr-only">Search companies and investors</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg><input id="search" type="search" placeholder="Search company, sector, country or investor" autocomplete="off" /></label>
        <label><span class="sr-only">Status</span><select id="state-filter"><option value="">All statuses</option></select></label>
        <label><span class="sr-only">Sector</span><select id="category-filter"><option value="">All sectors</option></select></label>
        <label><span class="sr-only">Country</span><select id="country-filter"><option value="">All countries</option></select></label>
        <label><span class="sr-only">Investor</span><select id="investor-filter"><option value="">All investors</option></select></label>
      </div>
      <div id="empty-state" class="notice" hidden><strong>No company matches these filters.</strong><button id="clear-button" type="button">Clear filters</button></div>
      <div id="company-grid" class="company-grid" aria-busy="true"></div>
    </section>
    <section id="method" class="method" aria-labelledby="method-title">
      <div><p class="eyebrow">How selection works</p><h2 id="method-title">Strict by design.</h2></div>
      <div class="method-copy">
        <p>Inclusion requires a pass on all eight structural criteria. A company with a clear structural failure is excluded from the public directory.</p>
        <p><strong>Main</strong> companies combine structural alignment with adequate commercial and independent evidence. <strong>Pending</strong> companies pass structurally but still need specified evidence before joining the main list.</p>
        <p class="source-note">These pages are generated live from the canonical Neon database.</p>
      </div>
    </section>
  `;

  const { companies, screening } = await getDirectory();
  if (version !== routeVersion) return;

  const screenedCount = Number(screening.screenedCount || 0);
  const mainCount = Number(screening.mainCount || 0);
  const pendingCount = Number(screening.pendingCount || 0);
  const notPublishedCount = Number(screening.notPublishedCount || 0);
  document.querySelector('#screened-count').textContent = String(screenedCount || '—');
  document.querySelector('#main-percentage').textContent = `${Number(screening.mainPercentage || 0).toFixed(1)}%`;
  document.querySelector('#pending-percentage').textContent = `${Number(screening.pendingPercentage || 0).toFixed(1)}%`;
  document.querySelector('#main-outcome').textContent = `${mainCount} reached Main`;
  document.querySelector('#pending-outcome').textContent = `${pendingCount} are Pending`;
  document.querySelector('#screening-note').textContent = `Percentages use all ${screenedCount} fully screened companies as the denominator. The remaining ${notPublishedCount} are not published.`;
  setupDirectoryFilters(companies);
}

async function renderAssets(version) {
  document.title = 'Clinical assets & drugs — useful.vc';
  showLoading('Loading clinical assets and drugs from Neon…');
  const payload = await getAssetsDirectory();
  if (version !== routeVersion) return;
  const assets = payload.assets;
  appMain.innerHTML = `
    <section class="page-hero compact-hero asset-hero">
      <p class="eyebrow">Drugs, diagnostics & clinical devices</p>
      <h1>Useful clinical assets,<br />listed on their own terms.</h1>
      <p class="hero-copy">Therapeutic programs, pathology-specific diagnostics, implants and invasive interventions are screened with the same rigor as companies, but kept separate so the company directory stays a company directory.</p>
      <div class="stats"><div><strong>${payload.assetCount}</strong><span>Published clinical assets</span></div><div><strong>${payload.mainCount}</strong><span>Main</span></div><div><strong>${payload.pendingCount}</strong><span>Pending</span></div></div>
    </section>
    <section class="directory detail-directory" aria-labelledby="asset-directory-title">
      <div class="directory-heading">
        <div><p class="eyebrow">Separate directory</p><h2 id="asset-directory-title">Explore clinical assets & drugs</h2></div>
        <p id="result-count" class="result-count" aria-live="polite">${plural(assets.length, 'clinical asset', 'clinical assets')}</p>
      </div>
      <div class="filters" aria-label="Clinical asset and drug filters">
        <label class="search-field"><span class="sr-only">Search clinical assets, drugs and investors</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg><input id="search" type="search" placeholder="Search diagnostic, device, drug, pathology or investor" autocomplete="off" /></label>
        <label><span class="sr-only">Status</span><select id="state-filter"><option value="">All statuses</option></select></label>
        <label><span class="sr-only">Sector</span><select id="category-filter"><option value="">All sectors</option></select></label>
        <label><span class="sr-only">Country</span><select id="country-filter"><option value="">All countries</option></select></label>
        <label><span class="sr-only">Investor</span><select id="investor-filter"><option value="">All investors</option></select></label>
      </div>
      <div id="empty-state" class="notice" hidden><strong>No clinical asset matches these filters.</strong><button id="clear-button" type="button">Clear filters</button></div>
      <div id="company-grid" class="company-grid" aria-busy="true"></div>
    </section>
  `;
  setupDirectoryFilters(assets, { singular: 'clinical asset', plural: 'clinical assets' });
}

function appendCountryCard(grid, country) {
  const link = createElement('a', 'entity-card');
  link.href = `/countries/${country.slug}`;
  link.dataset.route = '';
  const top = createElement('div', 'entity-card-top');
  top.append(createElement('span', 'entity-kicker', plural(country.company_count, 'company', 'companies')), createElement('span', 'card-arrow', '↗'));
  const title = createElement('h2', '', country.name);
  const summary = createElement('p', 'entity-summary', country.categories.length ? country.categories.join(' · ') : 'Public company directory');
  const split = createElement('p', 'entity-foot', `${country.main_count} Main · ${country.pending_count} Pending`);
  link.append(top, title, summary, split);
  grid.append(link);
}

async function renderCountries(version) {
  document.title = 'Countries — useful.vc';
  showLoading('Loading countries from Neon…');
  const payload = await fetchJson('/api/countries');
  if (version !== routeVersion) return;
  const countries = Array.isArray(payload.countries) ? payload.countries : [];
  appMain.innerHTML = `
    <section class="page-hero compact-hero">
      <p class="eyebrow">Geography</p>
      <h1>Useful companies,<br />country by country.</h1>
      <p class="hero-copy">Explore the public directory through the places where these companies are headquartered and operating.</p>
      <div class="stats"><div><strong>${countries.length}</strong><span>Countries</span></div><div><strong>${payload.company_count || 0}</strong><span>Companies with country data</span></div></div>
    </section>
    <section class="listing-section">
      <div class="section-heading"><div><p class="eyebrow">Country index</p><h2>Explore by country</h2></div></div>
      <div id="country-grid" class="entity-grid"></div>
    </section>
  `;
  const grid = document.querySelector('#country-grid');
  countries.forEach((country) => appendCountryCard(grid, country));
}

async function renderCountryDetail(version, slug) {
  showLoading('Loading country profile from Neon…');
  let payload;
  try {
    payload = await fetchJson(`/api/countries/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error.status === 404) { renderNotFound('Country'); return; }
    throw error;
  }
  if (version !== routeVersion) return;
  const { country } = payload;
  const companies = Array.isArray(payload.companies) ? payload.companies : [];
  document.title = `${country.name} — useful.vc`;
  appMain.innerHTML = `
    <section class="page-hero detail-hero">
      <a class="back-link" href="/countries" data-route>← All countries</a>
      <p class="eyebrow">Country profile</p>
      <h1 id="entity-title"></h1>
      <p class="hero-copy">Public companies from this geography that currently meet the useful.vc structural criteria.</p>
      <div class="stats"><div><strong>${country.company_count}</strong><span>Published</span></div><div><strong>${country.main_count}</strong><span>Main list</span></div><div><strong>${country.pending_count}</strong><span>Pending</span></div></div>
    </section>
    <section class="directory detail-directory">
      <div class="directory-heading"><div><p class="eyebrow">Directory</p><h2 id="country-directory-title"></h2></div><p class="result-count">${plural(companies.length, 'company', 'companies')}</p></div>
      <div id="company-grid" class="company-grid" aria-busy="true"></div>
    </section>
  `;
  document.querySelector('#entity-title').textContent = country.name;
  document.querySelector('#country-directory-title').textContent = `Companies in ${country.name}`;
  renderCompanyGrid(document.querySelector('#company-grid'), companies);
}

function investorDescription(investor) {
  if (clean(investor.fund_type)) return investor.fund_type;
  if (clean(investor.notes)) return investor.notes;
  const sources = Array.isArray(investor.source_types) ? investor.source_types.filter(clean) : [];
  if (sources.length) return `Recorded as ${sources.join(' and ').toLowerCase()} in the source research.`;
  return 'Investor connected to one or more companies in the public directory.';
}

function appendInvestorCard(grid, investor) {
  const link = createElement('a', 'entity-card fund-card');
  link.href = `/investors/${investor.slug}`;
  link.dataset.route = '';
  const top = createElement('div', 'entity-card-top');
  top.append(
    createElement('span', 'entity-kicker', plural(investor.company_count, 'public company', 'public companies')),
    createElement('span', 'card-arrow', '↗'),
  );
  link.append(
    top,
    createElement('h2', '', investor.name),
    createElement('p', 'entity-summary', investorDescription(investor)),
    createElement('p', 'entity-foot', `${investor.main_count} Main · ${investor.pending_count} Pending`),
  );
  grid.append(link);
}

async function renderInvestors(version) {
  document.title = 'Investors — useful.vc';
  showLoading('Loading investors from Neon…');
  const payload = await fetchJson('/api/investors');
  if (version !== routeVersion) return;
  const investors = Array.isArray(payload.investors) ? payload.investors : [];
  appMain.innerHTML = `
    <section class="page-hero compact-hero vc-hero">
      <p class="eyebrow">Capital network</p>
      <h1>Investors backing<br />useful companies.</h1>
      <p class="hero-copy">Every investor recorded during company research, made searchable whenever it is linked to a company in the public directory.</p>
      <div class="stats"><div><strong>${investors.length}</strong><span>Recorded investors</span></div><div><strong>${payload.company_count || 0}</strong><span>Linked public companies</span></div></div>
    </section>
    <section class="listing-section">
      <div class="section-heading"><div><p class="eyebrow">Investor index</p><h2>Explore the investors</h2></div><p id="investor-result-count" class="result-count" aria-live="polite"></p></div>
      <label class="search-field entity-search"><span class="sr-only">Search investors</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg><input id="investor-search" type="search" placeholder="Search fund or investor" autocomplete="off" /></label>
      <div id="investor-empty" class="notice" hidden><strong>No investor matches this search.</strong><button id="investor-clear" type="button">Clear search</button></div>
      <div id="investor-grid" class="entity-grid fund-grid"></div>
    </section>
  `;
  const grid = document.querySelector('#investor-grid');
  const search = document.querySelector('#investor-search');
  const resultCount = document.querySelector('#investor-result-count');
  const emptyState = document.querySelector('#investor-empty');
  const clearButton = document.querySelector('#investor-clear');
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = investors.filter((investor) =>
      [investor.name, investor.fund_type, investor.notes, ...(investor.source_types || [])]
        .map(clean).join(' ').toLocaleLowerCase().includes(query),
    );
    grid.replaceChildren();
    filtered.forEach((investor) => appendInvestorCard(grid, investor));
    resultCount.textContent = plural(filtered.length, 'investor');
    emptyState.hidden = filtered.length > 0;
  };
  search.addEventListener('input', update);
  clearButton.addEventListener('click', () => { search.value = ''; update(); search.focus(); });
  update();
}

function appendInvestorMetadata(container, investor) {
  const list = createElement('dl', 'fund-details');
  [
    detailRow('Fund type', investor.fund_type),
    detailRow('Country', investor.country),
    detailRow('Review status', investor.status),
    detailRow('France qualification', investor.france_qualification),
    detailRow('Research source', Array.isArray(investor.source_types) ? investor.source_types.join(' · ') : ''),
    detailRow('Portfolio companies found', investor.portfolio_companies_found ? String(investor.portfolio_companies_found) : ''),
    detailRow('Companies processed', investor.companies_processed ? String(investor.companies_processed) : ''),
    detailRow('Last scanned', formatDate(investor.last_scanned)),
  ].filter(Boolean).forEach((row) => list.append(row));
  if (list.childElementCount) container.append(list);

  const links = createElement('div', 'profile-links');
  const website = safeWebsite(investor.website);
  if (website) {
    const link = createElement('a', 'website-link', `Visit ${investor.name} ↗`);
    link.href = website.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.append(link);
  }
  const portfolio = safeWebsite(investor.portfolio_url);
  if (portfolio && (!website || portfolio.href !== website.href)) {
    const link = createElement('a', 'secondary-link', 'View source portfolio ↗');
    link.href = portfolio.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.append(link);
  }
  if (links.childElementCount) container.append(links);
}

async function renderInvestorDetail(version, slug, legacyPath = false) {
  showLoading('Loading investor profile from Neon…');
  let payload;
  try {
    payload = await fetchJson(`/api/investors/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error.status === 404) { renderNotFound('Investor'); return; }
    throw error;
  }
  if (version !== routeVersion) return;
  const { investor } = payload;
  const companies = Array.isArray(payload.companies) ? payload.companies : [];
  if (legacyPath) window.history.replaceState({}, '', `/investors/${investor.slug}`);
  document.title = `${investor.name} — useful.vc`;
  appMain.innerHTML = `
    <section class="page-hero detail-hero vc-detail-hero">
      <a class="back-link" href="/investors" data-route>← All investors</a>
      <p class="eyebrow">Investor profile</p>
      <h1 id="entity-title"></h1>
      <p id="investor-summary" class="hero-copy"></p>
      <div class="stats"><div><strong>${investor.company_count}</strong><span>Published</span></div><div><strong>${investor.main_count}</strong><span>Main list</span></div><div><strong>${investor.pending_count}</strong><span>Pending</span></div></div>
      <div id="investor-metadata" class="fund-metadata"></div>
    </section>
    <section class="directory detail-directory">
      <div class="directory-heading"><div><p class="eyebrow">Recorded investments</p><h2>Companies in the directory</h2></div><p class="result-count">${plural(companies.length, 'company', 'companies')}</p></div>
      <div id="company-grid" class="company-grid" aria-busy="true"></div>
    </section>
  `;
  document.querySelector('#entity-title').textContent = investor.name;
  document.querySelector('#investor-summary').textContent = investorDescription(investor);
  appendInvestorMetadata(document.querySelector('#investor-metadata'), investor);
  renderCompanyGrid(document.querySelector('#company-grid'), companies);
}

function setActiveNavigation(pathname) {
  const activePath = pathname.replace(/^\/vcs(?=\/|$)/, '/investors');
  document.querySelectorAll('.site-nav a').forEach((link) => {
    const linkPath = new URL(link.href).pathname;
    const active = linkPath === '/'
      ? activePath === '/'
      : activePath === linkPath || activePath.startsWith(`${linkPath}/`);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

async function route() {
  const version = ++routeVersion;
  if (dialog.open) dialog.close();
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  setActiveNavigation(pathname);

  try {
    if (pathname === '/') await renderHome(version);
    else if (pathname === '/assets') await renderAssets(version);
    else if (pathname === '/countries') await renderCountries(version);
    else if (pathname.startsWith('/countries/')) await renderCountryDetail(version, decodeURIComponent(pathname.slice('/countries/'.length)));
    else if (pathname === '/investors') await renderInvestors(version);
    else if (pathname.startsWith('/investors/')) await renderInvestorDetail(version, decodeURIComponent(pathname.slice('/investors/'.length)));
    else if (pathname === '/vcs') {
      window.history.replaceState({}, '', '/investors');
      await renderInvestors(version);
    }
    else if (pathname.startsWith('/vcs/')) await renderInvestorDetail(version, decodeURIComponent(pathname.slice('/vcs/'.length)), true);
    else renderNotFound('Page');
  } catch (error) {
    console.error(error);
    if (version === routeVersion) renderFailure();
    return;
  }

  if (version !== routeVersion) return;
  if (window.location.hash) {
    requestAnimationFrame(() => document.querySelector(window.location.hash)?.scrollIntoView());
  } else {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-route]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  event.preventDefault();
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  route();
});

window.addEventListener('popstate', route);
dialogClose.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

route();
