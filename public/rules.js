const EXPECTED_SHA256 = '4dc28ef38503f62fe6a9a6690ab7a2e95222d64e3bd2181e4a16552a714dd726';

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function loadRules() {
  const status = document.querySelector('#rules-status');
  const hashLabel = document.querySelector('#rules-hash');
  const output = document.querySelector('#rules-text');

  try {
    const response = await fetch('/engine-methodology.txt', {
      cache: 'no-store',
      headers: { Accept: 'text/plain' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const normalized = text.endsWith('\n') ? text.slice(0, -1) : text;
    const hash = await sha256(normalized);
    if (hash !== EXPECTED_SHA256) throw new Error('Reference text checksum mismatch');

    output.textContent = normalized;
    status.textContent = 'Canonical public rules';
    hashLabel.textContent = `SHA-256 ${hash.slice(0, 12)}…`;
  } catch (error) {
    status.textContent = 'Reference text unavailable';
    output.textContent = 'The canonical methodology could not be loaded safely.';
    console.error('Rules page failed:', error);
  }
}

loadRules();
