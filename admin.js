// --- Ізольований модуль Хранителя (завантажується лише для role === 'admin') ---

window.renderSchemaArchitect = function () {
  const user = getCurrentUser();
  const managerEl = document.getElementById('schemaDisciplinesManager');
  const queueEl = document.getElementById('schemaCanonQueue');
  if (!managerEl || !user || user.role !== 'admin') return;

  const disciplines = state.codexDisciplines || [];

  managerEl.innerHTML = `
    <form id="newDisciplineForm" class="stack-form" style="padding:1rem; background:var(--bg-subtle); border-radius:12px; margin-bottom:1.2rem;">
      <strong>+ Додати нову науку / підгалузь</strong>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <input type="text" id="newDiscId" class="input" placeholder="Ключ (латиницею, напр. linguistics)" required />
        <input type="text" id="newDiscTitle" class="input" placeholder="Назва (напр. Лінгвістика та Руни)" style="flex:1;" required />
        <select id="newDiscParent" class="input">
          <option value="">-- Коренева галузь --</option>
          ${disciplines.map(d => `<option value="${escapeHtml(d.id)}">Підгалузь для: ${escapeHtml(d.title)}</option>`).join('')}
        </select>
      </div>
      <input type="text" id="newDiscDepends" class="input" placeholder="Спирається на науки (ключі через кому, напр. history, philosophy)" />
      <button type="submit" class="btn btn-primary" style="align-self:flex-start;">Створити науку</button>
    </form>

    ${disciplines.map(d => {
      const fields = Array.isArray(d.schema_fields) ? d.schema_fields : [];
      return `
        <div class="chapter-item" style="flex-direction:column; align-items:stretch; gap:0.65rem; padding:0.95rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <div>
              <strong>${escapeHtml(d.title)}</strong> <small class="subtitle">[${escapeHtml(d.id)}]</small>
              ${(d.depends_on || []).length ? `<div class="subtitle" style="font-size:0.82rem;">Спирається на: ${escapeHtml(d.depends_on.join(', '))}</div>` : ''}
            </div>
            <button type="button" class="btn" style="font-size:0.82rem;" onclick="openAddDisciplineFieldModal('${escapeHtml(d.id)}')">+ Додати параметр поля</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:0.4rem;">
            ${fields.length
              ? fields.map((f, idx) => `
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; padding:0.4rem 0.65rem; border-radius:8px; background:var(--bg-surface); border:1px solid var(--border); ${f.hidden ? 'opacity:0.55;' : ''}">
                    <div>
                      <strong>${escapeHtml(f.label)}</strong>
                      <small class="subtitle">[${escapeHtml(f.key)} · ${escapeHtml(f.type || 'text')}]</small>
                      ${f.hidden ? `<span class="badge" style="margin-left:0.35rem;">Приховано з форми</span>` : ''}
                    </div>
                    <div style="display:flex; gap:0.25rem; align-items:center;">
                      <button type="button" class="btn" style="padding:0.15rem 0.45rem; font-size:0.78rem;" ${idx === 0 ? 'disabled' : ''} onclick="moveDisciplineField('${escapeHtml(d.id)}', ${idx}, -1)" title="Вгору">▲</button>
                      <button type="button" class="btn" style="padding:0.15rem 0.45rem; font-size:0.78rem;" ${idx === fields.length - 1 ? 'disabled' : ''} onclick="moveDisciplineField('${escapeHtml(d.id)}', ${idx}, 1)" title="Вниз">▼</button>
                      <button type="button" class="btn" style="padding:0.15rem 0.5rem; font-size:0.78rem;" onclick="renameDisciplineField('${escapeHtml(d.id)}', ${idx})" title="Перейменувати підпис">✏️</button>
                      <button type="button" class="btn" style="padding:0.15rem 0.5rem; font-size:0.78rem;" onclick="toggleDisciplineFieldVisibility('${escapeHtml(d.id)}', ${idx})" title="${f.hidden ? 'Повернути у форму' : 'Приховати з форми (дані збережуться)'}">
                        ${f.hidden ? '👁️ Показати' : '🙈 Приховати'}
                      </button>
                    </div>
                  </div>
                `).join('')
              : '<small class="subtitle">Без додаткових параметрів</small>'}
          </div>
        </div>
      `;
    }).join('')}
  `;

  document.getElementById('newDisciplineForm').onsubmit = async (e) => {
    e.preventDefault();
    const deps = document.getElementById('newDiscDepends').value
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    try {
      await TaliesinAPI.saveCodexDiscipline({
        id: document.getElementById('newDiscId').value,
        title: document.getElementById('newDiscTitle').value,
        parentId: document.getElementById('newDiscParent').value || null,
        dependsOn: deps
      });
      await refresh();
      renderSchemaArchitect();
      initWorkshopCodex();
    } catch (err) {
      alert(err.message);
    }
  };

  if (queueEl) {
    const pending = (state.codexEntries || []).filter(e => e.canon_status === 'pending');
    queueEl.innerHTML = pending.length
      ? pending.map(e => `
          <div class="chapter-item" style="flex-wrap:wrap;">
            <div>
              <strong>${escapeHtml(e.title)}</strong> <span class="badge">${escapeHtml(getDisciplineTitle(e))}</span>
              <div class="subtitle" style="font-size:0.84rem;">Автор: ${escapeHtml(e.author_name || '')} · ${escapeHtml(e.description.slice(0, 120))}...</div>
            </div>
            <div style="display:flex; gap:0.4rem;">
              <button type="button" class="btn btn-primary" onclick="approveEntryCanon('${e.id}')">✓ Затвердити Канон</button>
              <button type="button" class="btn" onclick="TaliesinAPI.setCodexCanonStatus('${e.id}', 'community').then(() => { refresh().then(renderSchemaArchitect); })">Відхилити</button>
            </div>
          </div>
        `).join('')
      : '<p class="subtitle">Заявок на узгодження в Канон зараз немає.</p>';
  }
};

