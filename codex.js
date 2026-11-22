// --- Модуль Кодексу, Діаграм та Майстерні Кодексу ---

const FALLBACK_DISCIPLINES = [
  { id: 'history', title: 'Історія та Генеалогія', parent_id: 'humanities', schema_fields: [] },
  { id: 'biology', title: 'Біологія та Види', parent_id: 'natural', schema_fields: [] },
  { id: 'geography', title: 'Географія та Астрономія', parent_id: 'natural', schema_fields: [] },
  { id: 'sociology', title: 'Соціологія, Держави та Гільдії', parent_id: 'humanities', schema_fields: [] },
  { id: 'technology', title: 'Технологія та Артефакти', parent_id: 'applied', schema_fields: [] },
  { id: 'mythology', title: 'Міфологія, Релігія та Філософія', parent_id: 'humanities', schema_fields: [] },
  { id: 'physics', title: 'Фізика та Космологія', parent_id: 'natural', schema_fields: [] },
  { id: 'mathematics', title: 'Математика', parent_id: 'formal', schema_fields: [] },
  { id: 'arcana', title: 'Магія та Астральні явища', parent_id: 'applied', schema_fields: [] }
];

function getAvailableDisciplines() {
  const fromState = state?.codexDisciplines;
  return (Array.isArray(fromState) && fromState.length) ? fromState : FALLBACK_DISCIPLINES;
}

function getDisciplineById(id) {
  return getAvailableDisciplines().find(d => d.id === id) || null;
}

function getDisciplineTitle(entry) {
  const disc = getDisciplineById(entry?.discipline_id);
  return disc ? disc.title : (entry?.category || 'Загальне');
}

function renderCanonBadge(status) {
  if (status === 'official') {
    return `<span class="badge canon-badge-official" title="Узгоджено Хранителями порталу">🏛️ Канон</span>`;
  }
  if (status === 'pending') {
    return `<span class="badge canon-badge-pending" title="Очікує перевірки адміном">⏳ На узгодженні</span>`;
  }
  return '';
}

