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

// --- Стан фільтрів Кодексу та Меню наук ---
let codexFilterState = {
  disciplineId: 'all',
  includeSubdisciplines: true,
  enabledSubIds: null, // null = усі підрозділи активні, або Set із вибраних ID
  canonFilter: 'all',
  discMenuMode: '1d', // '1d' | '2d'
  expandedDiscIds: new Set()
};

function getSubdisciplinesOf(parentId) {
  return getAvailableDisciplines().filter(d => d.parent_id === parentId);
}

window.selectCodexDiscipline = (discId) => {
  codexFilterState.disciplineId = discId;
  populateDiagramControls(); if (!document.getElementById('codexDiagramsView')?.classList.contains('hidden')) renderCodexDiagram();
  if (discId === 'all') {
    codexFilterState.enabledSubIds = null;
  } else {
    const subs = getSubdisciplinesOf(discId);
    codexFilterState.enabledSubIds = new Set(subs.map(s => s.id));
  }
  renderDisciplinesNavMenu();
  renderGlobalCodex();
};

window.toggleExpandDisciplineMenu = (discId) => {
  if (codexFilterState.expandedDiscIds.has(discId)) {
    codexFilterState.expandedDiscIds.delete(discId);
  } else {
    codexFilterState.expandedDiscIds.add(discId);
  }
  renderDisciplinesNavMenu();
};

function renderDisciplinesNavMenu() {
  const area = document.getElementById('codexDisciplinesMenuArea');
  if (!area) return;

  const disciplines = getAvailableDisciplines();
  const entries = state?.codexEntries || [];
  const selectedId = codexFilterState.disciplineId;

  document.getElementById('discMenu1DBtn')?.classList.toggle('active', codexFilterState.discMenuMode === '1d');
  document.getElementById('discMenu2DBtn')?.classList.toggle('active', codexFilterState.discMenuMode === '2d');

  // --- Режим 1D: Розгортаючийся список наук ---
  if (codexFilterState.discMenuMode === '1d') {
    const renderNode1D = (disc) => {
      const children = disciplines.filter(d => d.parent_id === disc.id);
      const hasChildren = children.length > 0;
      const isExpanded = codexFilterState.expandedDiscIds.has(disc.id);
      const isActive = selectedId === disc.id;
      const count = entries.filter(e => e.discipline_id === disc.id).length;

      return `
        <div>
          <div class="disc-menu-row">
            ${hasChildren
              ? `<button type="button" class="disc-expand-btn" onclick="toggleExpandDisciplineMenu('${escapeHtml(disc.id)}')" title="${isExpanded ? 'Згорнути підрозділи' : 'Розгорнути підрозділи'}">${isExpanded ? '▼' : '▶'}</button>`
              : `<span style="width:26px; display:inline-block;"></span>`}
            <button type="button" class="disc-pill-btn ${isActive ? 'active' : ''}" onclick="selectCodexDiscipline('${escapeHtml(disc.id)}')">
              ${escapeHtml(disc.title)} <small style="opacity:0.8;">(${count})</small>
            </button>
          </div>
          ${hasChildren && isExpanded ? `
            <div class="disc-sub-children">
              ${children.map(ch => renderNode1D(ch)).join('')}
            </div>
          ` : ''}
        </div>
      `;
    };

    const roots = disciplines.filter(d => !d.parent_id || !disciplines.some(p => p.id === d.parent_id));
    area.innerHTML = `
      <div class="disc-menu-1d-list">
        <div class="disc-menu-row">
          <span style="width:26px; display:inline-block;"></span>
          <button type="button" class="disc-pill-btn ${selectedId === 'all' ? 'active' : ''}" onclick="selectCodexDiscipline('all')">
            🌐 Усі науки та розділи (${entries.length})
          </button>
        </div>
        ${roots.map(r => renderNode1D(r)).join('')}
      </div>
    `;
    return;
  }

  // --- Режим 2D: Граф-дерево фундаментальних наук (клік фільтрує картки) ---
  const roots = disciplines.filter(d => !d.parent_id || !disciplines.some(p => p.id === d.parent_id));
  const buildDiscTree = (d, depth = 0, branchIdx = null) => {
    const kids = disciplines.filter(c => c.parent_id === d.id);
    return {
      disc: d,
      depth,
      branchIdx,
      children: kids.map((c, idx) => buildDiscTree(c, depth + 1, depth === 0 ? idx : branchIdx))
    };
  };

  const forest = roots.map((r, idx) => buildDiscTree(r, 0, idx));
  const SLOT_W = 195;
  const LVL_H = 118;
  let maxD = 0;

  const measure = (n) => {
    if (n.depth > maxD) maxD = n.depth;
    if (!n.children.length) { n.span = 1; return 1; }
    n.span = n.children.reduce((s, c) => s + measure(c), 0);
    return n.span;
  };
  const totalSpan = forest.reduce((s, r) => s + measure(r), 0);

  const nodes = [];
  const edges = [];
  const layout = (n, left) => {
    n.x = Math.round((left + n.span / 2) * SLOT_W + 25);
    n.y = n.depth * LVL_H + 18;
    nodes.push(n);
    let cur = left;
    n.children.forEach(c => {
      layout(c, cur);
      edges.push({ from: n, to: c });
      cur += c.span;
    });
  };
  let startSlot = 0;
  forest.forEach(r => { layout(r, startSlot); startSlot += r.span; });

  const w = Math.max(600, totalSpan * SLOT_W + 50);
  const h = (maxD + 1) * LVL_H + 20;

  const paths = edges.map(({ from, to }) => {
    const x1 = from.x, y1 = from.y + 52, x2 = to.x, y2 = to.y;
    const midY = Math.round((y1 + y2) / 2);
    const col = BRANCH_PALETTE[(to.branchIdx || 0) % BRANCH_PALETTE.length];
    return `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="2.2" />`;
  }).join('');

  const cards = nodes.map(n => {
    const col = BRANCH_PALETTE[(n.branchIdx || 0) % BRANCH_PALETTE.length];
    const isSel = selectedId === n.disc.id;
    const cnt = entries.filter(e => e.discipline_id === n.disc.id).length;
    return `
      <button type="button" class="tree-2d-node" style="left:${n.x}px; top:${n.y}px; border-top:4px solid ${col}; ${isSel ? 'background:var(--accent-soft); border-color:var(--accent);' : ''}"
        onclick="selectCodexDiscipline('${escapeHtml(n.disc.id)}')">
        <strong style="font-size:0.82rem; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(n.disc.title)}</strong>
        <small class="subtitle" style="font-size:0.72rem;">Карток: ${cnt}</small>
      </button>
    `;
  }).join('');

  area.innerHTML = `
    <div style="margin-bottom:0.5rem;">
      <button type="button" class="disc-pill-btn ${selectedId === 'all' ? 'active' : ''}" onclick="selectCodexDiscipline('all')">🌐 Показати всі науки</button>
    </div>
    <div class="tree-2d-viewport">
      <div class="tree-2d-stage" style="width:${w}px; height:${h}px;">
        <svg class="tree-2d-svg" viewBox="0 0 ${w} ${h}">${paths}</svg>
        ${cards}
      </div>
    </div>
  `;
}

