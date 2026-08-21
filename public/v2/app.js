const state = {
  page: 1,
  pages: 1,
  collection: '',
  loading: false,
};

const form = document.querySelector('#filters-form');
const list = document.querySelector('#company-list');
const count = document.querySelector('#result-count');
const title = document.querySelector('#results-title');
const previous = document.querySelector('#previous');
const next = document.querySelector('#next');
const pageLabel = document.querySelector('#page-label');
const dialog = document.querySelector('#company-dialog');
const detail = document.querySelector('#company-detail');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shortList(items, limit = 4) {
  const names = (items || []).map((item) => item.name).filter(Boolean);
  if (!names.length) return 'Not yet researched';
  const visible = names.slice(0, limit);
  return visible.join(', ') + (names.length > limit ? ` +${names.length - limit}` : '');
}

function stateClass(value) {
  return String(value || 'No verdict').replaceAll(' ', '-');
}

function authorityLabel(authority) {
  return {
    signed: 'Signed verdict',
    unsigned_shadow: 'Unsigned research',
    product_split_required: 'Product split required',
    no_verdict: 'No verdict',
    unresearched: 'Not yet assessed',
  }[authority] || 'Not yet assessed';
}

function collectionItems(company) {
  const signed = [...new Set((company.product_units || []).map((unit) => unit.collection).filter(Boolean))];
  if (signed.length) return signed.map((name) => ({ name, provisional: false }));
  if (company.provisional_collection) {
    return [{ name: company.provisional_collection, provisional: true }];
  }
  return [];
}

function companyCard(company) {
  const collections = collectionItems(company);
  const status = [company.operating_status, company.ownership_status].filter(Boolean).join(' · ');
  const founded = company.founding_year || 'Founding date pending';
  const size = company.employee_band && company.employee_band !== 'Unknown'
    ? `${company.employee_band} people`
    : 'Size pending';
  const authority = authorityLabel(company.stateAuthority);
  const authorityClass = company.stateIsSigned ? 'authority-signed' : 'authority-unsigned';
  const completeness = Number(company.completeness_percent || 0);
  return `
    <button class="company-card" type="button" data-company-id="${company.id}">
      <div>
        <p class="company-name">${escapeHtml(company.name)}</p>
        <p class="company-meta">${escapeHtml(company.country || 'Country pending')} · ${escapeHtml(founded)} · ${escapeHtml(size)}</p>
        <p class="company-meta">${escapeHtml(status)}</p>
        <p class="profile-completeness">Profile ${escapeHtml(completeness.toFixed(0))}% complete · ${Number(company.source_count || 0).toLocaleString()} sources</p>
      </div>
      <div>
        <p class="company-summary">${escapeHtml(company.plain_summary || 'Plain-language profile is being researched.')}</p>
        <p class="company-customers"><strong>Customers:</strong> ${escapeHtml(company.customer_summary || 'Not yet researched')}</p>
        <p class="company-investors"><strong>Investors:</strong> ${escapeHtml(shortList(company.investors))}</p>
      </div>
      <div class="company-side">
        <span class="badge ${stateClass(company.state)}">${escapeHtml(company.state)}</span>
        <span class="badge ${authorityClass}">${escapeHtml(authority)}</span>
        ${collections.map(({ name, provisional }) => `<span class="badge collection-badge ${provisional ? 'routing-provisional' : ''}">${escapeHtml(name)}${provisional ? ' · provisional' : ''}</span>`).join('')}
        ${company.legacy_public_state ? `<span class="badge collection-badge">V1: ${escapeHtml(company.legacy_public_state)}</span>` : ''}
      </div>
    </button>`;
}

function formParams() {
  const data = new FormData(form);
  const params = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    const cleaned = String(value).trim();
    if (cleaned) params.set(key, cleaned);
  }
  if (state.collection) params.set('collection', state.collection);
  params.set('page', String(state.page));
  params.set('limit', '30');
  return params;
}