function renderEntryAttributes(entry) {
  const attrs = (entry?.attributes && typeof entry.attributes === 'object') ? entry.attributes : {};
  const disc = getDisciplineById(entry?.discipline_id);
  const schemaFields = Array.isArray(disc?.schema_fields) ? disc.schema_fields : [];

  const rows = [];
  const usedKeys = new Set();

  schemaFields.forEach(f => {
    const val = attrs[f.key];
    if (val !== undefined && String(val).trim() !== '') {
      rows.push({ label: f.label, value: String(val) });
      usedKeys.add(f.key);
    }
  });

  Object.entries(attrs).forEach(([k, v]) => {
    if (!usedKeys.has(k) && v !== undefined && String(v).trim() !== '') {
      rows.push({ label: k, value: String(v) });
    }
  });

  if (!rows.length) return '';
  return `
    <div class="codex-attrs-grid">
      ${rows.map(r => `
        <div class="codex-attr-item">
          <strong>${escapeHtml(r.label)}</strong>
          <span>${escapeHtml(r.value)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

window.filterCodexByUniverse = (universe) => {
  const searchInput = document.getElementById('globalCodexSearch');
  if (!searchInput) return;
  const clean = String(universe || '').trim().replace(/^#+/, '');
  searchInput.value = searchInput.value.trim().toLowerCase() === clean.toLowerCase() ? '' : clean;
  renderGlobalCodex();
};

window.focusCodexEntry = (entryId) => {
  const entry = (state?.codexEntries || []).find(e => e.id === entryId);
  if (!entry) return;
  switchCodexMode('cards');
  const searchInput = document.getElementById('globalCodexSearch');
  if (searchInput) searchInput.value = entry.title;
  renderGlobalCodex();
};

function switchCodexMode(mode) {
  const isDiagrams = mode === 'diagrams';
  document.getElementById('codexModeCardsBtn')?.classList.toggle('active', !isDiagrams);
  document.getElementById('codexModeDiagramsBtn')?.classList.toggle('active', isDiagrams);
  document.getElementById('codexCardsToolbar')?.classList.toggle('hidden', isDiagrams);
  document.getElementById('globalCodexList')?.classList.toggle('hidden', isDiagrams);
  document.getElementById('codexDiagramsView')?.classList.toggle('hidden', !isDiagrams);

  if (isDiagrams) {
    populateDiagramControls();
    renderCodexDiagram();
  } else {
    renderGlobalCodex();
  }
}

document.getElementById('codexModeCardsBtn')?.addEventListener('click', () => switchCodexMode('cards'));
document.getElementById('codexModeDiagramsBtn')?.addEventListener('click', () => switchCodexMode('diagrams'));
document.getElementById('openWorkshopCodexBtn')?.addEventListener('click', () => {
  navigateTo('write');
  switchWorkshopTab('codex');
});

function populateGlobalDisciplineFilter() {
  const select = document.getElementById('globalCodexDiscipline');
  if (!select) return;
  const currentVal = select.value || 'all';
  const disciplines = getAvailableDisciplines();
  select.innerHTML = `<option value="all">Усі науки та галузі</option>` +
    disciplines.map(d => {
      const prefix = d.parent_id ? '↳ ' : '🏛️ ';
      return `<option value="${escapeHtml(d.id)}">${prefix}${escapeHtml(d.title)}</option>`;
    }).join('');
  select.value = currentVal;
}

function renderGlobalCodex() {
  const container = document.getElementById('globalCodexList');
  if (!container || !state) return;

  const user = getCurrentUser();
  const q = (document.getElementById('globalCodexSearch')?.value || '').toLowerCase().replace(/^#+/, '').trim();
  const discFilter = document.getElementById('globalCodexDiscipline')?.value || 'all';
  const canonFilter = document.getElementById('globalCodexCanonFilter')?.value || 'all';

  const allowedDisciplineIds = new Set();
  if (discFilter !== 'all') {
    allowedDisciplineIds.add(discFilter);
    getAvailableDisciplines().forEach(d => {
      if (d.parent_id === discFilter) allowedDisciplineIds.add(d.id);
    });
  }

  const visibleEntries = (state.codexEntries || []).filter(e => {
    const canSee = e.is_shared || (user && (e.author_id === user.id || user.role === 'admin'));
    if (!canSee) return false;
    if (discFilter !== 'all' && !allowedDisciplineIds.has(e.discipline_id)) return false;
    if (canonFilter === 'official' && e.canon_status !== 'official') return false;
    if (canonFilter === 'community' && e.canon_status === 'official') return false;
    if (!q) return true;

    const entryBooks = (state.books || []).filter(b =>
      Array.isArray(b.codex_ids) && b.codex_ids.includes(e.id)
    );
    const matchesBook = entryBooks.some(b => (b.title || '').toLowerCase().includes(q));
    const matchesUniverse = parseUniverseTags(e.universe).some(t => t.toLowerCase().includes(q));

    return (
      (e.title || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.author_name || '').toLowerCase().includes(q) ||
      matchesUniverse ||
      matchesBook
    );
  });

  if (!visibleEntries.length) {
    container.innerHTML = '<p class="subtitle">Записів у Кодексі за цим запитом поки немає.</p>';
    return;
  }

  container.innerHTML = visibleEntries.map(entry => {
    const linkedBooks = (state.books || []).filter(b =>
      Array.isArray(b.codex_ids) && b.codex_ids.includes(entry.id)
    );
    const uniqueBookTitles = deduplicateList(linkedBooks.map(b => (b.title || '').trim()));
    const universeTagsHtml = renderUniverseTags(entry.universe, true);

    const parentEntry = entry.parent_entry_id
      ? (state.codexEntries || []).find(p => p.id === entry.parent_entry_id)
      : null;
    const childVariants = (state.codexEntries || []).filter(c => c.parent_entry_id === entry.id);

    const isOwner = user && entry.author_id === user.id;
    const isAdmin = user && user.role === 'admin';
    const canEdit = isAdmin || (isOwner && entry.canon_status !== 'official');
    const canTip = entry.author_id && (!user || user.id !== entry.author_id);

    return `
      <article class="card" style="${entry.canon_status === 'official' ? 'border-color: var(--accent);' : ''}">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.5rem;">
            <h3 style="margin:0;">${escapeHtml(entry.title)}</h3>
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center;">
              ${renderCanonBadge(entry.canon_status)}
              <span class="badge">${escapeHtml(getDisciplineTitle(entry))}</span>
              ${!entry.is_shared ? `<span class="badge">🔒 Приватний</span>` : ''}
            </div>
          </div>

          ${parentEntry ? `
            <div>
              <button type="button" class="lineage-pill" onclick="focusCodexEntry('${parentEntry.id}')">
                🧬 Базується на: <strong>${escapeHtml(parentEntry.title)}</strong>
              </button>
            </div>
          ` : ''}

          ${universeTagsHtml ? `
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap; margin-bottom:0.65rem;">
              ${universeTagsHtml}
            </div>
          ` : ''}

          ${renderEntryAttributes(entry)}

          <p style="white-space:pre-line; color:var(--text-main); margin:0.4rem 0 0;">${escapeHtml(entry.description)}</p>

          ${childVariants.length ? `
            <div style="margin-top:0.65rem; font-size:0.82rem; color:var(--text-muted);">
              🌿 Варіації у світах (${childVariants.length}):
              ${childVariants.map(v => `<button type="button" class="author-link" onclick="focusCodexEntry('${v.id}')">${escapeHtml(v.title)}</button>`).join(', ')}
            </div>
          ` : ''}
        </div>

        <div>
          ${uniqueBookTitles.length ? `
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center; margin-bottom:0.75rem;">
              ${uniqueBookTitles.map(title => `<button type="button" class="universe-tag book-tag" onclick="filterCodexByUniverse('${escapeHtml(title)}')">📚 #${escapeHtml(title)}</button>`).join('')}
            </div>
          ` : ''}
          <div class="meta-row" style="gap:0.4rem; flex-wrap:wrap;">
            <span>✍️ ${renderAuthorLink(entry.author_name || 'Хранитель', entry.author_id || '')}</span>
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
              <button type="button" class="btn" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="openEntryDiagram('${entry.id}')" title="Відкрити діаграми зв'язків">🌳</button>
              ${isOwner && entry.canon_status === 'community' ? `<button type="button" class="btn" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="proposeEntryCanon('${entry.id}')" title="Подати на узгодження як Канон">🏛️</button>` : ''}
              ${isAdmin && entry.canon_status !== 'official' ? `<button type="button" class="btn btn-primary" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="approveEntryCanon('${entry.id}')" title="Затвердити як Канон">✓ Канон</button>` : ''}
              ${canTip ? `<button type="button" class="btn" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="openTipModal('${escapeHtml(entry.author_id)}', '${escapeHtml(entry.author_name || 'Бард')}', 'Кодекс: ${escapeHtml(entry.title)}')">🎁</button>` : ''}
              ${canEdit ? `<button type="button" class="btn" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="openEditCodexModal('${entry.id}')" title="Редагувати запис">✏️</button>` : ''}
              ${canEdit ? `<button type="button" class="btn btn-danger" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="deleteGlobalCodexEntry('${entry.id}')" title="Видалити запис">✕</button>` : ''}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

document.getElementById('globalCodexSearch')?.addEventListener('input', renderGlobalCodex);
document.getElementById('globalCodexDiscipline')?.addEventListener('change', renderGlobalCodex);
document.getElementById('globalCodexCanonFilter')?.addEventListener('change', renderGlobalCodex);

window.proposeEntryCanon = async (entryId) => {
  try {
    await TaliesinAPI.setCodexCanonStatus(entryId, 'pending');
    await refresh();
    renderGlobalCodex();
    alert('Заявку на включення до офіційного Канону надіслано Хранителям!');
  } catch (err) {
    alert(err.message);
  }
};

window.approveEntryCanon = async (entryId) => {
  try {
    await TaliesinAPI.setCodexCanonStatus(entryId, 'official');
    await refresh();
    renderGlobalCodex();
    if (typeof renderSchemaArchitect === 'function') renderSchemaArchitect();
  } catch (err) {
    alert(err.message);
  }
};

window.deleteGlobalCodexEntry = async (entryId) => {
  if (!confirm('Видалити цей запис зі спільного Кодексу порталу?')) return;
  try {
    const affectedBooks = (state.books || []).filter(b =>
      Array.isArray(b.codex_ids) && b.codex_ids.includes(entryId)
    );
    for (const b of affectedBooks) {
      await TaliesinAPI.updateBookCodexLinks(b.id, b.codex_ids.filter(id => id !== entryId));
    }
    await TaliesinAPI.deleteCodexEntryById(entryId);
    await refresh();
  } catch (err) {
    alert(err.message);
  }
};

window.openEditCodexModal = (entryId, returnBookId = null) => {
  const entry = (state.codexEntries || []).find(e => e.id === entryId);
  const user = getCurrentUser();
  if (!entry || !user) return;

  const canEdit = user.role === 'admin' || (entry.author_id === user.id && entry.canon_status !== 'official');
  if (!canEdit) return alert('Канонічні записи можуть редагувати лише Хранителі порталу.');

  const disciplines = getAvailableDisciplines();
  const entries = (state.codexEntries || []).filter(e => e.id !== entry.id);

  openModal(`
    <span class="badge">✏️ Редагування запису Кодексу</span>
    <h2 style="margin-top:0.5rem;">${escapeHtml(entry.title)}</h2>

    <form id="editCodexForm" class="stack-form" style="margin-top:1rem;">
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <input type="text" id="editCodexTitle" class="input" style="flex:1; min-width:180px;" required />
        <select id="editCodexDiscipline" class="input">
          ${disciplines.map(d => `<option value="${escapeHtml(d.id)}">${d.parent_id ? '↳ ' : ''}${escapeHtml(d.title)}</option>`).join('')}
        </select>
      </div>
      <select id="editCodexParentEntry" class="input">
        <option value="">🧬 Взято за основу (без прототипу)</option>
        ${entries.map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('')}
      </select>
      <input type="text" id="editCodexUniverse" class="input" maxlength="120" placeholder="Світи через кому або #..." />
      <div id="editCodexDynamicFields" class="stack-form" style="padding:0.8rem; background:var(--bg-subtle); border-radius:12px;"></div>
      <textarea id="editCodexDesc" class="input textarea" rows="5" maxlength="2000" required></textarea>
      <label class="subtitle" style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
        <input type="checkbox" id="editCodexShared" />
        Зробити запис відкритим для всіх авторів порталу
      </label>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <button type="submit" class="btn btn-primary">Зберегти зміни</button>
        ${returnBookId
          ? `<button type="button" class="btn" onclick="openBookEditorModal('${returnBookId}')">Скасувати</button>`
          : `<button type="button" class="btn" onclick="closeModal()">Скасувати</button>`}
      </div>
    </form>
  `);

  document.getElementById('editCodexTitle').value = entry.title || '';
  document.getElementById('editCodexDiscipline').value = entry.discipline_id || 'mythology';
  document.getElementById('editCodexParentEntry').value = entry.parent_entry_id || '';
  document.getElementById('editCodexUniverse').value = entry.universe || '';
  document.getElementById('editCodexDesc').value = entry.description || '';
  document.getElementById('editCodexShared').checked = Boolean(entry.is_shared);

  const renderEditDynamic = () => {
    const box = document.getElementById('editCodexDynamicFields');
    const disc = getDisciplineById(document.getElementById('editCodexDiscipline').value);
    const fields = Array.isArray(disc?.schema_fields) ? disc.schema_fields : [];
    const curAttrs = entry.attributes || {};
    if (!fields.length) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = fields.map(f => {
      const val = escapeHtml(curAttrs[f.key] || '');
      return f.type === 'textarea'
        ? `<textarea class="input textarea edit-dyn-attr" data-attr-key="${escapeHtml(f.key)}" rows="2" placeholder="${escapeHtml(f.label)}">${val}</textarea>`
        : `<input type="text" class="input edit-dyn-attr" data-attr-key="${escapeHtml(f.key)}" placeholder="${escapeHtml(f.label)}" value="${val}" />`;
    }).join('');
  };

  renderEditDynamic();
  document.getElementById('editCodexDiscipline').onchange = renderEditDynamic;

  document.getElementById('editCodexForm').onsubmit = async (e) => {
    e.preventDefault();
    const cleanUniverse = parseUniverseTags(document.getElementById('editCodexUniverse').value).join(', ');
    const discId = document.getElementById('editCodexDiscipline').value;
    const updatedAttrs = { ...(entry.attributes || {}) };
    document.querySelectorAll('#editCodexDynamicFields .edit-dyn-attr').forEach(el => {
      updatedAttrs[el.dataset.attrKey] = el.value.trim();
    });

    try {
      await TaliesinAPI.updateCodexEntry(entry.id, {
        title: document.getElementById('editCodexTitle').value,
        category: getDisciplineById(discId)?.title || discId,
        disciplineId: discId,
        parentEntryId: document.getElementById('editCodexParentEntry').value || null,
        attributes: updatedAttrs,
        universe: cleanUniverse,
        description: document.getElementById('editCodexDesc').value,
        isShared: document.getElementById('editCodexShared').checked
      });
      await refresh();
      if (returnBookId) {
        openBookEditorModal(returnBookId);
      } else {
        closeModal();
        renderGlobalCodex();
      }
    } catch (err) {
      alert(err.message);
    }
  };
};

// --- Візуалізатор діаграм (Дерево, Піраміда/Кола, Хронологія, Мережа зв'язків) ---
let ringsVisualSubmode = 'orbit'; // 'orbit' (концентричні кола) | 'pyramid' (піраміда)

window.setRingsSubmode = (mode) => {
  ringsVisualSubmode = mode;
  renderCodexDiagram();
};

window.openCodexNodePreview = (entryId) => {
  const entry = (state?.codexEntries || []).find(e => e.id === entryId);
  if (!entry) return;

  const entries = state.codexEntries || [];
  const relations = state.codexRelations || [];
  const parentEntry = entry.parent_entry_id ? entries.find(p => p.id === entry.parent_entry_id) : null;
  const universeTagsHtml = renderUniverseTags(entry.universe, false);

  const relatedList = relations
    .filter(r => r.source_id === entry.id || r.target_id === entry.id)
    .map(r => {
      const isSource = r.source_id === entry.id;
      const other = entries.find(e => e.id === (isSource ? r.target_id : r.source_id));
      if (!other) return '';
      const arrow = isSource ? '→' : '←';
      const role = r.role_label ? ` (${escapeHtml(r.role_label)})` : '';
      const period = r.period_label ? ` · ${escapeHtml(r.period_label)}` : '';
      return `
        <div class="chapter-item" style="flex-wrap:wrap;">
          <span>${arrow} <strong>${escapeHtml(other.title)}</strong><small class="subtitle">${role}${period}</small></span>
          <button type="button" class="btn" style="padding:0.2rem 0.6rem; font-size:0.8rem;" onclick="openCodexNodePreview('${other.id}')">Відкрити</button>
        </div>
      `;
    })
    .filter(Boolean)
    .join('');

  openModal(`
    <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center; padding-right:2rem;">
      ${renderCanonBadge(entry.canon_status)}
      <span class="badge">${escapeHtml(getDisciplineTitle(entry))}</span>
    </div>
    <h2 style="margin-top:0.55rem;">${escapeHtml(entry.title)}</h2>

    ${parentEntry ? `
      <div style="margin-bottom:0.5rem;">
        <button type="button" class="lineage-pill" onclick="openCodexNodePreview('${parentEntry.id}')">
          🧬 Базується на: <strong>${escapeHtml(parentEntry.title)}</strong>
        </button>
      </div>
    ` : ''}

    ${universeTagsHtml ? `<div style="display:flex; gap:0.35rem; flex-wrap:wrap; margin-bottom:0.65rem;">${universeTagsHtml}</div>` : ''}

    ${renderEntryAttributes(entry)}

    <div style="white-space:pre-line; margin:0.8rem 0 1.2rem; color:var(--text-main);">${escapeHtml(entry.description)}</div>

    <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1.2rem;">
      <button type="button" class="btn btn-primary" onclick="closeModal(); openEntryDiagram('${entry.id}')">🌳 Зробити центром діаграми</button>
      <button type="button" class="btn" onclick="closeModal(); focusCodexEntry('${entry.id}')">📋 Показати в картках</button>
    </div>

    ${relatedList ? `
      <hr style="margin:1rem 0; border-color:var(--border);" />
      <h4>🔗 Пов'язані сутності</h4>
      <div>${relatedList}</div>
    ` : ''}
  `);
};

window.openEntryDiagram = (entryId) => {
  switchCodexMode('diagrams');
  const rootSelect = document.getElementById('diagramRootSelect');
  if (rootSelect) rootSelect.value = entryId;
  renderCodexDiagram();
};

function populateDiagramControls() {
  const rootSelect = document.getElementById('diagramRootSelect');
  if (!rootSelect || !state) return;
  const prev = rootSelect.value;
  const entries = state.codexEntries || [];
  rootSelect.innerHTML = `<option value="">-- Оберіть кореневу сутність --</option>` +
    entries.map(e => `<option value="${e.id}">${e.canon_status === 'official' ? '🏛️ ' : '🪶 '}${escapeHtml(e.title)} (${escapeHtml(getDisciplineTitle(e))})</option>`).join('');
  if (prev) rootSelect.value = prev;
}

function renderCodexDiagram() {
  const canvas = document.getElementById('diagramCanvasArea');
  if (!canvas || !state) return;

  const type = document.getElementById('diagramTypeSelect')?.value || 'tree';
  const rootId = document.getElementById('diagramRootSelect')?.value || '';
  const entries = state.codexEntries || [];
  const relations = state.codexRelations || [];

  // 1. Дерево фундаментальних наук
  if (type === 'disciplines') {
    const disciplines = getAvailableDisciplines();
    const renderDiscBranch = (parentId = null) => {
      const children = disciplines.filter(d => (d.parent_id || null) === parentId);
      if (!children.length) return '';
      return children.map(d => {
        const deps = (d.depends_on || []).map(depId => getDisciplineById(depId)?.title || depId).filter(Boolean);
        return `
          <div class="diagram-tree-node">
            <div class="diagram-node-card is-official">
              <strong>${escapeHtml(d.title)}</strong>
              ${deps.length ? `<small class="subtitle">📐 Спирається на: ${escapeHtml(deps.join(', '))}</small>` : ''}
              <small class="subtitle">Полів схеми: ${(d.schema_fields || []).length}</small>
            </div>
            ${renderDiscBranch(d.id)}
          </div>
        `;
      }).join('');
    };
    canvas.innerHTML = `<h3>🧬 Ієрархія та наслідування наук порталу</h3>${renderDiscBranch(null)}`;
    return;
  }

  if (!rootId) {
    canvas.innerHTML = '<p class="subtitle">Оберіть кореневу сутність у списку вище (або натисніть 🌳 на будь-якій картці Кодексу), щоб побудувати діаграму.</p>';
    return;
  }

  const rootEntry = entries.find(e => e.id === rootId);
  if (!rootEntry) return;

  // 2. Дерево (родовід, види, наслідування)
  if (type === 'tree') {
    const visited = new Set();
    const buildTreeHtml = (nodeId, roleLabel = '') => {
      if (visited.has(nodeId)) return '';
      visited.add(nodeId);
      const node = entries.find(e => e.id === nodeId);
      if (!node) return '';

      const relChildren = relations
        .filter(r => r.source_id === nodeId && r.diagram_type === 'tree')
        .map(r => ({ id: r.target_id, label: r.role_label }));
      const forkChildren = entries
        .filter(e => e.parent_entry_id === nodeId)
        .map(e => ({ id: e.id, label: 'Варіація / Відгалуження' }));

      const allChildren = deduplicateList([...relChildren, ...forkChildren], c => c.id);

      return `
        <div class="diagram-tree-node">
          <div class="diagram-node-card ${node.canon_status === 'official' ? 'is-official' : ''}" style="cursor:pointer;" onclick="openCodexNodePreview('${node.id}')" title="Натисніть для перегляду досьє">
            ${roleLabel ? `<span class="badge" style="align-self:flex-start;">${escapeHtml(roleLabel)}</span>` : ''}
            <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
              <strong>${escapeHtml(node.title)}</strong>
              ${renderCanonBadge(node.canon_status)}
            </div>
            <small class="subtitle">${escapeHtml(getDisciplineTitle(node))}</small>
          </div>
          ${allChildren.map(ch => buildTreeHtml(ch.id, ch.label)).join('')}
        </div>
      `;
    };

    canvas.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
        <h3 style="margin:0;">🌳 Ієрархічне дерево: ${escapeHtml(rootEntry.title)}</h3>
        <small class="subtitle">Клікніть по будь-якому вузлу для відкриття досьє</small>
      </div>
      ${buildTreeHtml(rootId)}
    `;
    return;
  }

  // 3. Концентричні кола / Соціальна піраміда (гільдії, ордени, держави)
  if (type === 'rings') {
    const orgRels = relations.filter(r => r.source_id === rootId && r.diagram_type === 'rings');
    if (!orgRels.length) {
      canvas.innerHTML = `<p class="subtitle">Для «${escapeHtml(rootEntry.title)}» ще не додано рівнів організації. Додайте зв'язки типу «Кола / Піраміда» у Майстерні.</p>`;
      return;
    }

    const tiers = {};
    orgRels.forEach(r => {
      const lvl = Number(r.tier_level) || 1;
      if (!tiers[lvl]) tiers[lvl] = [];
      tiers[lvl].push(r);
    });
    const sortedLevels = Object.keys(tiers).map(Number).sort((a, b) => a - b);

    const switcherHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem; margin-bottom:1rem;">
        <div>
          <h3 style="margin:0;">🎯 Структура: ${escapeHtml(rootEntry.title)}</h3>
          <small class="subtitle">Від внутрішнього ядра (Рівень 1) до зовнішнього кола клієнтів і союзників</small>
        </div>
        <div class="tabs" style="margin:0;">
          <button type="button" class="tab-btn ${ringsVisualSubmode === 'orbit' ? 'active' : ''}" onclick="setRingsSubmode('orbit')">⭕ Кола</button>
          <button type="button" class="tab-btn ${ringsVisualSubmode === 'pyramid' ? 'active' : ''}" onclick="setRingsSubmode('pyramid')">🔺 Піраміда</button>
        </div>
      </div>
    `;

    if (ringsVisualSubmode === 'orbit') {
      const ringCount = sortedLevels.length;
      const minRadius = 95;
      const maxRadius = 230;
      const step = ringCount > 1 ? (maxRadius - minRadius) / (ringCount - 1) : 0;

      const circlesSvg = sortedLevels.map((_, idx) => {
        const r = minRadius + idx * step;
        return `<circle cx="270" cy="270" r="${r}" class="orbit-ring-circle" />`;
      }).join('');

      const nodesHtml = sortedLevels.map((lvl, idx) => {
        const r = minRadius + idx * step;
        const members = tiers[lvl];
        return members.map((rel, mIdx) => {
          const member = entries.find(e => e.id === rel.target_id);
          if (!member) return '';
          const angle = ((2 * Math.PI) / members.length) * mIdx - Math.PI / 2 + idx * 0.45;
          const leftPct = ((270 + r * Math.cos(angle)) / 540) * 100;
          const topPct = ((270 + r * Math.sin(angle)) / 540) * 100;
          const label = rel.role_label ? `${member.title} · ${rel.role_label}` : member.title;
          return `
            <button type="button" class="orbit-node-btn" style="left:${leftPct.toFixed(1)}%; top:${topPct.toFixed(1)}%;"
              onclick="openCodexNodePreview('${member.id}')" title="Рівень ${lvl}: ${escapeHtml(label)}">
              ${escapeHtml(member.title)}
            </button>
          `;
        }).join('');
      }).join('');

      const legendHtml = sortedLevels.map(lvl => {
        const tierLabel = tiers[lvl][0]?.role_label || `Рівень ${lvl}`;
        return `<span class="badge">Кільце ${lvl}: ${escapeHtml(tierLabel)} (${tiers[lvl].length})</span>`;
      }).join('');

      canvas.innerHTML = `
        ${switcherHtml}
        <div class="orbit-view-wrap">
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap; justify-content:center;">${legendHtml}</div>
          <div class="orbit-svg-box">
            <svg viewBox="0 0 540 540">${circlesSvg}</svg>
            <button type="button" class="orbit-center-pill" onclick="openCodexNodePreview('${rootEntry.id}')">${escapeHtml(rootEntry.title)}</button>
            ${nodesHtml}
          </div>
        </div>
      `;
      return;
    }

    canvas.innerHTML = `
      ${switcherHtml}
      ${sortedLevels.map((lvl, idx) => {
        const widthPct = Math.min(100, 48 + idx * 14);
        const tierLabel = tiers[lvl][0]?.role_label || `Рівень ${lvl}`;
        return `
          <div class="pyramid-tier" style="max-width:${widthPct}%;">
            <div class="pyramid-tier-header">Рівень ${lvl} · ${escapeHtml(tierLabel)}</div>
            <div class="pyramid-members">
              ${tiers[lvl].map(r => {
                const member = entries.find(e => e.id === r.target_id);
                return member
                  ? `<button type="button" class="btn" onclick="openCodexNodePreview('${member.id}')">${escapeHtml(member.title)}${r.role_label ? ` (${escapeHtml(r.role_label)})` : ''}</button>`
                  : '';
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    `;
    return;
  }

  // 4. Хронологія володіння (артефакти, локації, династії)
  if (type === 'timeline') {
    const timeRels = relations
      .filter(r => r.source_id === rootId && r.diagram_type === 'timeline')
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    if (!timeRels.length) {
      canvas.innerHTML = `<p class="subtitle">Для «${escapeHtml(rootEntry.title)}» ще не зафіксовано хронології. Додайте зв'язки типу «Хронологія» у Майстерні.</p>`;
      return;
    }

    canvas.innerHTML = `
      <h3>⏳ Хронологія володіння / історії: ${escapeHtml(rootEntry.title)}</h3>
      <div class="timeline-track" style="margin-top:1rem;">
        ${timeRels.map(r => {
          const holder = entries.find(e => e.id === r.target_id);
          return `
            <div class="timeline-step" style="${holder ? 'cursor:pointer;' : ''}" ${holder ? `onclick="openCodexNodePreview('${holder.id}')"` : ''}>
              ${r.period_label ? `<span class="badge">${escapeHtml(r.period_label)}</span>` : ''}
              <div style="margin-top:0.35rem;">
                <strong>${holder ? escapeHtml(holder.title) : 'Невідомий власник'}</strong>
                ${r.role_label ? ` — <span class="subtitle">${escapeHtml(r.role_label)}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    return;
  }

  // 5. Мережа зв'язків 360° (Web: усі вхідні та вихідні грані навколо сутності)
  if (type === 'web') {
    const incoming = [];
    const outgoing = [];

    if (rootEntry.parent_entry_id) {
      const proto = entries.find(e => e.id === rootEntry.parent_entry_id);
      if (proto) incoming.push({ entry: proto, label: '🧬 Взято за основу', period: '' });
    }
    entries.filter(e => e.parent_entry_id === rootId).forEach(fork => {
      outgoing.push({ entry: fork, label: '🌿 Варіація у світі', period: '' });
    });

    relations.forEach(r => {
      if (r.target_id === rootId) {
        const src = entries.find(e => e.id === r.source_id);
        if (src) incoming.push({ entry: src, label: r.role_label || r.diagram_type, period: r.period_label });
      }
      if (r.source_id === rootId) {
        const tgt = entries.find(e => e.id === r.target_id);
        if (tgt) outgoing.push({ entry: tgt, label: r.role_label || r.diagram_type, period: r.period_label });
      }
    });

    const renderEdgeCard = (item, direction) => `
      <div class="web-edge-card" onclick="openCodexNodePreview('${item.entry.id}')">
        <div style="display:flex; justify-content:space-between; gap:0.4rem; align-items:center; flex-wrap:wrap;">
          <span class="badge">${direction} ${escapeHtml(item.label)}</span>
          ${item.period ? `<small class="subtitle">${escapeHtml(item.period)}</small>` : ''}
        </div>
        <strong style="display:block; margin-top:0.35rem;">${escapeHtml(item.entry.title)}</strong>
        <small class="subtitle">${escapeHtml(getDisciplineTitle(item.entry))}</small>
      </div>
    `;

    canvas.innerHTML = `
      <h3>🕸️ Мережа зв'язків навколо: ${escapeHtml(rootEntry.title)}</h3>
      <p class="subtitle">Усі вхідні джерела (зліва) та вихідні зв'язки (справа)</p>
      <div class="web-graph-grid">
        <div class="web-column">
          ${incoming.length
            ? incoming.map(i => renderEdgeCard(i, '←')).join('')
            : '<p class="subtitle" style="text-align:center;">Вхідних зв’язків немає</p>'}
        </div>

        <div class="web-hub-card" style="cursor:pointer;" onclick="openCodexNodePreview('${rootEntry.id}')">
          ${renderCanonBadge(rootEntry.canon_status)}
          <h3 style="margin:0.4rem 0 0.2rem;">${escapeHtml(rootEntry.title)}</h3>
          <small class="subtitle">${escapeHtml(getDisciplineTitle(rootEntry))}</small>
        </div>

        <div class="web-column">
          ${outgoing.length
            ? outgoing.map(o => renderEdgeCard(o, '→')).join('')
            : '<p class="subtitle" style="text-align:center;">Вихідних зв’язків немає</p>'}
        </div>
      </div>
    `;
  }
}

// --- Майстерня: вкладка Кодексу та зв'язків ---
function renderWorkshopDynamicFields() {
  const container = document.getElementById('wsCodexDynamicFields');
  const discId = document.getElementById('wsCodexDiscipline')?.value;
  if (!container) return;

  const disc = getDisciplineById(discId);
  const fields = Array.isArray(disc?.schema_fields) ? disc.schema_fields : [];

  if (!fields.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <strong style="font-size:0.86rem; color:var(--accent);">📐 Параметри науки «${escapeHtml(disc.title)}»</strong>
    ${fields.map(f => f.type === 'textarea'
      ? `<textarea class="input textarea ws-dynamic-attr" data-attr-key="${escapeHtml(f.key)}" rows="2" placeholder="${escapeHtml(f.label)}"></textarea>`
      : `<input type="text" class="input ws-dynamic-attr" data-attr-key="${escapeHtml(f.key)}" placeholder="${escapeHtml(f.label)}" />`
    ).join('')}
  `;
}

function initWorkshopCodex() {
  const discSelect = document.getElementById('wsCodexDiscipline');
  const parentSelect = document.getElementById('wsCodexParentEntry');
  const srcSelect = document.getElementById('wsRelSource');
  const tgtSelect = document.getElementById('wsRelTarget');

  const disciplines = getAvailableDisciplines();
  const entries = state?.codexEntries || [];

  if (discSelect) {
    const prevDisc = discSelect.value;
    discSelect.innerHTML = disciplines.map(d =>
      `<option value="${escapeHtml(d.id)}">${d.parent_id ? '↳ ' : ''}${escapeHtml(d.title)}</option>`
    ).join('');
    discSelect.value = (prevDisc && disciplines.some(d => d.id === prevDisc))
      ? prevDisc
      : disciplines[0].id;
    renderWorkshopDynamicFields();
  }

  const entryOptionsHtml = entries.map(e =>
    `<option value="${e.id}">${e.canon_status === 'official' ? '🏛️ ' : '🪶 '}${escapeHtml(e.title)} (${escapeHtml(getDisciplineTitle(e))})</option>`
  ).join('');

  if (parentSelect) {
    parentSelect.innerHTML = `<option value="">🧬 Взято за основу (необов'язково)</option>` + entryOptionsHtml;
  }
  if (srcSelect) {
    srcSelect.innerHTML = `<option value="">-- Сутність А (Предок / Гільдія / Артефакт) --</option>` + entryOptionsHtml;
  }
  if (tgtSelect) {
    tgtSelect.innerHTML = `<option value="">-- Сутність Б (Нащадок / Учасник / Власник) --</option>` + entryOptionsHtml;
  }

  renderWorkshopRelationsList();
}

document.getElementById('wsCodexDiscipline')?.addEventListener('change', renderWorkshopDynamicFields);

document.getElementById('workshopCodexForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!getCurrentUser()) return openAuthModal();

  const attributes = {};
  document.querySelectorAll('#wsCodexDynamicFields .ws-dynamic-attr').forEach(el => {
    const k = el.dataset.attrKey;
    const v = el.value.trim();
    if (k && v) attributes[k] = v;
  });

  const cleanUniverse = parseUniverseTags(document.getElementById('wsCodexUniverse').value).join(', ');
  const disciplineId = document.getElementById('wsCodexDiscipline').value;

  try {
    await TaliesinAPI.createCodexEntry({
      title: document.getElementById('wsCodexTitle').value,
      category: getDisciplineById(disciplineId)?.title || disciplineId,
      disciplineId,
      parentEntryId: document.getElementById('wsCodexParentEntry').value || null,
      canonStatus: document.getElementById('wsCodexCanonStatus').value,
      attributes,
      universe: cleanUniverse,
      description: document.getElementById('wsCodexDesc').value,
      isShared: document.getElementById('wsCodexShared').checked
    });
    e.target.reset();
    await refresh();
    initWorkshopCodex();
    alert('Картку успішно додано до Кодексу!');
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('workshopRelationForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!getCurrentUser()) return openAuthModal();

  try {
    await TaliesinAPI.createCodexRelation({
      sourceId: document.getElementById('wsRelSource').value,
      targetId: document.getElementById('wsRelTarget').value,
      diagramType: document.getElementById('wsRelDiagramType').value,
      roleLabel: document.getElementById('wsRelRoleLabel').value,
      tierLevel: document.getElementById('wsRelTierLevel').value,
      periodLabel: document.getElementById('wsRelPeriodLabel').value,
      sortOrder: (state?.codexRelations || []).length + 1
    });
    e.target.reset();
    await refresh();
    renderWorkshopRelationsList();
  } catch (err) {
    alert(err.message);
  }
});

function renderWorkshopRelationsList() {
  const listEl = document.getElementById('workshopRelationsList');
  if (!listEl || !state) return;

  const user = getCurrentUser();
  const entries = state.codexEntries || [];
  const relations = (state.codexRelations || []).filter(r =>
    user && (user.role === 'admin' || r.author_id === user.id)
  );

  if (!relations.length) {
    listEl.innerHTML = '<p class="subtitle">У вас поки немає створених зв’язків для діаграм.</p>';
    return;
  }

  const typeNames = { tree: '🌳 Дерево', rings: '🎯 Кола', timeline: '⏳ Хронологія', web: '🕸️ Зв’язок' };

  listEl.innerHTML = relations.map(r => {
    const src = entries.find(e => e.id === r.source_id);
    const tgt = entries.find(e => e.id === r.target_id);
    return `
      <div class="chapter-item" style="flex-wrap:wrap;">
        <div>
          <span class="badge">${typeNames[r.diagram_type] || r.diagram_type}</span>
          <strong>${escapeHtml(src?.title || '?')}</strong> → <strong>${escapeHtml(tgt?.title || '?')}</strong>
          ${r.role_label ? `<small class="subtitle">(${escapeHtml(r.role_label)})</small>` : ''}
          ${r.period_label ? `<small class="subtitle">· ${escapeHtml(r.period_label)}</small>` : ''}
        </div>
        <button type="button" class="btn btn-danger" style="padding:0.2rem 0.6rem; font-size:0.8rem;" onclick="deleteWorkshopRelation('${r.id}')">✕</button>
      </div>
    `;
  }).join('');
}

window.deleteWorkshopRelation = async (relId) => {
  try {
    await TaliesinAPI.deleteCodexRelation(relId);
    await refresh();
    renderWorkshopRelationsList();
  } catch (err) {
    alert(err.message);
  }
};
