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

function linkifyCodexTerms(escapedHtml, codexEntries = [], canUnlink = false) {
  if (!Array.isArray(codexEntries) || !codexEntries.length) return escapedHtml;

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

  const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${patterns.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'giu');

  return escapedHtml
    .split(/(<[^>]+>)/g)
    .map(part => {
      if (part.startsWith('<')) return part;
      return part.replace(regex, (match, prefix, foundWord) => {
        const entry = mapByLower.get(foundWord.toLowerCase());
        if (!entry) return match;
        const safeId = escapeHtml(entry.id);
        const safeTitle = escapeHtml(entry.title);
        const btnHtml = `<button type="button" class="codex-inline-term" onclick="openCodexTermFromReader('${safeId}')" title="📖 Відкрити в Кодексі: ${safeTitle}">${foundWord}</button>`;
        if (!canUnlink) return `${prefix}${btnHtml}`;
        return `${prefix}<span class="codex-term-wrap">${btnHtml}<button type="button" class="codex-unlink-mini" onclick="event.stopPropagation(); quickUnlinkCodexTerm('${safeId}')" title="Відкріпити «${safeTitle}» від цього твору">✕</button></span>`;
      });
    })
    .join('');
}

function formatInlineMarkdown(text, codexEntries = [], canUnlink = false) {
  const html = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  return linkifyCodexTerms(html, codexEntries, canUnlink);
}

function formatLiteraryText(raw, codexEntries = [], canUnlink = false) {
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
      return `<blockquote>${formatInlineMarkdown(quoteText, codexEntries, canUnlink)}</blockquote>`;
    }
    const lines = block.split('\n').map(line => formatInlineMarkdown(line.trim(), codexEntries, canUnlink)).join('<br>');
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