async function loadCompanies() {
  if (state.loading) return;
  state.loading = true;
  list.innerHTML = '<div class="empty">Loading the V2 research directory…</div>';
  try {
    const response = await fetch(`/api/v2/companies?${formParams()}`);
    if (!response.ok) throw new Error(`Directory request failed (${response.status})`);
    const payload = await response.json();
    state.pages = payload.pagination.pages;
    count.textContent = `${payload.pagination.total.toLocaleString()} companies`;
    pageLabel.textContent = `Page ${payload.pagination.page} of ${payload.pagination.pages}`;
    previous.disabled = payload.pagination.page <= 1;
    next.disabled = payload.pagination.page >= payload.pagination.pages;
    title.textContent = state.collection || 'All companies';
    list.innerHTML = payload.companies.length
      ? payload.companies.map(companyCard).join('')
      : '<div class="empty">No company matches these filters.</div>';
    const nextUrl = new URL(window.location.href);
    const publicParams = formParams();
    publicParams.delete('limit');
    nextUrl.search = publicParams.toString();
    history.replaceState({}, '', nextUrl);
  } catch (error) {
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  } finally {
    state.loading = false;
  }
}

function addOptions(select, rows) {
  for (const row of rows || []) {
    const option = document.createElement('option');
    option.value = row.value;
    option.textContent = `${row.value} (${row.count})`;
    select.append(option);
  }
}

async function loadFacets() {
  const response = await fetch('/api/v2/facets');
  if (!response.ok) return;
  const facets = await response.json();
  addOptions(document.querySelector('#country'), facets.countries);
  addOptions(document.querySelector('#operating'), facets.operatingStatuses);
  addOptions(document.querySelector('#ownership'), facets.ownershipStatuses);
  addOptions(document.querySelector('#size'), facets.sizeBands);
  restoreFormFromUrl();
}

async function loadProgress() {
  try {
    const response = await fetch('/api/v2/progress');
    const payload = await response.json();
    const progress = payload.progress || {};
    const engine = payload.engine || {};
    const signed = Number(engine.listed_units || 0) + Number(engine.pending_units || 0) + Number(engine.excluded_units || 0);
    document.querySelector('#progress').innerHTML = `
      <div><strong>${Number(progress.total_companies || 0).toLocaleString()}</strong><span>companies in research</span></div>
      <div><strong>${Number(progress.source_records || 0).toLocaleString()}</strong><span>normalized evidence sources</span></div>
      <div><strong>${signed.toLocaleString()}</strong><span>signed V2 verdicts</span></div>
      <div><strong>${escapeHtml(payload.methodology?.version || 'V2')}</strong><span>methodology version</span></div>`;
    document.querySelector('#methodology-hash').textContent = `Methodology SHA-256: ${payload.methodology?.content_hash || 'unavailable'}`;
  } catch {
    // The directory remains usable if the progress endpoint is temporarily unavailable.
  }
}

function restoreFormFromUrl() {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of params.entries()) {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  }
  const collection = params.get('collection') || '';
  state.collection = collection;
  state.page = Number.parseInt(params.get('page') || '1', 10) || 1;
  document.querySelectorAll('.collection').forEach((button) => {
    button.classList.toggle('active', button.dataset.collection === collection);
  });
}

function profileValue(value, fallback = 'Not yet researched') {
  return escapeHtml(value ?? fallback);
}

function ruleMarkup(rule) {
  return `<div class="rule ${escapeHtml(rule.result)}">
    <strong>${escapeHtml(rule.rule)} — ${escapeHtml(rule.result)}</strong>
    <p>${escapeHtml(rule.rationale)}</p>
  </div>`;
}