document.getElementById('discMenu1DBtn')?.addEventListener('click', () => {
  codexFilterState.discMenuMode = '1d';
  renderDisciplinesNavMenu();
});
document.getElementById('discMenu2DBtn')?.addEventListener('click', () => {
  codexFilterState.discMenuMode = '2d';
  renderDisciplinesNavMenu();
});

window.openAdvancedCodexSearchModal = () => {
  const discId = codexFilterState.disciplineId;
  const disc = discId !== 'all' ? getDisciplineById(discId) : null;
  const subdisciplines = disc ? getSubdisciplinesOf(disc.id) : [];

  openModal(`
    <span class="badge">⚙️ Розширений пошук Кодексу</span>
    <h2 style="margin-top:0.5rem;">Параметри фільтрації</h2>

    <div class="stack-form" style="margin-top:1rem;">
      <label class="subtitle">Статус у порталі</label>
      <select id="advCanonSelect" class="input">
        <option value="all">Усі записи (Канон + Спільнота)</option>
        <option value="official">🏛️ Тільки офіційний Канон</option>
        <option value="community">🪶 Тільки ідеї спільноти</option>
      </select>

      ${disc ? `
        <hr style="border-color:var(--border);" />
        <div>
          <strong>Обрана наука: ${escapeHtml(disc.title)}</strong>
          ${subdisciplines.length ? `
            <label class="subtitle" style="display:flex; align-items:center; gap:0.5rem; margin-top:0.6rem; cursor:pointer;">
              <input type="checkbox" id="advIncludeSubsCheck" ${codexFilterState.includeSubdisciplines ? 'checked' : ''} />
              Показувати також картки підрозділів цієї науки (${subdisciplines.length})
            </label>
            <div id="advSubdisciplinesBox" class="${codexFilterState.includeSubdisciplines ? '' : 'hidden'}" style="margin-top:0.65rem; padding:0.75rem; background:var(--bg-subtle); border-radius:10px; display:flex; flex-direction:column; gap:0.4rem;">
              <small class="subtitle">Оберіть конкретні підрозділи для показу:</small>
              ${subdisciplines.map(sub => {
                const isChecked = !codexFilterState.enabledSubIds || codexFilterState.enabledSubIds.has(sub.id);
                return `
                  <label style="display:flex; align-items:center; gap:0.45rem; font-size:0.88rem; cursor:pointer;">
                    <input type="checkbox" class="adv-sub-check" value="${escapeHtml(sub.id)}" ${isChecked ? 'checked' : ''} />
                    ${escapeHtml(sub.title)}
                  </label>
                `;
              }).join('')}
            </div>
          ` : `<p class="subtitle" style="margin-top:0.35rem;">У цієї науки поки немає підрозділів.</p>`}
        </div>
      ` : `<p class="subtitle">Підказка: оберіть конкретну науку в навігаторі вище, щоб налаштувати фільтр її підрозділів.</p>`}

      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
        <button type="button" id="applyAdvCodexSearchBtn" class="btn btn-primary">Застосувати параметри</button>
        <button type="button" class="btn" onclick="closeModal()">Закрити</button>
      </div>
    </div>
  `);

  document.getElementById('advCanonSelect').value = codexFilterState.canonFilter;

  const incCheck = document.getElementById('advIncludeSubsCheck');
  const subsBox = document.getElementById('advSubdisciplinesBox');
  if (incCheck && subsBox) {
    incCheck.onchange = () => subsBox.classList.toggle('hidden', !incCheck.checked);
  }

  document.getElementById('applyAdvCodexSearchBtn').onclick = () => {
    codexFilterState.canonFilter = document.getElementById('advCanonSelect').value;
    if (incCheck) {
      codexFilterState.includeSubdisciplines = incCheck.checked;
      const checkedIds = [...document.querySelectorAll('.adv-sub-check:checked')].map(el => el.value);
      codexFilterState.enabledSubIds = new Set(checkedIds);
    }
    closeModal();
    renderGlobalCodex();
  };
};

document.getElementById('openAdvancedCodexSearchBtn')?.addEventListener('click', openAdvancedCodexSearchModal);
document.getElementById('resetCodexFiltersBtn')?.addEventListener('click', () => {
  codexFilterState.disciplineId = 'all';
  codexFilterState.canonFilter = 'all';
  codexFilterState.includeSubdisciplines = true;
  codexFilterState.enabledSubIds = null;
  const searchEl = document.getElementById('globalCodexSearch');
  if (searchEl) searchEl.value = '';
  renderDisciplinesNavMenu();
  renderGlobalCodex();
});

function populateGlobalDisciplineFilter() {
  renderDisciplinesNavMenu();
}