async function persistDisciplineFields(disc, nextFields) {
  await TaliesinAPI.saveCodexDiscipline({
    id: disc.id,
    title: disc.title,
    parentId: disc.parent_id,
    dependsOn: disc.depends_on || [],
    defaultDiagram: disc.default_diagram,
    schemaFields: nextFields,
    sortOrder: disc.sort_order
  });
  await refresh();
  renderSchemaArchitect();
  if (typeof initWorkshopCodex === 'function') initWorkshopCodex();
}

window.moveDisciplineField = async (discId, index, delta) => {
  const disc = getDisciplineById(discId);
  if (!disc) return;
  const fields = [...(disc.schema_fields || [])];
  const targetIdx = index + delta;
  if (targetIdx < 0 || targetIdx >= fields.length) return;

  [fields[index], fields[targetIdx]] = [fields[targetIdx], fields[index]];
  try {
    await persistDisciplineFields(disc, fields);
  } catch (err) {
    alert(err.message);
  }
};

window.renameDisciplineField = async (discId, index) => {
  const disc = getDisciplineById(discId);
  const fields = [...(disc?.schema_fields || [])];
  const field = fields[index];
  if (!field) return;

  const nextLabel = prompt(`Нова назва для параметра [${field.key}]:`, field.label);
  if (nextLabel === null || !nextLabel.trim()) return;

  fields[index] = { ...field, label: nextLabel.trim() };
  try {
    await persistDisciplineFields(disc, fields);
  } catch (err) {
    alert(err.message);
  }
};

window.toggleDisciplineFieldVisibility = async (discId, index) => {
  const disc = getDisciplineById(discId);
  const fields = [...(disc?.schema_fields || [])];
  const field = fields[index];
  if (!field) return;

  fields[index] = { ...field, hidden: !field.hidden };
  try {
    await persistDisciplineFields(disc, fields);
  } catch (err) {
    alert(err.message);
  }
};