function unitMarkup(unit) {
  return `<article class="product-unit">
    <div class="company-side" style="justify-content:flex-start">
      ${unit.verdict ? `<span class="badge ${stateClass(unit.verdict === 'Listed' ? 'Main' : unit.verdict)}">${escapeHtml(unit.verdict)}</span>` : '<span class="badge No-verdict">No signed verdict</span>'}
      ${unit.collection ? `<span class="badge collection-badge">${escapeHtml(unit.collection)}</span>` : ''}
      ${(unit.attributes || []).map((attribute) => `<span class="badge collection-badge">${escapeHtml(attribute.attribute)}</span>`).join('')}
    </div>
    <h3>${escapeHtml(unit.product_name)}</h3>
    <p>${escapeHtml(unit.plain_summary || '')}</p>
    <p><strong>Intended use:</strong> ${escapeHtml(unit.intended_use)}</p>
    <p><strong>Claimed outcome:</strong> ${escapeHtml(unit.claimed_outcome)}</p>
    <p><strong>Who buys or uses it:</strong> ${escapeHtml(unit.customer_summary || 'Not yet researched')}</p>
    ${unit.readiness_result ? `<p><strong>Readiness:</strong> ${escapeHtml(unit.readiness_result)}${unit.next_milestone ? ` — ${escapeHtml(unit.next_milestone)}` : ''}</p>` : ''}
    <div class="rules">${(unit.rules || []).map(ruleMarkup).join('') || '<div class="rule Unresolved">R1–R5 assessment not yet complete.</div>'}</div>
  </article>`;
}

function shadowMarkup(reference) {
  if (!reference) return '';
  const rules = ['r1', 'r2', 'r3', 'r4', 'r5'];
  return `<section class="shadow-panel">
    <p class="eyebrow">Unsigned research reference</p>
    <h3>${escapeHtml(reference.provisional_state || 'No verdict')}</h3>
    <p>This is the imported shadow assessment, not a signed product-level verdict.</p>
    <p><strong>Admission route:</strong> ${escapeHtml(reference.admission_route || 'Unresolved')} · <strong>Causal position:</strong> ${escapeHtml(reference.causal_position || 'Unresolved')}</p>
    <div class="shadow-rules">${rules.map((rule) => `<div class="shadow-rule ${stateClass(reference[rule])}">${rule.toUpperCase()} · ${escapeHtml(reference[rule] || 'Unresolved')}</div>`).join('')}</div>
    ${reference.next_action ? `<p><strong>Next action:</strong> ${escapeHtml(reference.next_action)}</p>` : ''}
  </section>`;
}

function candidateMarkup(candidate) {
  return `<div class="candidate">
    <strong>${escapeHtml(candidate.candidate_name)}</strong>
    <span>${escapeHtml(candidate.candidate_summary || 'Product-unit definition pending.')}</span>
    <p class="profile-completeness">${escapeHtml(candidate.status)} · ${candidate.needs_split ? 'product split required' : 'single unit proposed'}</p>
  </div>`;
}

function sourceMarkup(source) {
  const label = escapeHtml(source.title || source.publisher || source.url || 'Evidence source');
  const isPublicUrl = /^https?:\/\//i.test(source.url || '');
  const linked = isPublicUrl
    ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : `<span>${label}</span>`;
  return `<li>${linked}${source.material_conflict ? '<span class="source-label">contradictory</span>' : ''}${source.company_controlled ? '<span class="source-label">company-controlled</span>' : ''}</li>`;
}