function renderGlobalCodex() {
  const container = document.getElementById('globalCodexList');
  if (!container || !state) return;

  const user = getCurrentUser();
  const q = (document.getElementById('globalCodexSearch')?.value || '').toLowerCase().replace(/^#+/, '').trim();
  const discFilter = codexFilterState.disciplineId || 'all';
  const canonFilter = codexFilterState.canonFilter || 'all';

  const allowedDisciplineIds = new Set();
  if (discFilter !== 'all') {
    allowedDisciplineIds.add(discFilter);
    if (codexFilterState.includeSubdisciplines) {
      getSubdisciplinesOf(discFilter).forEach(sub => {
        if (!codexFilterState.enabledSubIds || codexFilterState.enabledSubIds.has(sub.id)) {
          allowedDisciplineIds.add(sub.id);
        }
      });
    }
  }

  const hasActiveFilters = discFilter !== 'all' || canonFilter !== 'all' || Boolean(q);
  document.getElementById('resetCodexFiltersBtn')?.classList.toggle('hidden', !hasActiveFilters);
  document.getElementById('advSearchActiveBadge')?.classList.toggle('hidden', canonFilter === 'all' && codexFilterState.includeSubdisciplines);

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
    const fields = (Array.isArray(disc?.schema_fields) ? disc.schema_fields : []).filter(f => !f.hidden);
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

// --- Візуалізатор діаграм (1D/2D Дерево, Перетини коренів, Шкала часу, Кола, Хронологія, Web) ---
let ringsVisualSubmode = 'orbit';
let treeVisualSubmode = '2d'; // '2d' | '1d'
let treeLayoutAxis = 'generation'; // 'generation' | 'timeline_decades'
let treeHighlightGenerations = true;
let treeColorBranches = true;
let compareRootIds = []; // Додаткові корені для порівняння та перетинів
let secondaryRootsGenMode = 'all_first'; // 'all_first' | 'relative_to_main'

const BRANCH_PALETTE = [
  '#c5962c', '#2e8b57', '#2b6cb0', '#805ad5', '#c53030', '#0d9488', '#d97706'
];

const GENERATION_TINTS = [
  'rgba(197, 150, 44, 0.08)',
  'rgba(46, 139, 87, 0.08)',
  'rgba(43, 108, 176, 0.08)',
  'rgba(128, 90, 213, 0.08)',
  'rgba(13, 148, 136, 0.08)'
];

const DECADE_TINTS = [
  'rgba(59, 130, 246, 0.08)',
  'rgba(16, 185, 129, 0.08)',
  'rgba(245, 158, 11, 0.08)',
  'rgba(168, 85, 247, 0.08)',
  'rgba(236, 72, 153, 0.08)',
  'rgba(20, 184, 166, 0.08)'
];

window.setRingsSubmode = (mode) => { ringsVisualSubmode = mode; renderCodexDiagram(); };
window.setTreeSubmode = (mode) => { treeVisualSubmode = mode; renderCodexDiagram(); };
window.setTreeLayoutAxis = (axis) => { treeLayoutAxis = axis; renderCodexDiagram(); };
window.setSecondaryRootsGenMode = (mode) => { secondaryRootsGenMode = mode; renderCodexDiagram(); };
window.toggleTreeGenerations = () => { treeHighlightGenerations = !treeHighlightGenerations; renderCodexDiagram(); };
window.toggleTreeBranchColors = () => { treeColorBranches = !treeColorBranches; renderCodexDiagram(); };

window.removeCompareRoot = (id) => {
  compareRootIds = compareRootIds.filter(x => x !== id);
  populateDiagramControls();
  renderCodexDiagram();
};

function getAllowedDisciplineIdsForCurrentFilter() {
  const discFilter = codexFilterState.disciplineId || 'all';
  if (discFilter === 'all') return null; // Усі науки
  const allowed = new Set([discFilter]);
  if (codexFilterState.includeSubdisciplines) {
    getSubdisciplinesOf(discFilter).forEach(sub => {
      if (!codexFilterState.enabledSubIds || codexFilterState.enabledSubIds.has(sub.id)) {
        allowed.add(sub.id);
      }
    });
  }
  return allowed;
}

function getEntriesScopedByDiscipline() {
  const entries = state?.codexEntries || [];
  const allowed = getAllowedDisciplineIdsForCurrentFilter();
  if (!allowed) return entries;
  return entries.filter(e => allowed.has(e.discipline_id));
}

function extractNumericYear(entry, relations = []) {
  // 1. Шукаємо в атрибутах картки (рік народження, дата заснування тощо)
  const attrs = entry?.attributes || {};
  for (const [k, v] of Object.entries(attrs)) {
    if (/year|birth|date|рік|народж|дата/i.test(k)) {
      const m = String(v).match(/-?\d{1,5}/);
      if (m) return Number(m[0]);
    }
  }
  for (const v of Object.values(attrs)) {
    const m = String(v).match(/\b(-?\d{3,4})\b/);
    if (m) return Number(m[0]);
  }
  // 2. Шукаємо в period_label вхідного зв'язку
  const inRel = relations.find(r => r.target_id === entry.id && r.period_label);
  if (inRel) {
    const m = String(inRel.period_label).match(/-?\d{1,5}/);
    if (m) return Number(m[0]);
  }
  return null;
}

function getNodeFontClass(entry) {
  const f = entry?.visual_style?.font || 'default';
  if (f === 'serif') return 'node-font-serif';
  if (f === 'mono') return 'node-font-mono';
  if (f === 'display') return 'node-font-display';
  return '';
}

function populateDiagramControls() {
  const rootSelect = document.getElementById('diagramRootSelect');
  const compareSelect = document.getElementById('diagramCompareSelect');
  const pillsBox = document.getElementById('diagramComparePills');
  if (!rootSelect || !state) return;

  const scopedEntries = getEntriesScopedByDiscipline();
  const prevRoot = rootSelect.value;

  const optionsHtml = scopedEntries.map(e =>
    `<option value="${e.id}">${e.canon_status === 'official' ? '🏛️ ' : '🪶 '}${escapeHtml(e.title)} (${escapeHtml(getDisciplineTitle(e))})</option>`
  ).join('');

  rootSelect.innerHTML = `<option value="">-- Основна коренева сутність (${scopedEntries.length}) --</option>` + optionsHtml;
  if (prevRoot && scopedEntries.some(e => e.id === prevRoot)) {
    rootSelect.value = prevRoot;
  } else {
    rootSelect.value = '';
  }

  // Очищаємо ті compareRootIds, яких немає в поточній науці або які збігаються з основним коренем
  compareRootIds = compareRootIds.filter(id => id !== rootSelect.value && scopedEntries.some(e => e.id === id));

  if (compareSelect) {
    const availForCompare = scopedEntries.filter(e => e.id !== rootSelect.value && !compareRootIds.includes(e.id));
    compareSelect.innerHTML = `<option value="">+ Порівняти з іншим деревом...</option>` +
      availForCompare.map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('');
  }

  if (pillsBox) {
    pillsBox.innerHTML = compareRootIds.map(cid => {
      const ce = scopedEntries.find(x => x.id === cid);
      if (!ce) return '';
      return `
        <span class="badge" style="display:inline-flex; align-items:center; gap:0.35rem; border:1px solid var(--accent);">
          🌳 Порівняння: <strong>${escapeHtml(ce.title)}</strong>
          <button type="button" style="background:none; border:none; color:var(--danger); cursor:pointer; font-weight:700;" onclick="removeCompareRoot('${ce.id}')">✕</button>
        </span>
      `;
    }).join('');
  }
}

document.getElementById('diagramCompareSelect')?.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val && !compareRootIds.includes(val)) {
    compareRootIds.push(val);
    populateDiagramControls();
    renderCodexDiagram();
  }
});