window.openAddDisciplineFieldModal = (discId) => {
  const disc = getDisciplineById(discId);
  if (!disc) return;

  openModal(`
    <span class="badge">⚙️ Конструктор параметрів</span>
    <h2 style="margin-top:0.5rem;">Нове поле для: ${escapeHtml(disc.title)}</h2>
    <p class="subtitle">Усі попередні записи цієї науки збережуть свої дані без змін.</p>
    <form id="addDiscFieldForm" class="stack-form" style="margin-top:1rem;">
      <input type="text" id="dfKey" class="input" placeholder="Системний ключ (латиницею, напр. atomic_mass)" required />
      <input type="text" id="dfLabel" class="input" placeholder="Назва поля для авторів (напр. Атомна маса / Щільність)" required />
      <select id="dfType" class="input">
        <option value="text">Короткий рядок (text)</option>
        <option value="textarea">Розгорнутий текст (textarea)</option>
      </select>
      <button type="submit" class="btn btn-primary">Додати параметр</button>
    </form>
  `);

  document.getElementById('addDiscFieldForm').onsubmit = async (e) => {
    e.preventDefault();
    const cleanKey = document.getElementById('dfKey').value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const label = document.getElementById('dfLabel').value.trim();
    const type = document.getElementById('dfType').value;
    if (!cleanKey || !label) return;

    const existing = Array.isArray(disc.schema_fields) ? disc.schema_fields : [];
    const nextFields = deduplicateList([...existing, { key: cleanKey, label, type, hidden: false }], f => f.key);

    try {
      closeModal();
      await persistDisciplineFields(disc, nextFields);
    } catch (err) {
      alert(err.message);
    }
  };
};

