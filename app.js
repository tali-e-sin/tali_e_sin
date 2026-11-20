let state = null;

function getCurrentUser() {
  if (!state || !state.currentUserId) return null;
  return state.users.find(u => u.id === state.currentUserId) || null;
}

// --- Тема День / Вогнище ---
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('taliesin_theme', theme);
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (theme === 'night') {
    icon.textContent = '🔥';
    label.textContent = 'Вогнище';
  } else {
    icon.textContent = '☀️';
    label.textContent = 'День';
  }
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'night' ? 'day' : 'night');
});

// --- Навігація ---
function navigateTo(target) {
  document.querySelectorAll('.nav-link').forEach(n => n.classList.toggle('active', n.dataset.nav === target));
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.toggle('hidden', sec.id !== `view-${target}`));
  if (target === 'write') populateBookSelect();
  if (target === 'profile') renderProfile();
  if (target === 'admin') renderAdmin();
}

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(btn.dataset.nav);
  });
});

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
}

document.getElementById('closeModal').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

// --- Авторизація та шапка ---
function renderHeader() {
  const user = getCurrentUser();
  document.getElementById('userCoins').textContent = user ? user.coins : 0;
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !user || user.role !== 'admin'));
  document.querySelectorAll('.auth-only').forEach(el => el.classList.toggle('hidden', !user));

  const authArea = document.getElementById('authArea');
  if (user) {
    authArea.innerHTML = `
      <button class="badge" id="headerProfileBadge" style="border:none; cursor:pointer;" title="Відкрити особистий кабінет">
        ${user.role === 'admin' ? '👑 Адмін' : '🪶 Автор'}: ${user.name}
      </button>
      <button class="btn" id="logoutBtn">Вийти</button>
    `;
    document.getElementById('headerProfileBadge').onclick = () => navigateTo('profile');
    document.getElementById('logoutBtn').onclick = async () => {
      await TaliesinAPI.logout();
      await refresh();
      navigateTo('articles');
    };
  } else {
    authArea.innerHTML = `<button class="btn btn-primary" id="openAuthBtn">Увійти / Реєстрація</button>`;
    document.getElementById('openAuthBtn').onclick = openAuthModal;
  }
}

function openAuthModal() {
  openModal(`
    <h2>Вхід до tali_e_sin</h2>
    <p class="subtitle">Увійдіть або створіть новий акаунт читача чи адміністратора</p>
    <form id="loginForm" class="stack-form" style="margin-top:1rem;">
      <input type="text" id="authName" class="input" placeholder="Ваше ім'я барда" required />
      <input type="email" id="authEmail" class="input" placeholder="Email" required />
      <select id="authRole" class="input">
        <option value="user">Читач / Автор</option>
        <option value="admin">Адміністратор</option>
      </select>
      <button type="submit" class="btn btn-primary">Продовжити</button>
    </form>
    <hr style="margin:1.2rem 0; border-color:var(--border);" />
    <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
      <button class="btn" id="demoUserBtn">Демо: Читач</button>
      <button class="btn" id="demoAdminBtn">Демо: Адмін</button>
    </div>
  `);

  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    await TaliesinAPI.login(
      document.getElementById('authEmail').value,
      document.getElementById('authName').value,
      document.getElementById('authRole').value
    );
    closeModal();
    await refresh();
  };

  document.getElementById('demoUserBtn').onclick = async () => {
    await TaliesinAPI.switchDemoRole('user');
    closeModal();
    await refresh();
  };
  document.getElementById('demoAdminBtn').onclick = async () => {
    await TaliesinAPI.switchDemoRole('admin');
    closeModal();
    await refresh();
  };
}

// --- Симулятор реклами за монети ---
document.getElementById('coinsBtn').addEventListener('click', () => {
  const user = getCurrentUser();
  if (!user) return openAuthModal();

  let seconds = 5;
  openModal(`
    <h2>Скарбниця Авену</h2>
    <p>Перегляньте коротке послання меценатів гільдії, щоб отримати <strong>+15 🪙</strong>.</p>
    <div style="padding:1.5rem; background:var(--bg-subtle); border-radius:12px; text-align:center; margin:1rem 0;">
      <p style="font-size:1.1rem; margin:0 0 0.5rem;">📜 «Видавництво Срібний Дуб — збірки валлійських балад»</p>
      <strong id="adTimer" style="color:var(--accent); font-size:1.3rem;">Залишилось: ${seconds} с</strong>
    </div>
    <button id="claimCoinsBtn" class="btn btn-primary" disabled>Забрати +15 🪙</button>
  `);

  const timer = setInterval(() => {
    seconds -= 1;
    const timerEl = document.getElementById('adTimer');
    const claimBtn = document.getElementById('claimCoinsBtn');
    if (!timerEl) return clearInterval(timer);

    if (seconds > 0) {
      timerEl.textContent = `Залишилось: ${seconds} с`;
    } else {
      clearInterval(timer);
      timerEl.textContent = 'Перегляд завершено!';
      claimBtn.disabled = false;
      claimBtn.onclick = async () => {
        await TaliesinAPI.addCoins(15);
        closeModal();
        await refresh();
      };
    }
  }, 1000);
});