// Універсальний рендерер 1D/2D дерева (працює і в Кодексі, і в 2D-редакторі Майстерні)
function buildInteractiveTreeHtml({ canvas, rootIds, isEditable = false }) {
  const entries = state.codexEntries || [];
  const relations = state.codexRelations || [];
  const mainRootId = rootIds[0];
  const mainRoot = entries.find(e => e.id === mainRootId);
  if (!mainRoot) return;

  const getChildrenOf = (nodeId) => {
    const relChildren = relations
      .filter(r => r.source_id === nodeId && r.diagram_type === 'tree')
      .map(r => ({ id: r.target_id, label: r.role_label || '', period: r.period_label || '', relId: r.id }));
    const forkChildren = entries
      .filter(e => e.parent_entry_id === nodeId)
      .map(e => ({ id: e.id, label: 'Варіація', period: '', relId: null }));
    return deduplicateList([...relChildren, ...forkChildren], c => c.id);
  };

  // Будуємо вузли та зв'язки з підтримкою перетину кількох коренів
  const nodeMap = new Map(); // id -> { node, depth, branchIdx, parents: [], children: [], year }
  const edgesList = [];

  const traverseRoot = (rId, rootOrderIdx, initialDepth = 0) => {
    const visitedLocal = new Set();
    const walk = (nodeId, depth, branchIdx, parentId = null, roleLabel = '', period = '') => {
      const node = entries.find(e => e.id === nodeId);
      if (!node) return;

      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          node,
          depth,
          branchIdx,
          rootOrderIdx,
          childrenIds: [],
          year: extractNumericYear(node, relations)
        });
      } else {
        const existing = nodeMap.get(nodeId);
        // Якщо вузол уже є (перетин!), беремо максимальну глибину покоління
        if (depth > existing.depth) existing.depth = depth;
      }

      if (parentId) {
        const edgeKey = `${parentId}->${nodeId}`;
        if (!edgesList.some(e => e.key === edgeKey)) {
          edgesList.push({ key: edgeKey, fromId: parentId, toId: nodeId, roleLabel, period, branchIdx });
        }
        const pObj = nodeMap.get(parentId);
        if (pObj && !pObj.childrenIds.includes(nodeId)) {
          pObj.childrenIds.push(nodeId);
        }
      }

      if (visitedLocal.has(nodeId)) return;
      visitedLocal.add(nodeId);

      const kids = getChildrenOf(nodeId);
      kids.forEach((ch, idx) => {
        const nextBranch = parentId === null ? (rootOrderIdx * 3 + idx) : branchIdx;
        walk(ch.id, depth + 1, nextBranch, nodeId, ch.label, ch.period);
      });
    };
    walk(rId, initialDepth, rootOrderIdx * 3, null, '', '');
  };

  // Спочатку обходимо основний корінь
  traverseRoot(mainRootId, 0, 0);

  // Потім додаткові корені (з урахуванням налаштування поколінь при перетині)
  rootIds.slice(1).forEach((secId, idx) => {
    let startDepth = 0;
    if (secondaryRootsGenMode === 'relative_to_main') {
      // Шукаємо спільного нащадка, щоб вирівняти покоління відносно основного дерева
      const secKids = getChildrenOf(secId);
      const sharedKid = secKids.map(k => nodeMap.get(k.id)).find(Boolean);
      if (sharedKid) {
        startDepth = Math.max(0, sharedKid.depth - 1);
      }
    }
    traverseRoot(secId, idx + 1, startDepth);
  });

  const getBranchColor = (branchIdx, customColor = '') => {
    if (customColor) return customColor;
    if (!treeColorBranches || branchIdx === null || branchIdx === undefined) return 'var(--accent)';
    return BRANCH_PALETTE[branchIdx % BRANCH_PALETTE.length];
  };

  const getGenColor = (depth) => BRANCH_PALETTE[depth % BRANCH_PALETTE.length];

  const getGenBg = (depth) => {
    if (!treeHighlightGenerations) return 'transparent';
    return GENERATION_TINTS[depth % GENERATION_TINTS.length];
  };

  const hasSecondaryRoots = rootIds.length > 1;

  const toolbarHtml = `
    <div class="tree-controls-bar">
      <div>
        <h3 style="margin:0;">${isEditable ? '🛠️ 2D Конструктор дерева:' : '🌳 Дерево:'} ${escapeHtml(mainRoot.title)}${hasSecondaryRoots ? ` (+${rootIds.length - 1})` : ''}</h3>
        <small class="subtitle">${isEditable ? 'Натискайте + (додати нащадка), ✏️ (стиль та батьки) або ✕ на картках' : 'Клікніть по вузлу для досьє'}</small>
      </div>
      <div class="tree-toggles">
        ${!isEditable ? `
          <div class="tabs" style="margin:0;">
            <button type="button" class="tab-btn ${treeVisualSubmode === '2d' ? 'active' : ''}" onclick="setTreeSubmode('2d')">🕸️ 2D Граф</button>
            <button type="button" class="tab-btn ${treeVisualSubmode === '1d' ? 'active' : ''}" onclick="setTreeSubmode('1d')">📋 1D Список</button>
          </div>
        ` : ''}
        ${treeVisualSubmode === '2d' || isEditable ? `
          <div class="tabs" style="margin:0;">
            <button type="button" class="tab-btn ${treeLayoutAxis === 'generation' ? 'active' : ''}" onclick="setTreeLayoutAxis('generation')">🏛️ За поколіннями</button>
            <button type="button" class="tab-btn ${treeLayoutAxis === 'timeline_decades' ? 'active' : ''}" onclick="setTreeLayoutAxis('timeline_decades')">⏳ Шкала часу (Декади)</button>
          </div>
        ` : ''}
        <button type="button" class="btn ${treeHighlightGenerations ? 'btn-primary' : ''}" style="padding:0.32rem 0.7rem; font-size:0.78rem;" onclick="toggleTreeGenerations()">
          🎨 Підсвітка
        </button>
        <button type="button" class="btn ${treeColorBranches ? 'btn-primary' : ''}" style="padding:0.32rem 0.7rem; font-size:0.78rem;" onclick="toggleTreeBranchColors()">
          🌈 Гілки
        </button>
      </div>
    </div>
    ${hasSecondaryRoots ? `
      <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-bottom:0.85rem; padding:0.55rem 0.8rem; background:var(--bg-subtle); border-radius:10px;">
        <small class="subtitle"><strong>Покоління додаткових коренів:</strong></small>
        <button type="button" class="btn ${secondaryRootsGenMode === 'all_first' ? 'btn-primary' : ''}" style="padding:0.22rem 0.6rem; font-size:0.78rem;" onclick="setSecondaryRootsGenMode('all_first')">👑 Усі корені — 1-ше покоління</button>
        <button type="button" class="btn ${secondaryRootsGenMode === 'relative_to_main' ? 'btn-primary' : ''}" style="padding:0.22rem 0.6rem; font-size:0.78rem;" onclick="setSecondaryRootsGenMode('relative_to_main')">🔗 Рахувати від основного дерева</button>
      </div>
    ` : ''}
  `;

  // --- 1D Режим ---
  if (!isEditable && treeVisualSubmode === '1d') {
    const rendered1D = new Set();
    const render1DNode = (nodeId, roleLabel = '') => {
      const item = nodeMap.get(nodeId);
      if (!item) return '';
      const isDuplicateRef = rendered1D.has(nodeId);
      rendered1D.add(nodeId);

      const customColor = item.node.visual_style?.color || '';
      const bColor = getBranchColor(item.branchIdx, customColor);
      const gBg = getGenBg(item.depth);
      const fontCls = getNodeFontClass(item.node);

      return `
        <div class="diagram-tree-node tree-1d-gen-bg" style="border-left: 3px solid ${bColor}; background:${gBg};">
          <div class="diagram-node-card ${fontCls}" style="cursor:pointer; border-left: 4px solid ${bColor};" onclick="openCodexNodePreview('${item.node.id}')">
            <div style="display:flex; gap:0.35rem; align-items:center; flex-wrap:wrap;">
              ${treeHighlightGenerations ? `<span class="gen-badge">Покоління ${item.depth + 1}</span>` : ''}
              ${item.year !== null ? `<span class="badge">📅 ${item.year}</span>` : ''}
              ${roleLabel ? `<span class="badge" style="color:${bColor};">${escapeHtml(roleLabel)}</span>` : ''}
              ${isDuplicateRef ? `<span class="badge">🔗 Перетин ліній</span>` : ''}
            </div>
            <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap; margin-top:0.2rem;">
              <strong>${escapeHtml(item.node.title)}</strong>
              ${renderCanonBadge(item.node.canon_status)}
            </div>
            <small class="subtitle">${escapeHtml(getDisciplineTitle(item.node))}</small>
          </div>
          ${!isDuplicateRef ? item.childrenIds.map(cid => {
            const edge = edgesList.find(e => e.fromId === nodeId && e.toId === cid);
            return render1DNode(cid, edge?.roleLabel || '');
          }).join('') : ''}
        </div>
      `;
    };

    canvas.innerHTML = `${toolbarHtml}${rootIds.map(rId => render1DNode(rId)).join('')}`;
    return;
  }

  // --- 2D Граф (За поколіннями або за Шкалою часу з декадами) ---
  const NODE_SLOT_W = 210;
  const LEVEL_H = 148;
  const placedForWidth = new Set();

  const measureSpan = (nodeId) => {
    const item = nodeMap.get(nodeId);
    if (!item || placedForWidth.has(nodeId)) return 0.5;
    placedForWidth.add(nodeId);
    const activeKids = item.childrenIds.filter(cid => !placedForWidth.has(cid));
    if (!activeKids.length) {
      item.leafSpan = 1;
      return 1;
    }
    item.leafSpan = activeKids.reduce((sum, cid) => sum + measureSpan(cid), 0);
    return item.leafSpan;
  };

  let totalLeaves = 0;
  rootIds.forEach(rId => { totalLeaves += measureSpan(rId); });
  totalLeaves = Math.max(1, totalLeaves);

  const positioned = new Set();
  const assignX = (nodeId, leftSlot) => {
    const item = nodeMap.get(nodeId);
    if (!item || positioned.has(nodeId)) return;
    positioned.add(nodeId);

    item.x = Math.round((leftSlot + (item.leafSpan || 1) / 2) * NODE_SLOT_W + 40);
    let cursor = leftSlot;
    item.childrenIds.forEach(cid => {
      if (!positioned.has(cid)) {
        const cItem = nodeMap.get(cid);
        assignX(cid, cursor);
        cursor += (cItem?.leafSpan || 1);
      }
    });
  };

  let rootCursor = 0;
  rootIds.forEach(rId => {
    const rItem = nodeMap.get(rId);
    assignX(rId, rootCursor);
    rootCursor += (rItem?.leafSpan || 1);
  });

  const allItems = [...nodeMap.values()];
  let bandsHtml = '';
  let stageHeight = 400;

  if (treeLayoutAxis === 'timeline_decades') {
    // Режим 4: Шкала часу з декадами на фоні, а покоління — кольором рамки картки
    const years = allItems.map(i => i.year).filter(y => y !== null);
    const minYear = years.length ? Math.min(...years) : 800;
    const maxYear = years.length ? Math.max(...years) : minYear + 30;
    const startDecade = Math.floor(minYear / 10) * 10;
    const endDecade = Math.floor(maxYear / 10) * 10;
    const decadesCount = Math.max(1, Math.floor((endDecade - startDecade) / 10) + 1);

    bandsHtml = Array.from({ length: decadesCount }, (_, idx) => {
      const decStart = startDecade + idx * 10;
      const top = idx * LEVEL_H;
      const bg = treeHighlightGenerations ? DECADE_TINTS[idx % DECADE_TINTS.length] : 'transparent';
      return `
        <div class="tree-2d-gen-band" style="top:${top}px; height:${LEVEL_H}px; background:${bg};">
          <span class="time-band-label">⏳ ${decStart}–${decStart + 9} рр.</span>
        </div>
      `;
    }).join('');

    allItems.forEach(item => {
      if (item.year !== null) {
        const decIdx = Math.floor((item.year - startDecade) / 10);
        const offsetInDecade = ((item.year - startDecade) % 10) / 10;
        item.y = Math.round(decIdx * LEVEL_H + 24 + offsetInDecade * 48);
      } else {
        item.y = Math.min(decadesCount - 1, item.depth) * LEVEL_H + 34;
      }
    });

    stageHeight = decadesCount * LEVEL_H + 40;
  } else {
    // Класичний режим за поколіннями
    const maxDepth = Math.max(0, ...allItems.map(i => i.depth));
    bandsHtml = Array.from({ length: maxDepth + 1 }, (_, d) => {
      const top = d * LEVEL_H;
      const bg = getGenBg(d);
      return `
        <div class="tree-2d-gen-band" style="top:${top}px; height:${LEVEL_H}px; background:${bg};">
          ${treeHighlightGenerations ? `<span class="tree-2d-gen-label">Покоління ${d + 1}</span>` : ''}
        </div>
      `;
    }).join('');

    allItems.forEach(item => {
      item.y = item.depth * LEVEL_H + 28;
    });

    stageHeight = (maxDepth + 1) * LEVEL_H + 40;
  }

  const stageWidth = Math.max(660, totalLeaves * NODE_SLOT_W + 80);

  const svgPathsHtml = edgesList.map(edge => {
    const from = nodeMap.get(edge.fromId);
    const to = nodeMap.get(edge.toId);
    if (!from || !to) return '';
    const x1 = from.x;
    const y1 = from.y + 58;
    const x2 = to.x;
    const y2 = to.y;
    const midY = Math.round((y1 + y2) / 2);
    const color = getBranchColor(edge.branchIdx, to.node.visual_style?.color);
    return `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="2.4" stroke-opacity="0.88" />`;
  }).join('');

  const edgeTagsHtml = edgesList
    .filter(e => e.roleLabel)
    .map(edge => {
      const from = nodeMap.get(edge.fromId);
      const to = nodeMap.get(edge.toId);
      if (!from || !to) return '';
      const midX = Math.round((from.x + to.x) / 2);
      const midY = Math.round((from.y + 58 + to.y) / 2);
      const color = getBranchColor(edge.branchIdx, to.node.visual_style?.color);
      return `<span class="tree-2d-edge-tag" style="left:${midX}px; top:${midY}px; border-color:${color}; color:${color};">${escapeHtml(edge.roleLabel)}</span>`;
    }).join('');

  const nodes2DHtml = allItems.map(item => {
    const customColor = item.node.visual_style?.color || '';
    const branchColor = getBranchColor(item.branchIdx, customColor);
    const genColor = getGenColor(item.depth);
    const fontCls = getNodeFontClass(item.node);

    // У режимі шкали часу рамка картки підсвічує покоління!
    const borderStyle = treeLayoutAxis === 'timeline_decades'
      ? `border: 2.5px solid ${customColor || genColor};`
      : `border-top: 4px solid ${branchColor};`;

    return `
      <div class="tree-2d-node ${fontCls}" style="left:${item.x}px; top:${item.y}px; ${borderStyle}"
        onclick="openCodexNodePreview('${item.node.id}')">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.25rem;">
          <strong style="font-size:0.86rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.node.title)}</strong>
          ${item.year !== null ? `<small class="subtitle" style="font-size:0.7rem;">${item.year}</small>` : (item.node.canon_status === 'official' ? '<span>🏛️</span>' : '')}
        </div>
        <small class="subtitle" style="display:block; font-size:0.73rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:0.15rem;">
          ${treeLayoutAxis === 'timeline_decades' ? `Покоління ${item.depth + 1} · ` : ''}${escapeHtml(getDisciplineTitle(item.node))}
        </small>

        ${isEditable ? `
          <div class="node-2d-actions">
            <button type="button" class="node-mini-action act-del" onclick="event.stopPropagation(); deleteNodeFrom2DEditor('${item.node.id}')" title="Видалити сутність">✕</button>
            <button type="button" class="node-mini-action act-edit" onclick="event.stopPropagation(); openNode2DEditModal('${item.node.id}')" title="Редагувати колір, шрифт і батьків">✏️</button>
            <button type="button" class="node-mini-action act-add" onclick="event.stopPropagation(); openNode2DAddChildModal('${item.node.id}')" title="Додати нащадка">+</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  canvas.innerHTML = `
    ${toolbarHtml}
    <div class="tree-2d-viewport">
      <div class="tree-2d-stage" style="width:${stageWidth}px; height:${stageHeight}px;">
        ${bandsHtml}
        <svg class="tree-2d-svg" viewBox="0 0 ${stageWidth} ${stageHeight}">${svgPathsHtml}</svg>
        ${edgeTagsHtml}
        ${nodes2DHtml}
      </div>
    </div>
  `;
}

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

    ${window.readerReturnContext ? `
      <div style="margin-bottom:0.75rem;">
        <button type="button" class="btn btn-primary" style="font-size:0.84rem;" onclick="returnFromCodexPreview()">
          ← Повернутися до читання
        </button>
      </div>
    ` : ''}

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

window.returnFromCodexPreview = () => {
  const ctx = window.readerReturnContext;
  window.readerReturnContext = null;
  if (!ctx) return closeModal();
  if (ctx.type === 'chapter') {
    readChapter(ctx.bookId, ctx.chapterId);
  } else if (ctx.type === 'article') {
    openArticle(ctx.articleId);
  } else {
    closeModal();
  }
};

window.openEntryDiagram = (entryId) => {
  switchCodexMode('diagrams');
  const rootSelect = document.getElementById('diagramRootSelect');
  if (rootSelect) {
    if (![...rootSelect.options].some(o => o.value === entryId)) {
      selectCodexDiscipline('all');
      populateDiagramControls();
    }
    rootSelect.value = entryId;
  }
  renderCodexDiagram();
};

function renderCodexDiagram() {
  const canvas = document.getElementById('diagramCanvasArea');
  if (!canvas || !state) return;

  const type = document.getElementById('diagramTypeSelect')?.value || 'tree';
  const rootId = document.getElementById('diagramRootSelect')?.value || '';
  const entries = state.codexEntries || [];
  const relations = state.codexRelations || [];

  if (!rootId) {
    canvas.innerHTML = '<p class="subtitle">Оберіть кореневу сутність у списку вище (або натисніть 🌳 на будь-якій картці Кодексу), щоб побудувати діаграму.</p>';
    return;
  }

  const rootEntry = entries.find(e => e.id === rootId);
  if (!rootEntry) return;

  // 1. Дерево / Порівняння родів / Шкала часу
  if (type === 'tree') {
    buildInteractiveTreeHtml({
      canvas,
      rootIds: [rootId, ...compareRootIds],
      isEditable: false
    });
    return;
  }

  // 2. Концентричні кола / Соціальна піраміда
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

  // 3. Хронологія володіння
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

  // 4. Мережа зв'язків 360° (Web)
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

document.getElementById('diagramTypeSelect')?.addEventListener('change', renderCodexDiagram);
document.getElementById('diagramRootSelect')?.addEventListener('change', () => {
  populateDiagramControls();
  renderCodexDiagram();
});

// --- Майстерня: Перемикач 1D Форми / 2D Візуальний редактор дерева ---
let wsCodexEditorMode = '1d';

function switchWorkshopCodexMode(mode) {
  wsCodexEditorMode = mode;
  document.getElementById('wsCodexMode1DBtn')?.classList.toggle('active', mode === '1d');
  document.getElementById('wsCodexMode2DBtn')?.classList.toggle('active', mode === '2d');
  document.getElementById('wsCodex1DFormsWrap')?.classList.toggle('hidden', mode !== '1d');
  document.getElementById('wsCodex2DEditorWrap')?.classList.toggle('hidden', mode !== '2d');

  if (mode === '2d') {
    renderWorkshop2DEditor();
  }
}

document.getElementById('wsCodexMode1DBtn')?.addEventListener('click', () => switchWorkshopCodexMode('1d'));
document.getElementById('wsCodexMode2DBtn')?.addEventListener('click', () => switchWorkshopCodexMode('2d'));
document.getElementById('ws2DRootSelect')?.addEventListener('change', renderWorkshop2DEditor);

function renderWorkshop2DEditor() {
  const select = document.getElementById('ws2DRootSelect');
  const canvas = document.getElementById('ws2DCanvasArea');
  if (!select || !canvas || !state) return;

  const entries = state.codexEntries || [];
  const prev = select.value;
  select.innerHTML = `<option value="">-- Оберіть корінь дерева для редагування --</option>` +
    entries.map(e => `<option value="${e.id}">${e.canon_status === 'official' ? '🏛️ ' : '🪶 '}${escapeHtml(e.title)} (${escapeHtml(getDisciplineTitle(e))})</option>`).join('');
  if (prev && entries.some(e => e.id === prev)) select.value = prev;

  if (!select.value) {
    canvas.innerHTML = '<p class="subtitle">Оберіть кореневу сутність вище, щоб редагувати дерево прямо на схемі.</p>';
    return;
  }

  buildInteractiveTreeHtml({
    canvas,
    rootIds: [select.value],
    isEditable: true
  });
}

// 1. Кнопка "+" на вузлі: додати нащадка прямо з 2D-дерева
window.openNode2DAddChildModal = (parentId) => {
  const parent = (state.codexEntries || []).find(e => e.id === parentId);
  if (!parent) return;

  openModal(`
    <span class="badge">+ Новий нащадок у дереві</span>
    <h2 style="margin-top:0.5rem;">Батько / Предок: ${escapeHtml(parent.title)}</h2>
    <form id="node2DAddChildForm" class="stack-form" style="margin-top:1rem;">
      <input type="text" id="n2dChildTitle" class="input" placeholder="Назва нової сутності (нащадка)" required />
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <input type="text" id="n2dChildRole" class="input" style="flex:1;" placeholder="Роль зв'язку (напр. Син, Учень, Підвид)" />
        <input type="text" id="n2dChildYear" class="input" style="width:140px;" placeholder="Рік / Епоха (напр. 892)" />
      </div>
      <textarea id="n2dChildDesc" class="input textarea" rows="3" placeholder="Короткий опис сутності..." required></textarea>
      <button type="submit" class="btn btn-primary">Створити та приєднати до дерева</button>
    </form>
  `);

  document.getElementById('node2DAddChildForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const created = await TaliesinAPI.createCodexEntry({
        title: document.getElementById('n2dChildTitle').value,
        category: getDisciplineTitle(parent),
        disciplineId: parent.discipline_id || 'history',
        universe: parent.universe || '',
        description: document.getElementById('n2dChildDesc').value,
        isShared: true
      });
      await TaliesinAPI.createCodexRelation({
        sourceId: parent.id,
        targetId: created.id,
        diagramType: 'tree',
        roleLabel: document.getElementById('n2dChildRole').value,
        periodLabel: document.getElementById('n2dChildYear').value,
        sortOrder: (state.codexRelations || []).length + 1
      });
      closeModal();
      await refresh();
      renderWorkshop2DEditor();
    } catch (err) {
      alert(err.message);
    }
  };
};