async function showCompany(companyId) {
  detail.innerHTML = '<div class="company-detail"><p>Loading company profile…</p></div>';
  dialog.showModal();
  try {
    const response = await fetch(`/api/v2/companies/${companyId}`);
    if (!response.ok) throw new Error(`Company request failed (${response.status})`);
    const payload = await response.json();
    const company = payload.company;
    const reference = payload.shadowReferences?.[0];
    const aliases = (payload.aliases || []).map((item) => item.alias).filter(Boolean).join(', ');
    const collection = company.collection || company.provisional_collection || 'Routing pending';
    const collectionSuffix = company.collectionIsProvisional ? ' — provisional' : '';
    const authority = authorityLabel(company.stateAuthority);
    const candidates = payload.unitCandidates || [];
    const sources = payload.sources || [];
    detail.innerHTML = `<div class="company-detail">
      <p class="eyebrow">${escapeHtml(company.state)} · ${escapeHtml(authority)} · ${escapeHtml(company.country || 'Country pending')}</p>
      <h2>${escapeHtml(company.name)}</h2>
      <p class="hero-copy">${escapeHtml(company.plain_summary || 'Plain-language profile is being researched.')}</p>
      <div class="company-side" style="justify-content:flex-start;margin-top:1rem">
        <span class="badge ${stateClass(company.state)}">${escapeHtml(company.state)}</span>
        <span class="badge ${company.stateIsSigned ? 'authority-signed' : 'authority-unsigned'}">${escapeHtml(authority)}</span>
        <span class="badge collection-badge ${company.collectionIsProvisional ? 'routing-provisional' : ''}">${escapeHtml(collection + collectionSuffix)}</span>
      </div>
      <dl class="profile-grid">
        <div><dt>Founded</dt><dd>${profileValue(company.founding_year)}</dd></div>
        <div><dt>Approximate size</dt><dd>${profileValue(company.employee_band)}</dd></div>
        <div><dt>Profile completeness</dt><dd>${profileValue(`${Number(company.completeness_percent || 0).toFixed(0)}%`)}</dd></div>
        <div><dt>Operating status</dt><dd>${profileValue(company.operating_status)}</dd></div>
        <div><dt>Ownership</dt><dd>${profileValue(company.ownership_status)}</dd></div>
        <div><dt>Current owner</dt><dd>${profileValue(company.current_owner)}</dd></div>
        <div><dt>Customers</dt><dd>${profileValue(company.customer_summary)}</dd></div>
        <div><dt>Investors</dt><dd>${escapeHtml(shortList(company.investors, 8))}</dd></div>
        <div><dt>Former names</dt><dd>${profileValue(aliases)}</dd></div>
      </dl>
      ${!company.stateIsSigned ? shadowMarkup(reference) : ''}
      <h3>Product-level judgements</h3>
      ${payload.units.length ? payload.units.map(unitMarkup).join('') : '<p>No product-use unit has been signed. The company remains in the V2 research queue.</p>'}
      ${!payload.units.length && candidates.length ? `<h3>Unit-discovery leads</h3><div class="candidate-list">${candidates.map(candidateMarkup).join('')}</div>` : ''}
      <h3>Public evidence</h3>
      <p>${Number(company.source_count || sources.length).toLocaleString()} normalized source records are attached to this company.</p>
      ${sources.length ? `<ul class="source-list">${sources.slice(0, 30).map(sourceMarkup).join('')}</ul>${sources.length > 30 ? `<p>Showing 30 of ${sources.length} sources.</p>` : ''}` : '<p>No V2 source has been published yet.</p>'}
      ${payload.openResearch.length ? `<h3>Open research</h3><ul>${payload.openResearch.map((task) => `<li>${escapeHtml(task.question)}</li>`).join('')}</ul>` : ''}
    </div>`;
  } catch (error) {
    detail.innerHTML = `<div class="company-detail"><p>${escapeHtml(error.message)}</p></div>`;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  state.page = 1;
  loadCompanies();
});

document.querySelector('#reset').addEventListener('click', () => {
  form.reset();
  state.page = 1;
  state.collection = '';
  document.querySelectorAll('.collection').forEach((button) => {
    button.classList.toggle('active', button.dataset.collection === '');
  });
  loadCompanies();
});

document.querySelectorAll('.collection').forEach((button) => {
  button.addEventListener('click', () => {
    state.collection = button.dataset.collection || '';
    state.page = 1;
    document.querySelectorAll('.collection').forEach((other) => other.classList.toggle('active', other === button));
    loadCompanies();
  });
});

previous.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    loadCompanies();
    window.scrollTo({ top: document.querySelector('.results').offsetTop - 90, behavior: 'smooth' });
  }
});

next.addEventListener('click', () => {
  if (state.page < state.pages) {
    state.page += 1;
    loadCompanies();
    window.scrollTo({ top: document.querySelector('.results').offsetTop - 90, behavior: 'smooth' });
  }
});

list.addEventListener('click', (event) => {
  const card = event.target.closest('[data-company-id]');
  if (card) showCompany(card.dataset.companyId);
});

dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

await Promise.all([loadProgress(), loadFacets()]);
await loadCompanies();