// --- Статті ---
function renderArticles() {
  const query = document.getElementById('articleSearch').value.toLowerCase();
  const cat = document.getElementById('categoryFilter').value;
  const list = document.getElementById('articlesList');

  const filtered = state.articles.filter(a =>
    (cat === 'all' || a.category === cat) &&
    (a.title.toLowerCase().includes(query) || a.content.toLowerCase().includes(query))
  );

  list.innerHTML = filtered.map(art => `
    <article class="card">
      <div>
        <div class="meta-row" style="margin-bottom:0.6rem;">
          <span class="badge">${art.category}</span>
          <span>${art.date}</span>
        </div>
        <h3>${art.title}</h3>
        <p style="color:var(--text-muted);">${art.content.slice(0, 140)}...</p>
      </div>
      <div>
        <div class="meta-row" style="margin-bottom:0.8rem;">
          <span>✍️ ${art.author}</span>
          <span>❤️ ${art.likes} · 💬 ${art.comments.length}</span>
        </div>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-primary" onclick="openArticle('${art.id}')">Читати</button>
          <button class="btn" onclick="likeArticle('${art.id}')">❤️ Вподобати</button>
        </div>
      </div>
    </article>
  `).join('');
}

window.openArticle = (id) => {
  const art = state.articles.find(a => a.id === id);
  if (!art) return;

  openModal(`
    <span class="badge">${art.category}</span>
    <h2 style="margin-top:0.5rem;">${art.title}</h2>
    <p class="subtitle" style="margin-bottom:1.2rem;">Автор: ${art.author} · ${art.date}</p>
    <div class="reading-text">${art.content}</div>
    <hr style="margin:1.5rem 0; border-color:var(--border);" />
    <h3>Коментарі (${art.comments.length})</h3>
    <div>
      ${art.comments.map(c => `<div class="comment-box"><strong>${c.author}:</strong> ${c.text}</div>`).join('') || '<p class="subtitle">Поки немає коментарів.</p>'}
    </div>
    <form id="commentForm" class="stack-form" style="margin-top:1rem;">
      <input type="text" id="commentInput" class="input" placeholder="Написати коментар..." required />
      <button type="submit" class="btn btn-primary">Надіслати</button>
    </form>
  `);

  document.getElementById('commentForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await TaliesinAPI.addComment(id, document.getElementById('commentInput').value);
      await refresh();
      openArticle(id);
    } catch (err) {
      alert(err.message);
    }
  };
};

window.likeArticle = async (id) => {
  await TaliesinAPI.toggleLike(id);
  await refresh();
};

document.getElementById('articleSearch').addEventListener('input', renderArticles);
document.getElementById('categoryFilter').addEventListener('change', renderArticles);