// 2. Кнопка "✏️" на вузлі: колір, шрифт, додавання/видалення/редагування батьківських зв'язків
window.openNode2DEditModal = (entryId) => {
  const entry = (state.codexEntries || []).find(e => e.id === entryId);
  if (!entry) return;

  const entries = (state.codexEntries || []).filter(e => e.id !== entry.id);
  const incomingRels = (state.codexRelations || []).filter(r => r.target_id === entry.id && r.diagram_type === 'tree');
  const curColor = entry.visual_style?.color || '#c5962c';
  const hasCustomColor = Boolean(entry.visual_style?.color);
  const curFont = entry.visual_style?.font || 'default';

  openModal(`
    <span class="badge">✏️ Налаштування вузла графа</span>
    <h2 style="margin-top:0.5rem;">${escapeHtml(entry.title)}</h2>

    <form id="node2DStyleForm" class="stack-form" style="margin-top:0.8rem;">
      <label class="subtitle">Назва вузла</label>
      <input type="text" id="n2dEditTitle" class="input" required />

      <div style="display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center;">
        <div>
          <label class="subtitle" style="display:block; font-size:0.8rem;">Колір картки</label>
          <div style="display:flex; gap:0.4rem; align-items:center; margin-top:0.25rem;">
            <input type="color" id="n2dEditColor" value="${escapeHtml(curColor)}" style="width:42px; height:34px; border:none; background:none; cursor:pointer;" />
            <label style="font-size:0.82rem; display:flex; align-items:center; gap:0.3rem; cursor:pointer;">
              <input type="checkbox" id="n2dUseCustomColor" ${hasCustomColor ? 'checked' : ''} /> Власний колір
            </label>
          </div>
        </div>

        <div style="flex:1; min-width:170px;">
          <label class="subtitle" style="display:block; font-size:0.8rem;">Шрифт вузла</label>
          <select id="n2dEditFont" class="input" style="margin-top:0.25rem;">
            <option value="default">Стандартний (Sans)</option>
            <option value="serif">Книжковий (Serif)</option>
            <option value="mono">Технічний (Monospace)</option>
            <option value="display">Акцентний (Display)</option>
          </select>
        </div>
      </div>

      <button type="submit" class="btn btn-primary">Зберегти вигляд вузла</button>
    </form>

    <hr style="margin:1.2rem 0; border-color:var(--border);" />
    <h4>🧬 Батьківські прив'язки (${incomingRels.length})</h4>
    <div style="margin:0.5rem 0 0.9rem;">
      ${incomingRels.length
        ? incomingRels.map(r => {
            const p = entries.find(x => x.id === r.source_id);
            return `
              <div class="chapter-item" style="flex-wrap:wrap;">
                <span><strong>${escapeHtml(p?.title || '?')}</strong> → ${escapeHtml(entry.title)} ${r.role_label ? `<small class="subtitle">(${escapeHtml(r.role_label)})</small>` : ''}</span>
                <div style="display:flex; gap:0.3rem;">
                  <button type="button" class="btn" style="padding:0.15rem 0.5rem; font-size:0.78rem;" onclick="editParentLinkRole('${r.id}', '${entry.id}')">✏️</button>
                  <button type="button" class="btn btn-danger" style="padding:0.15rem 0.5rem; font-size:0.78rem;" onclick="removeParentLink('${r.id}', '${entry.id}')">✕</button>
                </div>
              </div>
            `;
          }).join('')
        : '<small class="subtitle">Немає вхідних батьківських зв’язків (кореневий вузол).</small>'}
    </div>

    <form id="node2DAddParentForm" class="stack-form">
      <strong style="font-size:0.86rem;">+ Прив'язати до ще одного батька / предка</strong>
      <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
        <select id="n2dExtraParentSelect" class="input" style="flex:1;">
          <option value="">-- Оберіть іншого батька --</option>
          ${entries.map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join('')}
        </select>
        <input type="text" id="n2dExtraParentRole" class="input" style="width:150px;" placeholder="Роль (напр. Мати)" />
      </div>
      <button type="submit" class="btn">Додати прив'язку</button>
    </form>
  `);

  document.getElementById('n2dEditTitle').value = entry.title || '';
  document.getElementById('n2dEditFont').value = curFont;

  document.getElementById('node2DStyleForm').onsubmit = async (e) => {
    e.preventDefault();
    const useColor = document.getElementById('n2dUseCustomColor').checked;
    const visualStyle = {
      color: useColor ? document.getElementById('n2dEditColor').value : '',
      font: document.getElementById('n2dEditFont').value
    };
    try {
      await TaliesinAPI.updateCodexEntry(entry.id, {
        title: document.getElementById('n2dEditTitle').value,
        category: entry.category,
        disciplineId: entry.discipline_id,
        parentEntryId: entry.parent_entry_id,
        attributes: entry.attributes,
        universe: entry.universe,
        description: entry.description,
        isShared: entry.is_shared,
        visualStyle
      });
      closeModal();
      await refresh();
      renderWorkshop2DEditor();
    } catch (err) {
      alert(err.message);
    }
  };

  document.getElementById('node2DAddParentForm').onsubmit = async (e) => {
    e.preventDefault();
    const parentId = document.getElementById('n2dExtraParentSelect').value;
    if (!parentId) return;
    try {
      await TaliesinAPI.createCodexRelation({
        sourceId: parentId,
        targetId: entry.id,
        diagramType: 'tree',
        roleLabel: document.getElementById('n2dExtraParentRole').value,
        sortOrder: (state.codexRelations || []).length + 1
      });
      await refresh();
      openNode2DEditModal(entry.id);
      renderWorkshop2DEditor();
    } catch (err) {
      alert(err.message);
    }
  };
};