window.renderAdmin = async function () {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') return navigateTo('articles');

  const logs = await TaliesinAPI.getSecurityLogs();
  const totalCoins = state.users.reduce((sum, u) => sum + (u.coins || 0), 0);
  const totalComments = state.articles.reduce((sum, a) => sum + (a.comments || []).length, 0);

  document.getElementById('adminStats').innerHTML = `
    <div class="stat-box"><strong>${state.users.length}</strong>Користувачів</div>
    <div class="stat-box"><strong>${totalCoins} 🪙</strong>Монет в обігу</div>
    <div class="stat-box"><strong>${state.articles.length}</strong>Статей (${totalComments} ком.)</div>
    <div class="stat-box"><strong>${state.books.length}</strong>Книг у бібліотеці</div>
  `;

  const logsHtml = logs.length
    ? logs.map(l => `
        <div class="chapter-item" style="border-left: 3px solid var(--danger); padding-left: 0.7rem;">
          <div>
            <strong>🚨 ${l.action}</strong> — <span class="subtitle">${l.user_email}</span>
            <div style="font-size:0.85rem;">${l.details}</div>
          </div>
          <small class="subtitle">${new Date(l.created_at).toLocaleString('uk-UA')}</small>
        </div>
      `).join('')
    : '<p class="subtitle">Підозрілої активності не зафіксовано.</p>';

  const usersHtml = state.users.map(u => {
    const nextRole = u.role === 'admin' ? 'user' : 'admin';
    return `
      <div class="chapter-item" style="flex-wrap:wrap;">
        <div>
          <strong>${u.name}</strong> <span class="badge">${u.role === 'admin' ? '👑 Адмін' : '🪶 Бард'}</span>
          <div class="subtitle" style="font-size:0.82rem;">${u.email} · Баланс: <strong>${u.coins} 🪙</strong></div>
        </div>
        <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
          <button class="btn" onclick="adminCoins('${u.id}', 50)">+50 🪙</button>
          <button class="btn" onclick="adminCoins('${u.id}', -20)">-20 🪙</button>
          <button class="btn" onclick="adminCustomCoins('${u.id}', '${u.name}')">± Інша сума</button>
          ${u.id !== currentUser.id
            ? `<button class="btn" onclick="adminRole('${u.id}', '${nextRole}')">${nextRole === 'admin' ? 'Зробити Адміном' : 'Зняти Адміна'}</button>`
            : ''}
        </div>
      </div>
    `;
  }).join('');

  const booksHtml = state.books.length
    ? state.books.map(b => `
        <div style="border:1px solid var(--border); border-radius:12px; padding:0.9rem; margin-top:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <div><strong>📚 ${b.title}</strong> <span class="subtitle">(${b.author})</span></div>
            <button class="btn btn-danger" onclick="adminDeleteBook('${b.id}')">Видалити книгу</button>
          </div>
          <div style="margin-top:0.5rem;">
            ${(b.chapters || []).map(ch => `
              <div class="chapter-item">
                <span>${ch.title} <small class="subtitle">(${ch.price} 🪙)</small></span>
                <button class="btn btn-danger" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="adminDeleteChapter('${b.id}', '${ch.id}')">Видалити главу</button>
              </div>
            `).join('') || '<small class="subtitle">У книзі немає глав</small>'}
          </div>
        </div>
      `).join('')
    : '<p class="subtitle">Книг поки немає.</p>';

  const articlesHtml = state.articles.length
    ? state.articles.map(a => `
        <div style="border:1px solid var(--border); border-radius:12px; padding:0.9rem; margin-top:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <span><strong>📜 ${a.title}</strong> <span class="subtitle">(${a.author})</span></span>
            <button class="btn btn-danger" onclick="adminDeleteArticle('${a.id}')">Видалити статтю</button>
          </div>
          ${(a.comments || []).length
            ? `<div style="margin-top:0.5rem;">
                ${a.comments.map(c => `
                  <div class="chapter-item">
                    <span style="font-size:0.88rem;">💬 <strong>${c.author}:</strong> ${c.text}</span>
                    <button class="btn btn-danger" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="adminDeleteComment('${a.id}', '${c.id}')">Видалити</button>
                  </div>
                `).join('')}
              </div>`
            : ''}
        </div>
      `).join('')
    : '<p class="subtitle">Статей поки немає.</p>';

  document.getElementById('adminContent').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
      <h3>🛡️ Журнал безпеки (${logs.length})</h3>
      ${logs.length ? `<button class="btn" onclick="adminClearLogs()">Очистити журнал</button>` : ''}
    </div>
    <div style="margin-bottom:1.5rem;">${logsHtml}</div>
    <hr style="margin:1.6rem 0; border-color:var(--border);" />
    <h3>👥 Користувачі та скарбниця</h3>
    ${usersHtml}
    <hr style="margin:1.6rem 0; border-color:var(--border);" />
    <h3>📚 Модерація книг та глав</h3>
    ${booksHtml}
    <hr style="margin:1.6rem 0; border-color:var(--border);" />
    <h3>📜 Модерація статей та коментарів</h3>
    ${articlesHtml}
  `;
};

window.adminClearLogs = async () => { await TaliesinAPI.clearSecurityLogs(); await renderAdmin(); };
window.adminCoins = async (userId, delta) => { try { await TaliesinAPI.adminAdjustUserCoins(userId, delta); await refresh(); } catch (err) { alert(err.message); } };
window.adminCustomCoins = async (userId, userName) => { const input = prompt(`Введіть суму монет для користувача «${userName}» (наприклад, 100 або -30):`); if (input !== null) await window.adminCoins(userId, Number(input)); };
window.adminRole = async (userId, nextRole) => { try { await TaliesinAPI.adminToggleUserRole(userId, nextRole); await refresh(); } catch (err) { alert(err.message); } };
window.adminDeleteBook = async (bookId) => { if (confirm('Видалити цю книгу разом з усіма її главами?')) { await TaliesinAPI.adminDeleteBook(bookId); await refresh(); } };
window.adminDeleteChapter = async (bookId, chapterId) => { if (confirm('Видалити цю главу?')) { await TaliesinAPI.adminDeleteChapter(bookId, chapterId); await refresh(); } };
window.adminDeleteComment = async (articleId, commentId) => { await TaliesinAPI.adminDeleteComment(articleId, commentId); await refresh(); };
window.adminDeleteArticle = async (id) => { if (confirm('Видалити цю статтю?')) { await TaliesinAPI.deleteArticle(id); await refresh(); } };
