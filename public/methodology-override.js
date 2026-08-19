const main = document.querySelector('#app-main');

function applyMethodologyCopy() {
  if (!main) return;

  const heroCopy = main.querySelector('.hero .hero-copy');
  if (heroCopy && heroCopy.textContent.includes('eight structural criteria')) {
    heroCopy.textContent = 'Every company is judged under the published engine methodology. Main requires independent outcome measurement. Pending means the written rules hold but the required independent measurement is not yet available. Every exclusion names the rule that fired and whether it is “not yet” or “not like this”.';
  }

  const screeningStats = main.querySelector('.screening-stats');
  const screeningNote = main.querySelector('.screening-note');
  if (screeningStats) screeningStats.hidden = true;
  if (screeningNote) screeningNote.hidden = true;

  const method = main.querySelector('#method');
  if (method && method.dataset.methodologyVersion !== '2026-08-19') {
    method.dataset.methodologyVersion = '2026-08-19';
    method.innerHTML = `
      <div><p class="eyebrow">How selection works</p><h2 id="method-title">The rules are written.</h2></div>
      <div class="method-copy">
        <p>The public rules page is the reference text. It is the only selectivity doctrine used by the engine.</p>
        <p><a class="website-link" href="/rules">Read the engine methodology ↗</a></p>
        <p class="source-note">Company data is read live from the canonical Neon database.</p>
      </div>
    `;
  }

  for (const copy of main.querySelectorAll('.detail-hero .hero-copy')) {
    if (copy.textContent.includes('structural criteria')) {
      copy.textContent = 'Public companies from this geography that are currently published in the useful.vc directory.';
    }
  }
}

const observer = new MutationObserver(applyMethodologyCopy);
if (main) observer.observe(main, { childList: true, subtree: true });
applyMethodologyCopy();
