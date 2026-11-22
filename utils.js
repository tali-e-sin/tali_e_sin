// --- Спільні утиліти порталу tali_e_sin ---
let readerFontSize = Number(localStorage.getItem('taliesin_font_size')) || 17;

window.changeReaderFont = (delta) => {
  readerFontSize = Math.min(24, Math.max(14, readerFontSize + delta));
  localStorage.setItem('taliesin_font_size', readerFontSize);
  const textEl = document.querySelector('#modalBody .reading-text');
  const labelEl = document.getElementById('fontSizeLabel');
  if (textEl) textEl.style.fontSize = `${readerFontSize}px`;
  if (labelEl) labelEl.textContent = `${readerFontSize}px`;
};

function estimateReadingMinutes(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

function bindReaderProgress(storageKey = null) {
  const card = document.querySelector('.modal-card');
  const bar = document.getElementById('readingProgressBar');
  if (!card || !bar) return;

  if (storageKey) {
    const savedRatio = Number(localStorage.getItem(storageKey));
    if (savedRatio > 0 && savedRatio < 0.98) {
      requestAnimationFrame(() => {
        const scrollable = card.scrollHeight - card.clientHeight;
        if (scrollable > 0) {
          card.scrollTop = Math.round(scrollable * savedRatio);
        }
      });
    }
  }

  const updateBar = () => {
    const scrollable = card.scrollHeight - card.clientHeight;
    const ratio = scrollable > 0 ? Math.min(1, Math.max(0, card.scrollTop / scrollable)) : 1;
    bar.style.width = `${Math.round(ratio * 100)}%`;

    if (storageKey && scrollable > 0) {
      localStorage.setItem(storageKey, ratio.toFixed(4));
    }
  };

  card.onscroll = updateBar;
  setTimeout(updateBar, 60);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deduplicateList(items, keySelector = (item) => String(item ?? '').trim().toLowerCase()) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    const key = keySelector(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseUniverseTags(universe) {
  const rawTags = String(universe || '')
    .split(/[,#]+/)
    .map(t => t.trim())
    .filter(Boolean);
  return deduplicateList(rawTags);
}

function renderUniverseTags(universe, interactive = false) {
  const tags = parseUniverseTags(universe);
  if (!tags.length) return '';
  return tags.map(tag => interactive
    ? `<button type="button" class="universe-tag" onclick="filterCodexByUniverse('${escapeHtml(tag)}')" title="Фільтрувати за світом #${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`
    : `<span class="universe-tag" style="cursor:default;">#${escapeHtml(tag)}</span>`
  ).join('');
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function linkifyCodexTerms(escapedHtml, codexEntries = []) {
  if (!Array.isArray(codexEntries) || !codexEntries.length) return escapedHtml;

  // Сортуємо від найдовших назв до найкоротших, щоб фрази з 2-3 слів мали пріоритет
  const sorted = [...codexEntries]
    .filter(e => e && e.id && String(e.title || '').trim().length >= 3)
    .sort((a, b) => b.title.trim().length - a.title.trim().length);

  if (!sorted.length) return escapedHtml;

  const mapByLower = new Map();
  const patterns = [];

  sorted.forEach(entry => {
    const cleanTitle = entry.title.trim();
    const key = cleanTitle.toLowerCase();
    if (!mapByLower.has(key)) {
      mapByLower.set(key, entry);
      patterns.push(escapeRegex(escapeHtml(cleanTitle)));
    }
  });

  if (!patterns.length) return escapedHtml;

  // Розбиваємо рядок на HTML-теги та звичайний текст, щоб не замінювати всередині тегів
  const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${patterns.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'giu');

  return escapedHtml
    .split(/(<[^>]+>)/g)
    .map(part => {
      if (part.startsWith('<')) return part;
      return part.replace(regex, (match, prefix, foundWord) => {
        const entry = mapByLower.get(foundWord.toLowerCase());
        if (!entry) return match;
        return `${prefix}<button type="button" class="codex-inline-term" onclick="openCodexTermFromReader('${escapeHtml(entry.id)}')" title="📖 Відкрити в Кодексі: ${escapeHtml(entry.title)}">${foundWord}</button>`;
      });
    })
    .join('');
}

function formatInlineMarkdown(text, codexEntries = []) {
  const html = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  return linkifyCodexTerms(html, codexEntries);
}

function formatLiteraryText(raw, codexEntries = []) {
  if (!raw) return '';
  const blocks = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean);

  return blocks.map(block => {
    if (/^(\*{3,}|-{3,}|—{3,})$/.test(block)) {
      return `<div class="scene-divider">❖ ❖ ❖</div>`;
    }
    if (block.startsWith('>')) {
      const quoteText = block.replace(/^>\s?/gm, '').replace(/\n/g, '<br>');
      return `<blockquote>${formatInlineMarkdown(quoteText, codexEntries)}</blockquote>`;
    }
    const lines = block.split('\n').map(line => formatInlineMarkdown(line.trim(), codexEntries)).join('<br>');
    return `<p>${lines}</p>`;
  }).join('');
}

function attachManuscriptImporter(fileInputId, titleInputId, contentTextareaId) {
  const fileInput = document.getElementById(fileInputId);
  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let text = String(event.target?.result || '').replace(/\r\n/g, '\n').trim();
      const titleInput = document.getElementById(titleInputId);
      const contentArea = document.getElementById(contentTextareaId);

      const headingMatch = text.match(/^#\s+(.+)\n+/);
      let extractedTitle = '';

      if (headingMatch) {
        extractedTitle = headingMatch[1].trim();
        text = text.slice(headingMatch[0].length).trim();
      } else {
        extractedTitle = file.name.replace(/\.(txt|md)$/i, '').replace(/[_-]+/g, ' ').trim();
      }

      if (titleInput && !titleInput.value.trim() && extractedTitle) {
        titleInput.value = extractedTitle;
      }
      if (contentArea) {
        contentArea.value = text;
      }
      fileInput.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  });
}

// --- Модальне вікно ---
const modalBackdrop = document.getElementById('modalBackdrop');
const modalBody = document.getElementById('modalBody');

function openModal(html) {
  modalBody.innerHTML = html;
  modalBackdrop.classList.remove('hidden');
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
  modalBody.innerHTML = '';
  if (typeof state !== 'undefined' && state) {
    if (typeof renderArticles === 'function') renderArticles();
    if (typeof renderBooks === 'function') renderBooks();
  }
}

document.getElementById('closeModal')?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });
