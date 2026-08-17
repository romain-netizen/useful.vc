const appMain = document.querySelector('#app-main');
const dialog = document.querySelector('#company-dialog');
const dialogContent = document.querySelector('#dialog-content');
const dialogClose = document.querySelector('#dialog-close');
let routeVersion = 0;
let companyCache = null;

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
  if (clean(company.notes)) return company.notes;
  return 'Open the profile to review the current assessment.';
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

async function getCompanies() {
  if (!companyCache) {
    companyCache = fetchJson('/api/companies').then((payload) =>
      Array.isArray(payload.companies) ? payload.companies : [],
    ).catch((error) => {
      companyCache = null;
      throw error;
    });
  }
  return companyCache;
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
  const button = createElement('button', 'card-button');
  button.type = 'button';
  button.setAttribute('aria-label', `View ${clean(company.name) || 'company'}`);

  const topLine = createElement('div', 'card-topline');
  const pill = createElement('span', `state-pill ${stateClass(company.public_state)}`, clean(company.public_state) || 'Listed');
  topLine.append(pill, createElement('span', 'card-arrow', '↗'));
  topLine.lastElementChild.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.append(
    createElement('p', 'card-meta', [clean(company.category), clean(company.country)].filter(Boolean).join(' · ') || 'Company'),
    createElement('h3', '', clean(company.name) || 'Unnamed company'),
    createElement('p', 'card-summary', fallbackSummary(company)),
  );

  const commercial = clean(company.commercialised)
    ? `Commercial status · ${company.commercialised}`
    : 'Commercial status · Not specified';
  button.append(topLine, body, createElement('p', 'card-commercial', commercial));
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
  const title = createElement('h2', '', clean(company.name) || 'Company');
  title.id = 'dialog-title';
  const meta = createElement(
    'p',
    'dialog-meta',
    [clean(company.category), clean(company.country)].filter(Boolean).join(' · ') || 'Company profile',
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
  if (Array.isArray(company.vc_funds)) {
    for (const fund of company.vc_funds) {
      const fundLink = createElement('a', 'secondary-link', fund.name);
      fundLink.href = `/vcs/${fund.slug}`;
      fundLink.dataset.route = '';
      profileLinks.append(fundLink);
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
      <p class="hero-copy">A selective, evidence-led directory. Every company is assessed against eight structural criteria, then reviewed for commercial and evidentiary readiness.</p>
      <div class="stats" aria-label="Directory summary">
        <div><strong id="total-count">—</strong><span>Published</span></div>
        <div><strong id="main-count">—</strong><span>Main list</span></div>
        <div><strong id="pending-count">—</strong><span>Pending evidence</span></div>
      </div>
    </section>
    <section class="directory" aria-labelledby="directory-title">
      <div class="directory-heading">
        <div><p class="eyebrow">Directory</p><h2 id="directory-title">Explore the companies</h2></div>
        <p id="result-count" class="result-count" aria-live="polite">Loading from Neon…</p>
      </div>
      <div class="filters" aria-label="Directory filters">
        <label class="search-field"><span class="sr-only">Search companies</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg><input id="search" type="search" placeholder="Search company, sector or country" autocomplete="off" /></label>
        <label><span class="sr-only">Status</span><select id="state-filter"><option value="">All statuses</option></select></label>
        <label><span class="sr-only">Sector</span><select id="category-filter"><option value="">All sectors</option></select></label>
        <label><span class="sr-only">Country</span><select id="country-filter"><option value="">All countries</option></select></label>
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

  const companies = await getCompanies();
  if (version !== routeVersion) return;
  const elements = {
    grid: document.querySelector('#company-grid'),
    search: document.querySelector('#search'),
    stateFilter: document.querySelector('#state-filter'),
    categoryFilter: document.querySelector('#category-filter'),
    countryFilter: document.querySelector('#country-filter'),
    resultCount: document.querySelector('#result-count'),
    emptyState: document.querySelector('#empty-state'),
    clearButton: document.querySelector('#clear-button'),
  };
  const filters = { query: '', state: '', category: '', country: '' };

  document.querySelector('#total-count').textContent = String(companies.length);
  document.querySelector('#main-count').textContent = String(companies.filter((company) => company.public_state === 'Main').length);
  document.querySelector('#pending-count').textContent = String(companies.filter((company) => company.public_state === 'Pending').length);
  addOptions(elements.stateFilter, unique(companies.map((company) => company.public_state)));
  addOptions(elements.categoryFilter, unique(companies.map((company) => company.category)));
  addOptions(elements.countryFilter, unique(companies.map((company) => company.country)));

  const update = () => {
    const query = filters.query.toLocaleLowerCase();
    const filtered = companies.filter((company) => {
      const haystack = [company.name, company.category, company.country, company.evidence_summary]
        .map(clean).join(' ').toLocaleLowerCase();
      return (!query || haystack.includes(query))
        && (!filters.state || company.public_state === filters.state)
        && (!filters.category || company.category === filters.category)
        && (!filters.country || company.country === filters.country);
    });
    elements.resultCount.textContent = plural(filtered.length, 'company', 'companies');
    elements.emptyState.hidden = filtered.length > 0;
    renderCompanyGrid(elements.grid, filtered);
  };

  elements.search.addEventListener('input', (event) => { filters.query = event.currentTarget.value.trim(); update(); });
  elements.stateFilter.addEventListener('change', (event) => { filters.state = event.currentTarget.value; update(); });
  elements.categoryFilter.addEventListener('change', (event) => { filters.category = event.currentTarget.value; update(); });
  elements.countryFilter.addEventListener('change', (event) => { filters.country = event.currentTarget.value; update(); });
  elements.clearButton.addEventListener('click', () => {
    Object.assign(filters, { query: '', state: '', category: '', country: '' });
    elements.search.value = '';
    elements.stateFilter.value = '';
    elements.categoryFilter.value = '';
    elements.countryFilter.value = '';
    update();
  });
  update();
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

function appendFundCard(grid, fund) {
  const link = createElement('a', 'entity-card fund-card');
  link.href = `/vcs/${fund.slug}`;
  link.dataset.route = '';
  const top = createElement('div', 'entity-card-top');
  top.append(createElement('span', 'entity-kicker', clean(fund.status) || 'Portfolio reviewed'), createElement('span', 'card-arrow', '↗'));
  link.append(
    top,
    createElement('h2', '', fund.name),
    createElement('p', 'entity-summary', clean(fund.fund_type) || clean(fund.notes) || 'Venture fund represented in the useful.vc directory.'),
    createElement('p', 'entity-foot', `${plural(fund.company_count, 'published company', 'published companies')} · ${fund.main_count} Main · ${fund.pending_count} Pending`),
  );
  grid.append(link);
}

async function renderVcs(version) {
  document.title = 'VC Funds — useful.vc';
  showLoading('Loading VC funds from Neon…');
  const payload = await fetchJson('/api/vcs');
  if (version !== routeVersion) return;
  const funds = Array.isArray(payload.funds) ? payload.funds : [];
  appMain.innerHTML = `
    <section class="page-hero compact-hero vc-hero">
      <p class="eyebrow">Venture portfolios</p>
      <h1>Funds backing<br />useful companies.</h1>
      <p class="hero-copy">A public view of the real named funds whose portfolios intersect with the useful.vc directory.</p>
      <div class="stats"><div><strong>${funds.length}</strong><span>Named funds</span></div><div><strong>${payload.company_count || 0}</strong><span>Linked public companies</span></div></div>
    </section>
    <section class="listing-section">
      <div class="section-heading"><div><p class="eyebrow">VC index</p><h2>Explore the funds</h2></div></div>
      <div id="fund-grid" class="entity-grid fund-grid"></div>
    </section>
  `;
  const grid = document.querySelector('#fund-grid');
  funds.forEach((fund) => appendFundCard(grid, fund));
}

function appendFundMetadata(container, fund) {
  const list = createElement('dl', 'fund-details');
  [
    detailRow('Fund type', fund.fund_type),
    detailRow('Country', fund.country),
    detailRow('Review status', fund.status),
    detailRow('France qualification', fund.france_qualification),
    detailRow('Portfolio companies found', fund.portfolio_companies_found ? String(fund.portfolio_companies_found) : ''),
    detailRow('Companies processed', fund.companies_processed ? String(fund.companies_processed) : ''),
    detailRow('Last scanned', formatDate(fund.last_scanned)),
  ].filter(Boolean).forEach((row) => list.append(row));
  if (list.childElementCount) container.append(list);

  const links = createElement('div', 'profile-links');
  const website = safeWebsite(fund.website);
  if (website) {
    const link = createElement('a', 'website-link', `Visit ${fund.name} ↗`);
    link.href = website.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.append(link);
  }
  const portfolio = safeWebsite(fund.portfolio_url);
  if (portfolio && (!website || portfolio.href !== website.href)) {
    const link = createElement('a', 'secondary-link', 'View source portfolio ↗');
    link.href = portfolio.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.append(link);
  }
  if (links.childElementCount) container.append(links);
}

async function renderVcDetail(version, slug) {
  showLoading('Loading fund profile from Neon…');
  let payload;
  try {
    payload = await fetchJson(`/api/vcs/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error.status === 404) { renderNotFound('VC fund'); return; }
    throw error;
  }
  if (version !== routeVersion) return;
  const { fund } = payload;
  const companies = Array.isArray(payload.companies) ? payload.companies : [];
  document.title = `${fund.name} — useful.vc`;
  appMain.innerHTML = `
    <section class="page-hero detail-hero vc-detail-hero">
      <a class="back-link" href="/vcs" data-route>← All VC funds</a>
      <p class="eyebrow">VC fund profile</p>
      <h1 id="entity-title"></h1>
      <p id="fund-summary" class="hero-copy"></p>
      <div class="stats"><div><strong>${fund.company_count}</strong><span>Published</span></div><div><strong>${fund.main_count}</strong><span>Main list</span></div><div><strong>${fund.pending_count}</strong><span>Pending</span></div></div>
      <div id="fund-metadata" class="fund-metadata"></div>
    </section>
    <section class="directory detail-directory">
      <div class="directory-heading"><div><p class="eyebrow">Portfolio intersection</p><h2>Companies in the directory</h2></div><p class="result-count">${plural(companies.length, 'company', 'companies')}</p></div>
      <div id="company-grid" class="company-grid" aria-busy="true"></div>
    </section>
  `;
  document.querySelector('#entity-title').textContent = fund.name;
  document.querySelector('#fund-summary').textContent = clean(fund.notes) || clean(fund.fund_type) || 'A named venture fund represented in the useful.vc directory.';
  appendFundMetadata(document.querySelector('#fund-metadata'), fund);
  renderCompanyGrid(document.querySelector('#company-grid'), companies);
}

function setActiveNavigation(pathname) {
  document.querySelectorAll('.site-nav a').forEach((link) => {
    const linkPath = new URL(link.href).pathname;
    const active = linkPath === '/'
      ? pathname === '/'
      : pathname === linkPath || pathname.startsWith(`${linkPath}/`);
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
    else if (pathname === '/countries') await renderCountries(version);
    else if (pathname.startsWith('/countries/')) await renderCountryDetail(version, decodeURIComponent(pathname.slice('/countries/'.length)));
    else if (pathname === '/vcs') await renderVcs(version);
    else if (pathname.startsWith('/vcs/')) await renderVcDetail(version, decodeURIComponent(pathname.slice('/vcs/'.length)));
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