// ============================================================================
// УНІВЕРСАЛЬНА СИСТЕМА КОМЕНТАРІВ (Статті, Книги, Картки Кодексу)
// ============================================================================
const PortalComments = {
  getComments(targetType, targetId) {
    if (targetType === 'article') {
      const art = (state?.articles || []).find(a => a.id === targetId);
      return Array.isArray(art?.comments) ? art.comments : [];
    }
    if (targetType === 'book') {
      const book = (state?.books || []).find(b => b.id === targetId);
      return Array.isArray(book?.comments) ? book.comments : [];
    }
    if (targetType === 'codex') {
      const entry = (state?.codexEntries || []).find(e => e.id === targetId);
      return Array.isArray(entry?.attributes?.tree_comments) ? entry.attributes.tree_comments : [];
    }
    return [];
  },

  renderCommentTree(comments, targetType, targetId, parentId = null, depth = 0) {
    const list = comments.filter(c => (c.parent_id || null) === parentId);
    if (!list.length) return '';

    return list.map(c => {
      const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString('uk-UA') : '';
      const likes = Number(c.likes) || 0;
      return `
        <div class="comment-item" style="margin-left:${Math.min(48, depth * 18)}px; margin-top:0.65rem; padding:0.75rem 0.9rem; border-radius:12px; background:var(--bg-subtle); border:1px solid var(--border);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; font-size:0.84rem;">
            <div>
              <strong style="color:var(--accent);">${escapeHtml(c.author || 'Бард')}</strong>
              ${dateStr ? `<small class="subtitle" style="margin-left:0.4rem;">${dateStr}</small>` : ''}
            </div>
          </div>
          <div style="margin:0.45rem 0; white-space:pre-line; font-size:0.94rem;">${escapeHtml(c.text)}</div>
          <div style="display:flex; gap:0.75rem; align-items:center; font-size:0.82rem;">
            <button type="button" class="author-link" onclick="PortalComments.toggleLike('${targetType}', '${targetId}', '${c.id}')">🤍 ${likes}</button>
            <button type="button" class="author-link" onclick="PortalComments.showReplyForm('${c.id}')">↩ Відповісти</button>
          </div>
          <div id="replyFormBox_${c.id}" class="hidden" style="display:flex; gap:0.45rem; margin-top:0.55rem; align-items:center;">
            <input type="text" id="replyInput_${c.id}" class="input" placeholder="Ваша відповідь..." style="flex:1; padding:0.45rem 0.7rem;" />
            <button type="button" class="btn btn-primary" style="padding:0.45rem 0.85rem;" onclick="PortalComments.submitComment('${targetType}', '${targetId}', '${c.id}')">Надіслати</button>
            <button type="button" class="btn" style="padding:0.45rem 0.65rem;" onclick="PortalComments.hideReplyForm('${c.id}')">✕</button>
          </div>
          ${this.renderCommentTree(comments, targetType, targetId, c.id, depth + 1)}
        </div>
      `;
    }).join('');
  },

  showReplyForm(commentId) {
    const el = document.getElementById(`replyFormBox_${commentId}`);
    if (el) {
      el.classList.remove('hidden');
      document.getElementById(`replyInput_${commentId}`)?.focus();
    }
  },

  hideReplyForm(commentId) {
    document.getElementById(`replyFormBox_${commentId}`)?.classList.add('hidden');
  },

  openCommentsModal(targetType, targetId) {
    const titleMap = {
      article: (state?.articles || []).find(a => a.id === targetId)?.title || 'Стаття',
      book: (state?.books || []).find(b => b.id === targetId)?.title || 'Книга',
      codex: (state?.codexEntries || []).find(e => e.id === targetId)?.title || 'Запис Кодексу'
    };
    const comments = this.getComments(targetType, targetId);

    openModal(`
      <span class="badge">💬 Обговорення</span>
      <h2 style="margin-top:0.45rem;">${escapeHtml(titleMap[targetType])}</h2>
      <hr style="margin:0.85rem 0; border-color:var(--border);" />

      <h3 style="margin-bottom:0.5rem;">Коментарі (${comments.length})</h3>
      <div id="portalCommentsTreeContainer" style="max-height:340px; overflow-y:auto; padding-right:0.25rem; margin-bottom:1rem;">
        ${comments.length
          ? this.renderCommentTree(comments, targetType, targetId, null, 0)
          : '<p class="subtitle">Поки немає коментарів. Будьте першим!</p>'}
      </div>

      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        <textarea id="newRootCommentInput" class="input textarea" rows="2" placeholder="Написати коментар..."></textarea>
        <button type="button" class="btn btn-primary" style="align-self:flex-start;" onclick="PortalComments.submitComment('${targetType}', '${targetId}', null)">Надіслати</button>
      </div>
    `);
  },

  async submitComment(targetType, targetId, parentId = null) {
    const user = getCurrentUser();
    if (!user) return openAuthModal();

    const inputEl = parentId
      ? document.getElementById(`replyInput_${parentId}`)
      : document.getElementById('newRootCommentInput');
    const text = (inputEl?.value || '').trim();
    if (!text) return;

    try {
      if (targetType === 'article') {
        await TaliesinAPI.addComment(targetId, text, parentId);
      } else if (targetType === 'codex') {
        const entry = (state.codexEntries || []).find(e => e.id === targetId);
        if (!entry) return;
        const attrs = { ...(entry.attributes || {}) };
        const nextList = [...(Array.isArray(attrs.tree_comments) ? attrs.tree_comments : []), {
          id: 'cmt_' + Date.now(),
          parent_id: parentId || null,
          author: user.name || user.email || 'Бард',
          text,
          likes: 0,
          created_at: new Date().toISOString()
        }];
        attrs.tree_comments = nextList;
        await TaliesinAPI.updateCodexEntry(entry.id, {
          title: entry.title,
          category: entry.category,
          disciplineId: entry.discipline_id,
          parentEntryId: entry.parent_entry_id,
          attributes: attrs,
          universe: entry.universe,
          description: entry.description,
          isShared: entry.is_shared,
          visualStyle: entry.visual_style,
          isSystemPrimitive: entry.is_system_primitive
        });
      } else if (targetType === 'book') {
        // Зберігаємо коментарі книги у localStorage або через API, якщо є колонка comments
        const key = `taliesin_book_comments_${targetId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({
          id: 'cmt_' + Date.now(),
          parent_id: parentId || null,
          author: user.name || user.email || 'Бард',
          text,
          likes: 0,
          created_at: new Date().toISOString()
        });
        localStorage.setItem(key, JSON.stringify(existing));
        const book = (state.books || []).find(b => b.id === targetId);
        if (book) book.comments = existing;
      }

      await refresh();
      this.openCommentsModal(targetType, targetId);
    } catch (err) {
      alert(err.message);
    }
  },

  async toggleLike(targetType, targetId, commentId) {
    if (targetType === 'codex') {
      const entry = (state.codexEntries || []).find(e => e.id === targetId);
      if (!entry) return;
      const attrs = { ...(entry.attributes || {}) };
      attrs.tree_comments = (attrs.tree_comments || []).map(c =>
        c.id === commentId ? { ...c, likes: (Number(c.likes) || 0) + 1 } : c
      );
      await TaliesinAPI.updateCodexEntry(entry.id, {
        title: entry.title,
        category: entry.category,
        disciplineId: entry.discipline_id,
        parentEntryId: entry.parent_entry_id,
        attributes: attrs,
        universe: entry.universe,
        description: entry.description,
        isShared: entry.is_shared,
        visualStyle: entry.visual_style,
        isSystemPrimitive: entry.is_system_primitive
      });
      await refresh();
      this.openCommentsModal('codex', targetId);
    }
  }
};
