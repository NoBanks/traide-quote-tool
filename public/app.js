// TRAIDE Quote Tool, frontend logic.
// Pure vanilla JS, no framework, no build step. Single-page.

const $ = (sel) => document.querySelector(sel);

const form = $('#quote-form');
const submitBtn = $('#submit-btn');
const results = $('#results');
const status = $('#status');
const cards = $('#quote-cards');
const tipBox = $('#tip-addresses');

// Render tip addresses on first load.
loadTips();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const params = new URLSearchParams({
    chain: fd.get('chain'),
    sell: String(fd.get('sell') || '').trim(),
    buy: String(fd.get('buy') || '').trim(),
    amount: String(fd.get('amount') || '').trim(),
  });
  if (!params.get('sell') || !params.get('buy') || !params.get('amount')) {
    showStatus('Enter sell token, buy token, and amount.', true);
    return;
  }

  results.classList.remove('hidden');
  cards.innerHTML = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Fetching quotes...';
  showStatus(`Fetching ${params.get('sell')} -> ${params.get('buy')} on ${params.get('chain')}...`, false);

  const t0 = performance.now();
  try {
    const r = await fetch(`/api/quote?${params.toString()}`);
    const data = await r.json();
    const dt = Math.round(performance.now() - t0);
    if (!r.ok) {
      showStatus(data.error || `Request failed: ${r.status}`, true);
      return;
    }
    renderQuotes(data, dt);
  } catch (err) {
    showStatus(`Network error: ${err.message}`, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Get Quotes';
  }
});

function showStatus(msg, isError) {
  status.textContent = msg;
  status.classList.toggle('error', !!isError);
}

function renderQuotes(data, dtMs) {
  const quotes = data.quotes || [];
  const best = data.best;
  cards.innerHTML = '';

  if (quotes.length === 0) {
    showStatus('No quotes returned for this pair on this chain.', true);
    return;
  }

  // Sort: live quotes first by buyAmount desc, pending at end.
  const live = quotes.filter(q => q.buyAmount && q.status !== 'pending_mainnet');
  const pending = quotes.filter(q => !q.buyAmount || q.status === 'pending_mainnet');
  live.sort((a, b) => Number(b.buyAmount) - Number(a.buyAmount));

  showStatus(`Fetched ${quotes.length} quote sources in ${dtMs}ms.`, false);

  for (const q of [...live, ...pending]) {
    const isBest = q.source === best;
    const isPending = q.status === 'pending_mainnet' || !q.buyAmount;
    const card = document.createElement('div');
    card.className = `quote-card ${isBest ? 'best' : ''} ${isPending ? 'pending' : ''}`;

    const left = document.createElement('div');
    left.className = 'quote-source';
    left.innerHTML = `${escapeHtml(q.source)}${isBest ? '<span class="best-badge">best</span>' : ''}`;

    const middle = document.createElement('div');
    if (isPending) {
      middle.innerHTML = `<div class="quote-amount">${escapeHtml(q.note || 'Quote not available yet')}</div>`;
    } else {
      const buy = formatAmount(q.buyAmount);
      const usd = q.buyAmountUsd ? ` ($${q.buyAmountUsd.toFixed(2)})` : '';
      const meta = [];
      if (q.gasEstimate) meta.push(`gas ${formatGas(q.gasEstimate)}${q.gasUsd ? ` ($${q.gasUsd.toFixed(2)})` : ''}`);
      if (q.route && q.route.length) meta.push(`route ${q.route.join(' -> ')}`);
      if (q.latencyMs) meta.push(`${q.latencyMs}ms`);
      middle.innerHTML = `
        <div class="quote-amount">${buy} ${escapeHtml(data.buy)}${usd}</div>
        <div class="quote-meta">${meta.map(m => `<span>${escapeHtml(m)}</span>`).join('')}</div>
      `;
    }

    const right = document.createElement('div');
    if (q.executeUrl) {
      const link = document.createElement('a');
      link.href = q.executeUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'quote-action';
      link.textContent = 'Execute';
      right.appendChild(link);
    } else if (isPending) {
      const span = document.createElement('span');
      span.className = 'quote-action';
      span.textContent = 'Soon';
      right.appendChild(span);
    }

    card.append(left, middle, right);
    cards.appendChild(card);
  }
}

function formatAmount(s) {
  const n = Number(s);
  if (!isFinite(n)) return s;
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toPrecision(4);
}

function formatGas(s) {
  const n = Number(s);
  if (!isFinite(n)) return s;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

async function loadTips() {
  try {
    const r = await fetch('/api/tip-info');
    const data = await r.json();
    renderTips(data);
  } catch (err) {
    tipBox.innerHTML = `<div class="tip-loading">Tip addresses unavailable: ${escapeHtml(err.message)}</div>`;
  }
}

function renderTips(data) {
  tipBox.innerHTML = '';
  const rows = [
    { chain: 'EVM', addr: data.evm, pending: false },
    { chain: 'Solana', addr: data.solana, pending: data.solana === 'pending' },
  ];
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tip-address-row';
    if (r.pending) {
      row.innerHTML = `
        <span class="tip-chain">${r.chain}</span>
        <span class="tip-pending">address coming soon</span>
        <span></span>
      `;
    } else {
      row.innerHTML = `
        <span class="tip-chain">${r.chain}</span>
        <span class="tip-addr" title="${escapeHtml(r.addr)}">${escapeHtml(r.addr)}</span>
        <button class="copy-btn" data-addr="${escapeHtml(r.addr)}">copy</button>
      `;
    }
    tipBox.appendChild(row);
  }
  // Add a small line for the x402 tip route.
  if (data.x402_tip_url) {
    const note = document.createElement('div');
    note.className = 'tip-loading';
    note.style.marginTop = '0.5rem';
    note.textContent = `Agents: tip via x402 at ${data.x402_tip_url}`;
    tipBox.appendChild(note);
  }
  // Wire copy buttons.
  tipBox.querySelectorAll('button.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const addr = btn.dataset.addr;
      try {
        await navigator.clipboard.writeText(addr);
        const orig = btn.textContent;
        btn.textContent = 'copied';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch (e) {
        btn.textContent = 'copy failed';
      }
    });
  });
}