// --- Книги та платні глави ---
function renderBooks() {
  const user = getCurrentUser();
  const unlocked = user ? user.unlockedChapters : [];
  const list = document.getElementById('booksList');

  list.innerHTML = state.books.map(book => `
    <div class="card">
      <div>
        <span class="badge">Книга</span>
        <h3 style="margin-top:0.5rem;">${book.title}</h3>
        <p class="subtitle">Автор: ${book.author}</p>
        <p>${book.description}</p>
      </div>
      <div>
        <strong>Глави:</strong>
        ${(book.chapters || []).map(ch => {
          const isOpen = ch.price === 0 || unlocked.includes(ch.id);
          return `
            <div class="chapter-item">
              <span>${isOpen ? '📖' : '🔒'} ${ch.title}</span>
              <button class="btn ${isOpen ? '' : 'btn-primary'}" onclick="readChapter('${book.id}', '${ch.id}')">
                ${isOpen ? 'Читати' : `${ch.price} 🪙`}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

window.readChapter = async (bookId, chapterId) => {
  const book = state.books.find(b => b.id === bookId);
  const chap = book?.chapters.find(c => c.id === chapterId);
  if (!chap) return;

  try {
    if (chap.price > 0) {
      await TaliesinAPI.unlockChapter(chap.id, chap.price, chap.title, book.author_id);
      await refresh();
    }
    openModal(`
      <span class="badge">${book.title}</span>
      <h2 style="margin-top:0.5rem;">${chap.title}</h2>
      <div class="reading-text" style="margin-top:1rem;">${chap.content}</div>
    `);
  } catch (err) {
    alert(err.message);
  }
};

// --- Особистий кабінет (Профіль) ---
function renderProfile() {
  const user = getCurrentUser();
  if (!user) return navigateTo('articles');

  const myArticles = state.articles.filter(a => a.author === user.name);
  const myBooks = state.books.filter(b => b.author_id === user.id || b.author === user.name);

  // Збираємо всі розблоковані користувачем глави
  const unlockedItems = [];
  state.books.forEach(book => {
    (book.chapters || []).forEach(ch => {
      if (user.unlockedChapters.includes(ch.id)) {
        unlockedItems.push({ bookId: book.id, bookTitle: book.title, chapter: ch });
      }
    });
  });

  document.getElementById('profileSummary').innerHTML = `
    <div class="stat-box"><strong>${user.coins} 🪙</strong>Поточний баланс</div>
    <div class="stat-box"><strong>${unlockedItems.length}</strong>Куплених / відкритих глав</div>
    <div class="stat-box"><strong>${myArticles.length + myBooks.length}</strong>Створених творів</div>
  `;

  document.getElementById('profileNewName').value = user.name;

  const history = user.coinHistory || [];
  document.getElementById('profileHistoryList').innerHTML = history.length
    ? history.map(tx => `
        <div class="chapter-item">
          <div>
            <div style="font-size:0.9rem; font-weight:600;">${tx.label}</div>
            <small class="subtitle">${tx.date}</small>
          </div>
          <strong style="color:${tx.delta >= 0 ? 'var(--accent)' : 'var(--danger)'};">
            ${tx.delta >= 0 ? `+${tx.delta}` : tx.delta} 🪙
          </strong>
        </div>
      `).join('')
    : '<p class="subtitle">Історія операцій поки порожня.</p>';

  document.getElementById('profileChaptersList').innerHTML = unlockedItems.length
    ? unlockedItems.map(item => `
        <div class="chapter-item">
          <div>
            <div style="font-size:0.9rem; font-weight:600;">${item.chapter.title}</div>
            <small class="subtitle">${item.bookTitle}</small>
          </div>
          <button class="btn" onclick="readChapter('${item.bookId}', '${item.chapter.id}')">Читати</button>
        </div>
      `).join('')
    : '<p class="subtitle">Ви ще не розблокували жодної платної глави.</p>';

  const worksHtml = [
    ...myBooks.map(b => `<div class="chapter-item"><span>📚 ${b.title}</span><span class="badge">${(b.chapters || []).length} гл.</span></div>`),
    ...myArticles.map(a => `<div class="chapter-item"><span>📜 ${a.title}</span><button class="btn" onclick="openArticle('${a.id}')">Відкрити</button></div>`)
  ].join('');

  document.getElementById('profileWorksList').innerHTML = worksHtml || '<p class="subtitle">Ви ще не опублікували власних творів.</p>';
}

document.getElementById('profileNameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await TaliesinAPI.updateProfileName(document.getElementById('profileNewName').value);
    await refresh();
    renderProfile();
    alert('Ім’я барда успішно оновлено!');
  } catch (err) {
    alert(err.message);
  }
});

// --- Створення статей і глав ---
document.querySelectorAll('[data-editor]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-editor]').forEach(t => t.classList.toggle('active', t === tab));
    const isArticle = tab.dataset.editor === 'article';
    document.getElementById('articleForm').classList.toggle('hidden', !isArticle);
    document.getElementById('chapterForm').classList.toggle('hidden', isArticle);
  });
});

function populateBookSelect() {
  const select = document.getElementById('bookSelect');
  select.innerHTML = `<option value="">-- Створити нову книгу --</option>` +
    state.books.map(b => `<option value="${b.id}">${b.title}</option>`).join('');
}

document.getElementById('articleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await TaliesinAPI.createArticle({
      title: document.getElementById('artTitle').value,
      category: document.getElementById('artCategory').value,
      content: document.getElementById('artContent').value
    });
    e.target.reset();
    await refresh();
    navigateTo('articles');
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('chapterForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await TaliesinAPI.addChapter({
      bookId: document.getElementById('bookSelect').value,
      newBookTitle: document.getElementById('newBookTitle').value,
      newBookDesc: document.getElementById('newBookDesc').value,
      chapTitle: document.getElementById('chapTitle').value,
      price: document.getElementById('chapPrice').value,
      content: document.getElementById('chapContent').value
    });
    e.target.reset();
    await refresh();
    navigateTo('books');
  } catch (err) {
    alert(err.message);
  }
});

// --- Адмін-панель ---
function renderAdmin() {
  const stats = document.getElementById('adminStats');
  const box = document.getElementById('adminContent');
  stats.innerHTML = `
    <div class="stat-box"><strong>${state.users.length}</strong>Користувачів</div>
    <div class="stat-box"><strong>${state.articles.length}</strong>Статей</div>
    <div class="stat-box"><strong>${state.books.length}</strong>Книг</div>
  `;

  box.innerHTML = `
    <h3>Модерація статей</h3>
    ${state.articles.map(a => `
      <div class="chapter-item">
        <span><strong>${a.title}</strong> (${a.author})</span>
        <button class="btn btn-danger" onclick="adminDeleteArticle('${a.id}')">Видалити</button>
      </div>
    `).join('')}
  `;
}

window.adminDeleteArticle = async (id) => {
  await TaliesinAPI.deleteArticle(id);
  await refresh();
  renderAdmin();
};

// --- Ініціалізація ---
async function refresh() {
  state = await TaliesinAPI.getState();
  renderHeader();
  renderArticles();
  renderBooks();
  if (!document.getElementById('view-profile').classList.contains('hidden')) {
    renderProfile();
  }
}

applyTheme(document.documentElement.getAttribute('data-theme') || 'day');
refresh();
