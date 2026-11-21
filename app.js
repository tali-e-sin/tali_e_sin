let state = null;

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

  // Відновлюємо збережене місце прокрутки, якщо воно є
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

function getCurrentUser() {
  if (!state || !state.currentUserId) return null;
  return state.users.find(u => u.id === state.currentUserId) || null;
}

function canEditArticle(art, user) {
  if (!user || !art) return false;
  return user.role === 'admin' || art.author_id === user.id || art.author === user.name;
}

function canEditBook(book, user) {
  if (!user || !book) return false;
  return user.role === 'admin' || book.author_id === user.id || book.author === user.name;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function formatLiteraryText(raw) {
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
      return `<blockquote>${formatInlineMarkdown(quoteText)}</blockquote>`;
    }
    const lines = block.split('\n').map(line => formatInlineMarkdown(line.trim())).join('<br>');
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

      // Якщо перший рядок у .md починається з "# Заголовок", витягуємо його
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
  const user = getCurrentUser();
  if (target === 'admin' && (!user || user.role !== 'admin')) {
    target = 'articles';
  }
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
  if (state) {
    renderArticles();
    renderBooks();
  }
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
    <p class="subtitle">Захищена авторизація барда та читача</p>
    <div class="tabs" style="margin-top:1rem;">
      <button type="button" class="tab-btn active" id="tabLogin">Увійти</button>
      <button type="button" class="tab-btn" id="tabRegister">Реєстрація</button>
    </div>

    <form id="loginForm" class="stack-form">
      <input type="email" id="loginEmail" class="input" placeholder="Email" required />
      <input type="password" id="loginPassword" class="input" placeholder="Пароль" required />
      <button type="submit" class="btn btn-primary">Увійти в келію</button>
    </form>

    <form id="registerForm" class="stack-form hidden">
      <input type="text" id="regName" class="input" placeholder="Ваше ім'я барда" required />
      <input type="email" id="regEmail" class="input" placeholder="Email" required />
      <input type="password" id="regPassword" class="input" placeholder="Пароль (мінімум 6 символів)" minlength="6" required />
      <button type="submit" class="btn btn-primary">Створити акаунт (+30 🪙)</button>
    </form>
  `);

  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  tabLogin.onclick = () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  };

  tabRegister.onclick = () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  };

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await TaliesinAPI.login({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
      });
      closeModal();
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await TaliesinAPI.register({
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value
      });
      closeModal();
      await refresh();
    } catch (err) {
      alert(err.message);
    }
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

// --- Статті та їх редагування ---
function renderArticles() {
  const user = getCurrentUser();
  const query = document.getElementById('articleSearch').value.toLowerCase();
  const cat = document.getElementById('categoryFilter').value;
  const list = document.getElementById('articlesList');

  const filtered = state.articles.filter(a =>
    (cat === 'all' || a.category === cat) &&
    (a.title.toLowerCase().includes(query) || a.content.toLowerCase().includes(query))
  );

  list.innerHTML = filtered.map(art => {
    const savedRatio = Number(localStorage.getItem(`taliesin_scroll_art_${art.id}`));
    const hasBookmark = savedRatio > 0.03 && savedRatio < 0.95;
    const pct = Math.round(savedRatio * 100);

    return `
      <article class="card" style="${hasBookmark ? 'border-color: var(--accent);' : ''}">
        <div>
          <div class="meta-row" style="margin-bottom:0.6rem; gap:0.4rem; flex-wrap:wrap;">
            <span class="badge">${art.category}</span>
            ${hasBookmark ? `<span class="badge" style="background:var(--accent); color:#fff;">🔖 ${pct}%</span>` : ''}
            <span>${art.date}</span>
          </div>
          <h3>${art.title}</h3>
          <p style="color:var(--text-muted);">${escapeHtml(art.content.replace(/[#*>]/g, '').slice(0, 140))}...</p>
        </div>
        <div>
          <div class="meta-row" style="margin-bottom:0.8rem;">
            <span>✍️ ${art.author}</span>
            <span>❤️ ${art.likes} · 💬 ${(art.comments || []).length}</span>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="openArticle('${art.id}')">
              ${hasBookmark ? '▶ Продовжити' : 'Читати'}
            </button>
            <button class="btn" onclick="likeArticle('${art.id}')">❤️ Вподобати</button>
            ${canEditArticle(art, user) ? `<button class="btn" onclick="openEditArticleModal('${art.id}')">✏️ Редагувати</button>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

window.openArticle = (id) => {
  const art = state.articles.find(a => a.id === id);
  if (!art) return;
  const user = getCurrentUser();
  const comments = art.comments || [];
  const minutes = estimateReadingMinutes(art.content);

  openModal(`
    <div class="reading-progress-wrap"><div id="readingProgressBar" class="reading-progress-bar"></div></div>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; padding-right:2rem;">
      <span class="badge">${art.category}</span>
      ${canEditArticle(art, user) ? `<button class="btn" onclick="openEditArticleModal('${art.id}')">✏️ Редагувати статтю</button>` : ''}
    </div>
    <h2 style="margin-top:0.6rem;">${art.title}</h2>
    <p class="subtitle">Автор: ${art.author} · ${art.date}</p>

    <div class="reader-toolbar">
      <span class="subtitle">⏱ ~${minutes} хв читання</span>
      <div class="font-controls">
        <button type="button" class="btn" onclick="changeReaderFont(-1)" title="Зменшити шрифт">A-</button>
        <span id="fontSizeLabel" class="subtitle" style="min-width:38px; text-align:center;">${readerFontSize}px</span>
        <button type="button" class="btn" onclick="changeReaderFont(1)" title="Збільшити шрифт">A+</button>
      </div>
    </div>

    <div class="reading-text" style="font-size:${readerFontSize}px;">${formatLiteraryText(art.content)}</div>
    <hr style="margin:1.5rem 0; border-color:var(--border);" />
    <h3>Коментарі (${comments.length})</h3>
    <div>
      ${comments.map(c => `<div class="comment-box"><strong>${c.author}:</strong> ${c.text}</div>`).join('') || '<p class="subtitle">Поки немає коментарів.</p>'}
    </div>
    <form id="commentForm" class="stack-form" style="margin-top:1rem;">
      <input type="text" id="commentInput" class="input" placeholder="Написати коментар..." required />
      <button type="submit" class="btn btn-primary">Надіслати</button>
    </form>
  `);

  bindReaderProgress(`taliesin_scroll_art_${id}`);

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

window.openEditArticleModal = (id) => {
  const art = state.articles.find(a => a.id === id);
  if (!art) return;

  openModal(`
    <h2>Редагування статті</h2>
    <p class="subtitle">Внесіть зміни до тексту або категорії вашого сувою</p>
    <form id="editArticleForm" class="stack-form" style="margin-top:1rem;">
      <input type="text" id="editArtTitle" class="input" required />
      <select id="editArtCategory" class="input">
        <option value="Міфологія">Міфологія</option>
        <option value="Поезія">Поезія</option>
        <option value="Аналіз">Аналіз</option>
      </select>
      <textarea id="editArtContent" class="input textarea" rows="10" required></textarea>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <button type="submit" class="btn btn-primary">Зберегти зміни</button>
        <button type="button" class="btn" onclick="openArticle('${art.id}')">Скасувати</button>
      </div>
    </form>
  `);

  document.getElementById('editArtTitle').value = art.title;
  document.getElementById('editArtCategory').value = art.category;
  document.getElementById('editArtContent').value = art.content;

  document.getElementById('editArticleForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await TaliesinAPI.updateArticle(art.id, {
        title: document.getElementById('editArtTitle').value,
        category: document.getElementById('editArtCategory').value,
        content: document.getElementById('editArtContent').value
      });
      await refresh();
      openArticle(art.id);
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

// --- Книги, глави та редактор автора ---
function renderBooks() {
  const user = getCurrentUser();
  const unlocked = user ? user.unlockedChapters : [];
  const favorites = user ? (user.favoriteBooks || []) : [];
  const progress = user ? (user.readingProgress || {}) : {};
  const list = document.getElementById('booksList');

  list.innerHTML = state.books.map(book => {
    const isAuthor = canEditBook(book, user);
    const isFav = favorites.includes(book.id);
    const lastChapId = progress[book.id];
    const lastChap = (book.chapters || []).find(c => c.id === lastChapId);

    return `
      <div class="card">
        <div>
          <div class="meta-row" style="gap:0.4rem; flex-wrap:wrap;">
            <span class="badge">Книга</span>
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
              <button class="btn ${isFav ? 'btn-primary' : ''}" style="padding:0.25rem 0.7rem; font-size:0.8rem;" onclick="toggleFavoriteBook('${book.id}')">
                ${isFav ? '★ В обраному' : '🔖 В обране'}
              </button>
              ${isAuthor ? `<button class="btn" style="padding:0.25rem 0.7rem; font-size:0.8rem;" onclick="openBookEditorModal('${book.id}')">✏️ Керувати</button>` : ''}
            </div>
          </div>
          <h3 style="margin-top:0.5rem;">${book.title}</h3>
          <p class="subtitle">Автор: ${book.author}</p>
          <p>${book.description}</p>
          ${lastChap ? `
            <div style="margin:0.6rem 0 0.8rem;">
              <button class="btn btn-primary" style="width:100%;" onclick="readChapter('${book.id}', '${lastChap.id}')">
                ▶ Продовжити: ${lastChap.title}
              </button>
            </div>
          ` : ''}
        </div>
        <div>
          <strong>Глави:</strong>
          ${(book.chapters || []).map(ch => {
            const isOpen = ch.price === 0 || unlocked.includes(ch.id) || isAuthor;
            const isBookmarked = lastChapId === ch.id;
            return `
              <div class="chapter-item" style="${isBookmarked ? 'border-left: 3px solid var(--accent); padding-left: 0.6rem;' : ''}">
                <span>${isBookmarked ? '🔖' : (isOpen ? '📖' : '🔒')} ${ch.title}</span>
                <div style="display:flex; gap:0.35rem;">
                  <button class="btn ${isOpen ? '' : 'btn-primary'}" onclick="readChapter('${book.id}', '${ch.id}')">
                    ${isOpen ? 'Читати' : `${ch.price} 🪙`}
                  </button>
                  ${isAuthor ? `<button class="btn" title="Редагувати главу" onclick="openEditChapterModal('${book.id}', '${ch.id}')">✏️</button>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.toggleFavoriteBook = async (bookId) => {
  const user = getCurrentUser();
  if (!user) return openAuthModal();
  try {
    await TaliesinAPI.toggleFavoriteBook(bookId);
    await refresh();
  } catch (err) {
    alert(err.message);
  }
};

window.readChapter = async (bookId, chapterId) => {
  const book = state.books.find(b => b.id === bookId);
  const chapters = book?.chapters || [];
  const chapIndex = chapters.findIndex(c => c.id === chapterId);
  const chap = chapters[chapIndex];
  if (!chap) return;

  const user = getCurrentUser();
  const isAuthor = canEditBook(book, user);
  const unlocked = user ? user.unlockedChapters : [];

  try {
    if (chap.price > 0 && !isAuthor) {
      await TaliesinAPI.unlockChapter(chap.id, chap.price, chap.title, book.author_id);
      await refresh();
    }

    const prevChap = chapIndex > 0 ? chapters[chapIndex - 1] : null;
    const nextChap = chapIndex < chapters.length - 1 ? chapters[chapIndex + 1] : null;
    const nextIsOpen = nextChap && (nextChap.price === 0 || unlocked.includes(nextChap.id) || isAuthor);
    const minutes = estimateReadingMinutes(chap.content);

    if (user) {
      await TaliesinAPI.saveReadingBookmark(bookId, chapterId);
      user.readingProgress = { ...(user.readingProgress || {}), [bookId]: chapterId };
      renderBooks();
    }

    openModal(`
      <div class="reading-progress-wrap"><div id="readingProgressBar" class="reading-progress-bar"></div></div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; padding-right:2rem;">
        <span class="badge">${book.title} · Глава ${chapIndex + 1} з ${chapters.length}</span>
        ${isAuthor ? `<button class="btn" onclick="openEditChapterModal('${book.id}', '${chap.id}')">✏️ Редагувати главу</button>` : ''}
      </div>
      <h2 style="margin-top:0.6rem;">${chap.title}</h2>

      <div class="reader-toolbar">
        <span class="subtitle">⏱ ~${minutes} хв читання</span>
        <div class="font-controls">
          <button type="button" class="btn" onclick="changeReaderFont(-1)" title="Зменшити шрифт">A-</button>
          <span id="fontSizeLabel" class="subtitle" style="min-width:38px; text-align:center;">${readerFontSize}px</span>
          <button type="button" class="btn" onclick="changeReaderFont(1)" title="Збільшити шрифт">A+</button>
        </div>
      </div>

      <div class="reading-text" style="font-size:${readerFontSize}px;">${formatLiteraryText(chap.content)}</div>

      <div class="chapter-nav-footer">
        ${prevChap
          ? `<button class="btn" onclick="readChapter('${book.id}', '${prevChap.id}')">← ${prevChap.title}</button>`
          : '<span></span>'}
        ${nextChap
          ? `<button class="btn btn-primary" onclick="readChapter('${book.id}', '${nextChap.id}')">
              ${nextChap.title} ${nextIsOpen ? '→' : `(${nextChap.price} 🪙)`}
            </button>`
          : '<span class="subtitle">Кінець доступних глав</span>'}
      </div>
    `);

    bindReaderProgress(`taliesin_scroll_${bookId}_${chapterId}`);
  } catch (err) {
    alert(err.message);
  }
};

window.openBookEditorModal = (bookId) => {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  openModal(`
    <h2>Керування книгою</h2>
    <form id="editBookInfoForm" class="stack-form" style="margin-top:0.8rem;">
      <label class="subtitle">Назва книги</label>
      <input type="text" id="editBookTitleInput" class="input" required />
      <label class="subtitle">Опис книги</label>
      <textarea id="editBookDescInput" class="input textarea" rows="3"></textarea>
      <button type="submit" class="btn btn-primary">Зберегти опис книги</button>
    </form>

    <hr style="margin:1.4rem 0; border-color:var(--border);" />
    <h3>Глави книги (${(book.chapters || []).length})</h3>
    <div>
      ${(book.chapters || []).map(ch => `
        <div class="chapter-item">
          <span><strong>${ch.title}</strong> <small class="subtitle">(${ch.price} 🪙)</small></span>
          <button class="btn" onclick="openEditChapterModal('${book.id}', '${ch.id}')">✏️ Редагувати главу</button>
        </div>
      `).join('') || '<p class="subtitle">У цій книзі ще немає глав.</p>'}
    </div>
  `);

  document.getElementById('editBookTitleInput').value = book.title;
  document.getElementById('editBookDescInput').value = book.description || '';

  document.getElementById('editBookInfoForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await TaliesinAPI.updateBookInfo(book.id, {
        title: document.getElementById('editBookTitleInput').value,
        description: document.getElementById('editBookDescInput').value
      });
      await refresh();
      openBookEditorModal(book.id);
    } catch (err) {
      alert(err.message);
    }
  };
};

window.openEditChapterModal = (bookId, chapterId) => {
  const book = state.books.find(b => b.id === bookId);
  const chap = book?.chapters.find(c => c.id === chapterId);
  if (!chap) return;

  openModal(`
    <span class="badge">${book.title}</span>
    <h2 style="margin-top:0.5rem;">Редагування глави</h2>
    <form id="editChapterForm" class="stack-form" style="margin-top:1rem;">
      <label class="subtitle">Назва глави</label>
      <input type="text" id="editChapTitle" class="input" required />
      <label class="subtitle">Ціна в монетах (0 = безкоштовно)</label>
      <input type="number" id="editChapPrice" class="input" min="0" max="500" required />
      <label class="subtitle">Текст глави</label>
      <textarea id="editChapContent" class="input textarea" rows="10" required></textarea>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <button type="submit" class="btn btn-primary">Зберегти главу</button>
        <button type="button" class="btn" onclick="openBookEditorModal('${book.id}')">До списку глав</button>
      </div>
    </form>
  `);

  document.getElementById('editChapTitle').value = chap.title;
  document.getElementById('editChapPrice').value = chap.price;
  document.getElementById('editChapContent').value = chap.content;

  document.getElementById('editChapterForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await TaliesinAPI.updateChapter(book.id, chap.id, {
        title: document.getElementById('editChapTitle').value,
        price: document.getElementById('editChapPrice').value,
        content: document.getElementById('editChapContent').value
      });
      await refresh();
      openBookEditorModal(book.id);
    } catch (err) {
      alert(err.message);
    }
  };
};

// --- Особистий кабінет (Профіль) ---
function renderProfile() {
  const user = getCurrentUser();
  if (!user) return navigateTo('articles');

  const myArticles = state.articles.filter(a => a.author_id === user.id || a.author === user.name);
  const myBooks = state.books.filter(b => b.author_id === user.id || b.author === user.name);

  const unlockedItems = [];
  state.books.forEach(book => {
    (book.chapters || []).forEach(ch => {
      if (user.unlockedChapters.includes(ch.id)) {
        unlockedItems.push({ bookId: book.id, bookTitle: book.title, chapter: ch });
      }
    });
  });

  const favBooks = state.books.filter(b => (user.favoriteBooks || []).includes(b.id));
  const favContainer = document.getElementById('profileFavoritesList');
  if (favContainer) {
    favContainer.innerHTML = favBooks.length
      ? favBooks.map(b => {
          const lastChapId = (user.readingProgress || {})[b.id];
          const targetChap = (b.chapters || []).find(c => c.id === lastChapId) || (b.chapters || [])[0];
          return `
            <div class="chapter-item" style="flex-wrap:wrap;">
              <div>
                <div style="font-size:0.95rem; font-weight:600;">★ ${b.title}</div>
                <small class="subtitle">
                  ${targetChap ? `Закладка: ${targetChap.title}` : 'Ще немає глав'}
                </small>
              </div>
              <div style="display:flex; gap:0.35rem;">
                ${targetChap ? `<button class="btn btn-primary" onclick="readChapter('${b.id}', '${targetChap.id}')">Читати</button>` : ''}
                <button class="btn" onclick="toggleFavoriteBook('${b.id}')" title="Прибрати з обраного">✕</button>
              </div>
            </div>
          `;
        }).join('')
      : '<p class="subtitle">Ваша книжкова полиця поки порожня. Натисніть «🔖 В обране» на будь-якій книзі.</p>';
  }

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
    ...myBooks.map(b => `
      <div class="chapter-item">
        <span>📚 ${b.title} <small class="subtitle">(${(b.chapters || []).length} гл.)</small></span>
        <button class="btn" onclick="openBookEditorModal('${b.id}')">✏️ Керувати</button>
      </div>
    `),
    ...myArticles.map(a => `
      <div class="chapter-item">
        <span>📜 ${a.title}</span>
        <div style="display:flex; gap:0.35rem;">
          <button class="btn" onclick="openArticle('${a.id}')">Читати</button>
          <button class="btn" onclick="openEditArticleModal('${a.id}')">✏️</button>
        </div>
      </div>
    `)
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
  const user = getCurrentUser();
  const select = document.getElementById('bookSelect');
  const editableBooks = state.books.filter(b => canEditBook(b, user));
  select.innerHTML = `<option value="">-- Створити нову книгу --</option>` +
    editableBooks.map(b => `<option value="${b.id}">${b.title}</option>`).join('');
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

attachManuscriptImporter('artFileInput', 'artTitle', 'artContent');
attachManuscriptImporter('chapFileInput', 'chapTitle', 'chapContent');

// --- Розширена Адмін-панель + Журнал безпеки ---
async function renderAdmin() {
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
          <button class="btn" onclick="adminCoins('${u.id}', 50)" title="Нарахувати 50 монет">+50 🪙</button>
          <button class="btn" onclick="adminCoins('${u.id}', -20)" title="Списати 20 монет">-20 🪙</button>
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
            <div>
              <strong>📚 ${b.title}</strong> <span class="subtitle">(${b.author})</span>
            </div>
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
}

window.adminClearLogs = async () => {
  await TaliesinAPI.clearSecurityLogs();
  await renderAdmin();
};

window.adminCoins = async (userId, delta) => {
  try {
    await TaliesinAPI.adminAdjustUserCoins(userId, delta);
    await refresh();
  } catch (err) {
    alert(err.message);
  }
};

window.adminCustomCoins = async (userId, userName) => {
  const input = prompt(`Введіть суму монет для користувача «${userName}» (наприклад, 100 або -30):`);
  if (input === null) return;
  await window.adminCoins(userId, Number(input));
};

window.adminRole = async (userId, nextRole) => {
  try {
    await TaliesinAPI.adminToggleUserRole(userId, nextRole);
    await refresh();
  } catch (err) {
    alert(err.message);
  }
};

window.adminDeleteBook = async (bookId) => {
  if (!confirm('Видалити цю книгу разом з усіма її главами?')) return;
  await TaliesinAPI.adminDeleteBook(bookId);
  await refresh();
};

window.adminDeleteChapter = async (bookId, chapterId) => {
  if (!confirm('Видалити цю главу?')) return;
  await TaliesinAPI.adminDeleteChapter(bookId, chapterId);
  await refresh();
};

window.adminDeleteComment = async (articleId, commentId) => {
  await TaliesinAPI.adminDeleteComment(articleId, commentId);
  await refresh();
};

window.adminDeleteArticle = async (id) => {
  if (!confirm('Видалити цю статтю?')) return;
  await TaliesinAPI.deleteArticle(id);
  await refresh();
};

// --- Ініціалізація ---
async function refresh() {
  try {
    state = await TaliesinAPI.getState();
  } catch (err) {
    console.error('Помилка підключення до Supabase:', err);
    state = { users: [], currentUserId: null, articles: [], books: [] };
  }
  renderHeader();
  renderArticles();
  renderBooks();
  if (!document.getElementById('view-profile').classList.contains('hidden')) {
    renderProfile();
  }
  if (!document.getElementById('view-admin').classList.contains('hidden')) {
    await renderAdmin();
  }
}

applyTheme(document.documentElement.getAttribute('data-theme') || 'day');
refresh();