window.editParentLinkRole = async (relId, entryId) => {
  const rel = (state.codexRelations || []).find(r => r.id === relId);
  if (!rel) return;
  const nextRole = prompt('Нова роль зв’язку:', rel.role_label || '');
  if (nextRole === null) return;
  try {
    await TaliesinAPI.deleteCodexRelation(relId);
    await TaliesinAPI.createCodexRelation({
      sourceId: rel.source_id,
      targetId: rel.target_id,
      diagramType: rel.diagram_type,
      roleLabel: nextRole,
      tierLevel: rel.tier_level,
      periodLabel: rel.period_label,
      sortOrder: rel.sort_order
    });
    await refresh();
    openNode2DEditModal(entryId);
    renderWorkshop2DEditor();
  } catch (err) {
    alert(err.message);
  }
};

window.removeParentLink = async (relId, entryId) => {
  if (!confirm('Видалити цю батьківську прив’язку?')) return;
  try {
    await TaliesinAPI.deleteCodexRelation(relId);
    await refresh();
    openNode2DEditModal(entryId);
    renderWorkshop2DEditor();
  } catch (err) {
    alert(err.message);
  }
};

// 3. Кнопка "✕" на вузлі: видалення сутності з дерева/Кодексу
window.deleteNodeFrom2DEditor = async (entryId) => {
  const entry = (state.codexEntries || []).find(e => e.id === entryId);
  if (!entry) return;
  if (!confirm(`Видалити сутність «${entry.title}» та всі її зв'язки з Кодексу назавжди?`)) return;
  try {
    await TaliesinAPI.deleteCodexEntryById(entryId);
    await refresh();
    renderWorkshop2DEditor();
  } catch (err) {
    alert(err.message);
  }
};
