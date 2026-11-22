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

function getStreakStatus(user) {
  if (!user) return { activeStreak: 0, claimedToday: false, nextReward: 5 };
  const todayUtc = new Date().toISOString().slice(0, 10);
  const yesterdayUtc = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const claimedToday = user.lastStreakDate === todayUtc;
  const isAlive = claimedToday || user.lastStreakDate === yesterdayUtc;
  const activeStreak = isAlive ? (user.streakCount || 0) : 0;

  const upcomingDay = claimedToday ? activeStreak : activeStreak + 1;
  const rewardsMap = [5, 8, 11, 14, 17, 20, 25];
  const nextReward = rewardsMap[Math.min(Math.max(upcomingDay - 1, 0), 6)];

  return { activeStreak, claimedToday, nextReward, upcomingDay };
}

function canEditArticle(art, user) {
  if (!user || !art) return false;
  return user.role === 'admin' || art.author_id === user.id || art.author === user.name;
}

function canEditBook(book, user) {
  if (!user || !book) return false;
  return user.role === 'admin' || book.author_id === user.id || book.author === user.name;
}

function getBookRatingStats(book) {
  const allItems = Array.isArray(book?.reviews) ? book.reviews : [];
  const mainReviews = allItems.filter(r => !r.parent_id && Number(r.rating) > 0);
  if (!mainReviews.length) return { avg: 'Без оцінок', count: allItems.length, hasRatings: false };
  const sum = mainReviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  const avg = (sum / mainReviews.length).toFixed(1);
  return { avg, count: allItems.length, hasRatings: true };
}

function getBookCodexEntries(book) {
  const allEntries = Array.isArray(state?.codexEntries) ? state.codexEntries : [];
  const linkedIds = Array.isArray(book?.codex_ids) ? book.codex_ids : [];
  if (linkedIds.length) {
    return allEntries.filter(e => linkedIds.includes(e.id));
  }
  return Array.isArray(book?.codex) ? book.codex : [];
}

function renderCommentThread(items, { targetType, targetId, showStars = false }) {
  const user = getCurrentUser();
  const list = Array.isArray(items) ? items : [];
  const byParent = {};

  list.forEach(item => {
    const pid = item.parent_id || 'root';
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(item);
  });

  const renderStars = (count) => '★'.repeat(count) + '☆'.repeat(5 - count);

  const renderNode = (node, depth = 0) => {
    const likedBy = Array.isArray(node.liked_by) ? node.liked_by : [];
    const isLiked = user ? likedBy.includes(user.id) : false;
    const children = byParent[node.id] || [];
    const safeAuthor = escapeHtml(node.author || 'Читач');

    return `
      <div class="comment-box" style="margin-top:0.55rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.25rem;">
          <div>
            <strong>${renderAuthorLink(node.author, node.user_id || '')}</strong>
            ${node.date ? `<small class="subtitle" style="margin-left:0.4rem;">${node.date}</small>` : ''}
          </div>
          ${showStars && !node.parent_id && Number(node.rating) > 0
            ? `<span style="color:var(--accent); letter-spacing:1px;">${renderStars(Number(node.rating))}</span>`
            : ''}
        </div>

        <div style="white-space:pre-line;">${escapeHtml(node.text)}</div>

        <div class="comment-actions">
          <button type="button" class="icon-stat-btn ${isLiked ? 'active' : ''}" onclick="handleCommentLike('${targetType}', '${targetId}', '${node.id}')" title="Вподобати">
            ${isLiked ? '❤️' : '🤍'} <span>${likedBy.length}</span>
          </button>
          <button type="button" class="icon-stat-btn" onclick="toggleReplyForm('${node.id}')" title="Відповісти">
            ↩ Відповісти
          </button>
        </div>

        <form id="reply-form-${node.id}" class="reply-inline-form hidden" onsubmit="submitCommentReply(event, '${targetType}', '${targetId}', '${node.id}')">
          <input type="text" class="input" placeholder="Відповідь для ${safeAuthor}..." maxlength="500" required />
          <button type="submit" class="btn btn-primary" style="padding:0.4rem 0.85rem;">Надіслати</button>
          <button type="button" class="btn" style="padding:0.4rem 0.7rem;" onclick="toggleReplyForm('${node.id}')">✕</button>
        </form>

        ${children.length && depth < 5
          ? `<div class="comment-replies">${children.map(ch => renderNode(ch, depth + 1)).join('')}</div>`
          : ''}
      </div>
    `;
  };

  const roots = byParent['root'] || [];
  return roots.length ? roots.map(r => renderNode(r, 0)).join('') : '';
}

window.toggleReplyForm = (commentId) => {
  if (!getCurrentUser()) return openAuthModal();
  const form = document.getElementById(`reply-form-${commentId}`);
  if (!form) return;
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    form.querySelector('input')?.focus();
  }
};

window.handleCommentLike = async (targetType, targetId, commentId) => {
  if (!getCurrentUser()) return openAuthModal();
  try {
    if (targetType === 'article') {
      await TaliesinAPI.toggleCommentLike(targetId, commentId);
      await refresh();
      openArticle(targetId, true);
    } else {
      await TaliesinAPI.toggleBookReviewLike(targetId, commentId);
      await refresh();
      openBookReviewsModal(targetId);
    }
  } catch (err) {
    alert(err.message);
  }
};

window.submitCommentReply = async (e, targetType, targetId, parentId) => {
  e.preventDefault();
  if (!getCurrentUser()) return openAuthModal();
  const input = e.target.querySelector('input');
  const text = input?.value?.trim();
  if (!text) return;

  try {
    if (targetType === 'article') {
      await TaliesinAPI.addComment(targetId, text, parentId);
      await refresh();
      openArticle(targetId, true);
    } else {
      await TaliesinAPI.addBookReviewReply(targetId, parentId, text);
      await refresh();
      openBookReviewsModal(targetId);
    }
  } catch (err) {
    alert(err.message);
  }
};

function renderAuthorLink(authorName, authorId = '') {
  const safeName = escapeHtml(authorName || 'Невідомий бард');
  const safeId = escapeHtml(authorId || '');
  return `<button type="button" class="author-link" onclick="openAuthorProfile('${safeId}', '${safeName}')">${safeName}</button>`;
}

window.openAuthorProfile = (authorId, authorName) => {
  const authorUser = state.users.find(u =>
    (authorId && u.id === authorId) || u.name === authorName
  );

  const displayName = authorUser ? authorUser.name : authorName;
  const roleBadge = authorUser?.role === 'admin' ? '👑 Хранитель порталу' : '🪶 Бард спільноти';
  const bioText = authorUser?.bio?.trim()
    ? escapeHtml(authorUser.bio)
    : 'Цей бард ще не залишив свого девізу, але його сувої говорять самі за себе.';

  const authorArticles = state.articles.filter(a =>
    (authorId && a.author_id === authorId) || a.author === displayName
  );
  const authorBooks = state.books.filter(b =>
    (authorId && b.author_id === authorId) || b.author === displayName
  );

  const totalLikes = authorArticles.reduce((sum, a) => sum + (a.likes || 0), 0);

  openModal(`
    <div style="padding-right:2rem;">
      <span class="badge">${roleBadge}</span>
      <h2 style="margin-top:0.6rem;">${escapeHtml(displayName)}</h2>
      <blockquote style="margin:0.8rem 0; padding:0.7rem 1rem; border-left:3px solid var(--accent); background:var(--bg-subtle); border-radius:0 10px 10px 0; font-style:italic;">
        ${bioText}
      </blockquote>
      ${authorUser && (!getCurrentUser() || getCurrentUser().id !== authorUser.id)
        ? `<div style="margin-top:0.8rem;">
             <button type="button" class="btn btn-primary" onclick="openTipModal('${escapeHtml(authorUser.id)}', '${escapeHtml(displayName)}')">🎁 Надіслати дарунок барду</button>
           </div>`
        : ''}
    </div>

    <div class="stats-row" style="margin:1rem 0;">
      <div class="stat-box"><strong>${authorBooks.length}</strong>Книг</div>
      <div class="stat-box"><strong>${authorArticles.length}</strong>Статей</div>
      <div class="stat-box"><strong>${totalLikes} ❤️</strong>Вподобань</div>
    </div>

    <h3>📚 Книги автора (${authorBooks.length})</h3>
    <div style="margin-bottom:1.2rem;">
      ${authorBooks.length
        ? authorBooks.map(b => {
            const firstChap = (b.chapters || [])[0];
            return `
              <div class="chapter-item" style="flex-wrap:wrap;">
                <div>
                  <strong>${escapeHtml(b.title)}</strong>
                  <div class="subtitle" style="font-size:0.85rem;">${escapeHtml(b.description || '')} · Глав: ${(b.chapters || []).length}</div>
                </div>
                ${firstChap
                  ? `<button class="btn btn-primary" onclick="readChapter('${b.id}', '${firstChap.id}')">Читати першу главу</button>`
                  : '<small class="subtitle">Немає глав</small>'}
              </div>
            `;
          }).join('')
        : '<p class="subtitle">У цього автора поки немає опублікованих книг.</p>'}
    </div>

    <h3>📜 Статті та сувої (${authorArticles.length})</h3>
    <div>
      ${authorArticles.length
        ? authorArticles.map(a => `
            <div class="chapter-item" style="flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(a.title)}</strong>
                <div class="subtitle" style="font-size:0.82rem;">${escapeHtml(a.category)} · ${a.date} · ❤️ ${a.likes}</div>
              </div>
              <button class="btn" onclick="openArticle('${a.id}')">Читати</button>
            </div>
          `).join('')
        : '<p class="subtitle">У цього автора поки немає статей.</p>'}
    </div>
  `);
};

window.openTipModal = (recipientId, recipientName, workTitle = '') => {
  const user = getCurrentUser();
  if (!user) return openAuthModal();

  if (!recipientId) {
    return alert('Цей твір створено без прив’язки до акаунту автора.');
  }
  if (user.id === recipientId) {
    return alert('Ви є автором цього твору.');
  }

  const safeId = escapeHtml(recipientId);
  const safeName = escapeHtml(recipientName || 'Бард');
  const safeTitle = escapeHtml(workTitle || '');

  openModal(`
    <div style="padding-right:2rem;">
      <span class="badge">🎁 Дарунок барду</span>
      <h2 style="margin-top:0.5rem;">Віддячити: ${safeName}</h2>
      ${safeTitle ? `<p class="subtitle">За твір: «${safeTitle}»</p>` : ''}
      <p style="margin-top:0.5rem;">Ваш баланс: <strong>${user.coins} 🪙</strong></p>
    </div>

    <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin:1rem 0;">
      <button type="button" class="btn tip-preset" onclick="document.getElementById('tipAmountInput').value = 5">+5 🪙</button>
      <button type="button" class="btn tip-preset" onclick="document.getElementById('tipAmountInput').value = 15">+15 🪙</button>
      <button type="button" class="btn tip-preset" onclick="document.getElementById('tipAmountInput').value = 50">+50 🪙</button>
    </div>

    <form id="tipBardForm" class="stack-form">
      <label class="subtitle">Кількість монет</label>
      <input type="number" id="tipAmountInput" class="input" min="1" max="1000" value="15" required />
      <input type="text" id="tipNoteInput" class="input" maxlength="120" placeholder="Коротке слово вдячності автору (необов'язково)..." />
      <button type="submit" class="btn btn-primary">Надіслати дарунок 🪙</button>
    </form>
  `);

  document.getElementById('tipBardForm').onsubmit = async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById('tipAmountInput').value);
    const note = document.getElementById('tipNoteInput').value;

    try {
      await TaliesinAPI.tipBard({
        recipientId,
        amount,
        workTitle,
        note
      });
      await refresh();
      closeModal();
      alert(`Ви успішно надіслали ${amount} 🪙 барду ${recipientName}!`);
    } catch (err) {
      alert(err.message);
    }
  };
};

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
  if (target === 'hall') renderHallOfFame();
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
  const streakInfo = getStreakStatus(user);
  const streakEl = document.getElementById('userStreak');
  if (streakEl) streakEl.textContent = streakInfo.activeStreak;

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
  const favArticles = user ? (user.favoriteArticles || []) : [];
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
    const isFav = favArticles.includes(art.id);

    const likedBy = Array.isArray(art.liked_by) ? art.liked_by : [];
    const isLiked = user ? likedBy.includes(user.id) : false;
    const likesCount = likedBy.length || art.likes || 0;
    const commentsCount = (art.comments || []).length;

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
            <span>✍️ ${renderAuthorLink(art.author, art.author_id)}</span>
            <div class="icon-stats-group">
              <button type="button" class="icon-stat-btn ${isLiked ? 'active' : ''}" onclick="likeArticle('${art.id}')" title="${isLiked ? 'Прибрати вподобання' : 'Вподобати'}">
                ${isLiked ? '❤️' : '🤍'} <span>${likesCount}</span>
              </button>
              <button type="button" class="icon-stat-btn" onclick="openArticle('${art.id}', true)" title="Перейти до коментарів">
                💬 <span>${commentsCount}</span>
              </button>
            </div>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="openArticle('${art.id}')">
              ${hasBookmark ? '▶ Продовжити' : 'Читати'}
            </button>
            <button class="btn ${isFav ? 'btn-primary' : ''}" onclick="toggleFavoriteArticle('${art.id}')">
              ${isFav ? '★ В обраному' : '🔖 В обране'}
            </button>
            ${canEditArticle(art, user) ? `<button class="btn" onclick="openEditArticleModal('${art.id}')">✏️ Редагувати</button>` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

window.likeArticle = async (id) => {
  if (!getCurrentUser()) return openAuthModal();
  try {
    await TaliesinAPI.toggleLike(id);
    await refresh();
  } catch (err) {
    alert(err.message);
  }
};

window.toggleFavoriteArticle = async (articleId) => {
  const user = getCurrentUser();
  if (!user) return openAuthModal();
  try {
    await TaliesinAPI.toggleFavoriteArticle(articleId);
    await refresh();
  } catch (err) {
    alert(err.message);
  }
};

window.openArticle = (id, scrollToComments = false) => {
  const art = state.articles.find(a => a.id === id);
  if (!art) return;
  const user = getCurrentUser();
  const comments = art.comments || [];
  const minutes = estimateReadingMinutes(art.content);
  const isFav = (user?.favoriteArticles || []).includes(art.id);

  const likedBy = Array.isArray(art.liked_by) ? art.liked_by : [];
  const isLiked = user ? likedBy.includes(user.id) : false;
  const likesCount = likedBy.length || art.likes || 0;

  openModal(`
    <div class="reading-progress-wrap"><div id="readingProgressBar" class="reading-progress-bar"></div></div>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; padding-right:2rem;">
      <span class="badge">${art.category}</span>
      <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
        <button type="button" class="icon-stat-btn ${isLiked ? 'active' : ''}" onclick="likeArticle('${art.id}').then(() => openArticle('${art.id}'))" title="Вподобати">
          ${isLiked ? '❤️' : '🤍'} <span>${likesCount}</span>
        </button>
        <button class="btn ${isFav ? 'btn-primary' : ''}" onclick="toggleFavoriteArticle('${art.id}').then(() => openArticle('${art.id}'))">
          ${isFav ? '★ В обраному' : '🔖 В обране'}
        </button>
        ${art.author_id && (!user || user.id !== art.author_id)
  ? `<button type="button" class="btn" onclick="openTipModal('${escapeHtml(art.author_id)}', '${escapeHtml(art.author)}', '${escapeHtml(art.title)}')">🎁 Дарунок</button>`
  : ''}
        ${canEditArticle(art, user) ? `<button class="btn" onclick="openEditArticleModal('${art.id}')">✏️ Редагувати</button>` : ''}
      </div>
    </div>
    <h2 style="margin-top:0.6rem;">${art.title}</h2>
    <p class="subtitle">Автор: ${renderAuthorLink(art.author, art.author_id)} · ${art.date}</p>

    <div class="reader-toolbar">
      <span class="subtitle">⏱ ~${minutes} хв читання</span>
      <div class="font-controls">
        <button type="button" class="btn" onclick="changeReaderFont(-1)" title="Зменшити шрифт">A-</button>
        <span id="fontSizeLabel" class="subtitle" style="min-width:38px; text-align:center;">${readerFontSize}px</span>
        <button type="button" class="btn" onclick="changeReaderFont(1)" title="Збільшити шрифт">A+</button>
      </div>
    </div>

    <div class="reading-text" style="font-size:${readerFontSize}px;">${formatLiteraryText(art.content)}</div>
    <hr id="articleCommentsSection" style="margin:1.5rem 0; border-color:var(--border);" />
    <h3>Коментарі (${comments.length})</h3>
    <div>
  ${renderCommentThread(comments, { targetType: 'article', targetId: id }) || '<p class="subtitle">Поки немає коментарів.</p>'}
</div>
    
    <form id="commentForm" class="stack-form" style="margin-top:1rem;">
      <input type="text" id="commentInput" class="input" placeholder="Написати коментар..." required />
      <button type="submit" class="btn btn-primary">Надіслати</button>
    </form>
  `);

  if (scrollToComments) {
    requestAnimationFrame(() => {
      document.getElementById('articleCommentsSection')?.scrollIntoView({ behavior: 'smooth' });
    });
  } else {
    bindReaderProgress(`taliesin_scroll_art_${id}`);
  }

  document.getElementById('commentForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await TaliesinAPI.addComment(id, document.getElementById('commentInput').value);
      await refresh();
      openArticle(id, true);
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
    const ratingInfo = getBookRatingStats(book);

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
              ${getBookCodexEntries(book).length
  ? `<button class="btn" style="padding:0.25rem 0.7rem; font-size:0.8rem;" onclick="openBookCodexModal('${book.id}')">📖 Кодекс (${getBookCodexEntries(book).length})</button>`
  : ''}
            </div>
          </div>
          <h3 style="margin-top:0.5rem;">${book.title}</h3>
          <div class="meta-row" style="margin-bottom:0.6rem;">
            <span>✍️ ${renderAuthorLink(book.author, book.author_id)}</span>
            <div class="icon-stats-group">
              <button type="button" class="icon-stat-btn ${ratingInfo.hasRatings ? 'active' : ''}" onclick="openBookReviewsModal('${book.id}')" title="Оцінити книгу">
                ${ratingInfo.hasRatings ? '⭐' : '☆'} <span>${ratingInfo.avg}</span>
              </button>
              <button type="button" class="icon-stat-btn" onclick="openBookReviewsModal('${book.id}', true)" title="Відгуки читачів">
                💬 <span>${ratingInfo.count}</span>
              </button>
            </div>
          </div>
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

window.openBookReviewsModal = (bookId) => {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  const user = getCurrentUser();
  const reviews = Array.isArray(book.reviews) ? book.reviews : [];
  const ratingInfo = getBookRatingStats(book);
  const myExisting = user ? reviews.find(r => r.user_id === user.id && !r.parent_id) : null;
  
  const renderStars = (count) => '★'.repeat(count) + '☆'.repeat(5 - count);
  const badgeText = ratingInfo.hasRatings ? `⭐ ${ratingInfo.avg} (${ratingInfo.count})` : '☆ Без оцінок';

  openModal(`
    <div style="padding-right:2rem;">
      <span class="badge">${badgeText}</span>
      <h2 style="margin-top:0.5rem;">${escapeHtml(book.title)}</h2>
      <p class="subtitle">Автор: ${renderAuthorLink(book.author, book.author_id)}</p>
      <p style="margin-top:0.5rem;">${escapeHtml(book.description || '')}</p>
    </div>

    <hr style="margin:1.2rem 0; border-color:var(--border);" />
    <h3>${myExisting ? 'Оновити вашу оцінку та відгук' : 'Оцінити книгу'}</h3>
    <form id="bookReviewForm" class="stack-form" style="margin:0.8rem 0 1.4rem;">
      <select id="bookRatingSelect" class="input" required>
        <option value="5">★★★★★ — 5 (Шедевр)</option>
        <option value="4">★★★★☆ — 4 (Дуже добре)</option>
        <option value="3">★★★☆☆ — 3 (Цікаво)</option>
        <option value="2">★★☆☆☆ — 2 (Слабкувато)</option>
        <option value="1">★☆☆☆☆ — 1 (Не сподобалось)</option>
      </select>
      <textarea id="bookReviewInput" class="input textarea" rows="3" maxlength="600" placeholder="Поділіться враженнями від книги (до 600 символів)..." required></textarea>
      <button type="submit" class="btn btn-primary" style="align-self:flex-start;">
        ${myExisting ? 'Оновити відгук' : 'Опублікувати відгук'}
      </button>
    </form>

    <h3>Відгуки читачів (${reviews.length})</h3>
    <div>
  ${renderCommentThread(reviews, { targetType: 'book', targetId: bookId, showStars: true }) || '<p class="subtitle">Поки немає жодного відгуку. Станьте першим, хто оцінить цю книгу!</p>'}
</div>
  `);

  if (myExisting) {
    document.getElementById('bookRatingSelect').value = String(myExisting.rating);
    document.getElementById('bookReviewInput').value = myExisting.text;
  }

  document.getElementById('bookReviewForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!getCurrentUser()) return openAuthModal();

    try {
      await TaliesinAPI.addBookReview(
        bookId,
        document.getElementById('bookRatingSelect').value,
        document.getElementById('bookReviewInput').value
      );
      await refresh();
      openBookReviewsModal(bookId);
    } catch (err) {
      alert(err.message);
    }
  };
};

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
        ${book.author_id && (!user || user.id !== book.author_id)
  ? `<button type="button" class="btn" onclick="openTipModal('${escapeHtml(book.author_id)}', '${escapeHtml(book.author)}', '${escapeHtml(book.title)}')">🎁 Дарунок барду</button>`
  : ''}
  ${getBookCodexEntries(book).length
  ? `<button type="button" class="btn" onclick="openBookCodexModal('${book.id}', '${chap.id}')">📖 Кодекс (${getBookCodexEntries(book).length})</button>`
  : ''}
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

  const user = getCurrentUser();
  const bookCodex = getBookCodexEntries(book);
  const linkedIds = bookCodex.map(e => e.id);
  const availableShared = (state.codexEntries || []).filter(
    e => (e.is_shared || e.author_id === user?.id) && !linkedIds.includes(e.id)
  );

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

    <hr style="margin:1.4rem 0; border-color:var(--border);" />
    <h3>📖 Кодекс світу (${bookCodex.length})</h3>
    <p class="subtitle" style="margin-bottom:0.75rem;">Підключайте спільні поняття всесвітів (напр., Ельфи, Астральна проєкція) або створюйте власні картки</p>

    ${availableShared.length ? `
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1rem; padding:0.75rem; background:var(--bg-subtle); border-radius:12px;">
        <select id="sharedCodexSelect" class="input" style="flex:1; min-width:200px;">
          <option value="">-- Обрати зі спільної енциклопедії порталу --</option>
          ${availableShared.map(e => `<option value="${e.id}">${escapeHtml(e.title)} (${escapeHtml(e.category)}${e.universe ? ` · ${escapeHtml(e.universe)}` : ''})</option>`).join('')}
        </select>
        <button type="button" class="btn" onclick="linkSharedCodexEntry('${book.id}')">+ Підключити до книги</button>
      </div>
    ` : ''}

    <form class="stack-form" onsubmit="addCodexEntry(event, '${book.id}')" style="margin-bottom:1rem;">
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <input type="text" id="codexNewTitle" class="input" placeholder="Назва (напр., Ейріс або Ельфи)" style="flex:1; min-width:160px;" required />
        <select id="codexNewCategory" class="input">
          <option value="Персонаж">Персонаж</option>
          <option value="Локація">Локація</option>
          <option value="Артефакт / Технологія">Артефакт / Технологія</option>
          <option value="Термін / Подія">Термін / Подія</option>
        </select>
      </div>
      <input type="text" id="codexNewUniverse" class="input" placeholder="Всесвіт або уточнення (напр., Загальний архетип або Хроніки Авену)" />
      <textarea id="codexNewDesc" class="input textarea" rows="2" maxlength="800" placeholder="Опис, особливості або відмінності у вашому світі..." required></textarea>
      <label class="subtitle" style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
        <input type="checkbox" id="codexIsShared" checked />
        Зробити запис доступним іншим авторам у спільній енциклопедії
      </label>
      <button type="submit" class="btn btn-primary" style="align-self:flex-start;">+ Створити та додати до книги</button>
    </form>

    <div>
      ${bookCodex.map(item => {
        const canDeleteGlobal = user && (user.role === 'admin' || item.author_id === user.id);
        return `
          <div class="chapter-item" style="flex-wrap:wrap;">
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <span class="badge">${escapeHtml(item.category || '')}</span>
              ${item.universe ? `<small class="subtitle" style="margin-left:0.35rem;">· ${escapeHtml(item.universe)}</small>` : ''}
              <div class="subtitle" style="font-size:0.84rem; margin-top:0.2rem;">${escapeHtml(item.description)}</div>
            </div>
            <div style="display:flex; gap:0.35rem;">
              <button type="button" class="btn" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="unlinkCodexEntry('${book.id}', '${item.id}')" title="Відкріпити від цієї книги">Відкріпити</button>
              ${canDeleteGlobal ? `<button type="button" class="btn btn-danger" style="padding:0.25rem 0.65rem; font-size:0.8rem;" onclick="deleteCodexEntry('${book.id}', '${item.id}')" title="Видалити назавжди">✕</button>` : ''}
            </div>
          </div>
        `;
      }).join('') || '<p class="subtitle">До цієї книги поки не підключено жодного запису Кодексу.</p>'}
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
window.openBookCodexModal = (bookId, returnChapterId = null) => {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  const entries = getBookCodexEntries(book);
  const categories = ['Усі', 'Персонаж', 'Локація', 'Артефакт / Технологія', 'Термін / Подія'];

  openModal(`
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; padding-right:2rem;">
      <span class="badge">📖 Кодекс світу</span>
      ${returnChapterId
        ? `<button type="button" class="btn" onclick="readChapter('${book.id}', '${returnChapterId}')">← Повернутися до глави</button>`
        : ''}
    </div>
    <h2 style="margin-top:0.5rem;">${escapeHtml(book.title)}</h2>
    <p class="subtitle">Довідник персонажів, локацій та понять цього всесвіту</p>

    <div class="filters" style="margin:1rem 0;">
      <input type="search" id="codexSearchInput" class="input" placeholder="Пошук у кодексі..." style="flex:1; min-width:180px;" />
      <select id="codexCatFilter" class="input">
        ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
    </div>

    <div id="codexEntriesContainer"></div>
  `);

  const renderEntries = () => {
    const q = (document.getElementById('codexSearchInput')?.value || '').toLowerCase();
    const cat = document.getElementById('codexCatFilter')?.value || 'Усі';
    const box = document.getElementById('codexEntriesContainer');
    if (!box) return;

    const filtered = entries.filter(item =>
      (cat === 'Усі' || item.category === cat) &&
      (item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q))
    );

    box.innerHTML = filtered.length
      ? filtered.map(item => `
          <div class="comment-box" style="margin-top:0.65rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.3rem;">
              <div>
                <strong style="font-size:1.02rem;">${escapeHtml(item.title)}</strong>
                ${item.universe ? `<small class="subtitle" style="margin-left:0.4rem;">(${escapeHtml(item.universe)})</small>` : ''}
              </div>
              <span class="badge">${escapeHtml(item.category || 'Термін / Подія')}</span>
            </div>
            <div style="white-space:pre-line; color:var(--text-main);">${escapeHtml(item.description)}</div>
          </div>
        `).join('')
      : '<p class="subtitle">Записів у кодексі за цим запитом поки немає.</p>';
  };

  document.getElementById('codexSearchInput')?.addEventListener('input', renderEntries);
  document.getElementById('codexCatFilter')?.addEventListener('change', renderEntries);
  renderEntries();
};

window.addCodexEntry = async (e, bookId) => {
  e.preventDefault();
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  const title = document.getElementById('codexNewTitle').value.trim();
  const category = document.getElementById('codexNewCategory').value;
  const universe = document.getElementById('codexNewUniverse').value.trim();
  const description = document.getElementById('codexNewDesc').value.trim();
  const isShared = document.getElementById('codexIsShared').checked;
  if (!title || !description) return;

  try {
    const created = await TaliesinAPI.createCodexEntry({
      title,
      category,
      description,
      universe: universe || book.title,
      isShared
    });
    const currentLinks = Array.isArray(book.codex_ids) ? book.codex_ids : [];
    await TaliesinAPI.updateBookCodexLinks(bookId, [...currentLinks, created.id]);
    await refresh();
    openBookEditorModal(bookId);
  } catch (err) {
    alert(err.message);
  }
};

window.linkSharedCodexEntry = async (bookId) => {
  const book = state.books.find(b => b.id === bookId);
  const select = document.getElementById('sharedCodexSelect');
  const entryId = select?.value;
  if (!book || !entryId) return;

  const currentLinks = Array.isArray(book.codex_ids) ? book.codex_ids : [];
  if (currentLinks.includes(entryId)) return;

  try {
    await TaliesinAPI.updateBookCodexLinks(bookId, [...currentLinks, entryId]);
    await refresh();
    openBookEditorModal(bookId);
  } catch (err) {
    alert(err.message);
  }
};

window.unlinkCodexEntry = async (bookId, entryId) => {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;
  const currentLinks = Array.isArray(book.codex_ids) ? book.codex_ids : [];
  const nextLinks = currentLinks.filter(id => id !== entryId);

  try {
    await TaliesinAPI.updateBookCodexLinks(bookId, nextLinks);
    await refresh();
    openBookEditorModal(bookId);
  } catch (err) {
    alert(err.message);
  }
};

window.deleteCodexEntry = async (bookId, entryId) => {
  if (!confirm('Видалити цей запис зі спільного Кодексу порталу?')) return;
  try {
    await window.unlinkCodexEntry(bookId, entryId);
    await TaliesinAPI.deleteCodexEntryById(entryId);
    await refresh();
    openBookEditorModal(bookId);
  } catch (err) {
    alert(err.message);
  }
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
function renderHallOfFame() {
  const container = document.getElementById('hallOfFameContent');
  if (!container || !state) return;

  const medals = ['🥇', '🥈', '🥉'];

  // 1. Рейтинг бардів (за вподобаннями статей, відгуками на книги та кількістю творів)
  const bardStats = state.users.map(u => {
    const uArticles = state.articles.filter(a => a.author_id === u.id || a.author === u.name);
    const uBooks = state.books.filter(b => b.author_id === u.id || b.author === u.name);

    const likes = uArticles.reduce((sum, a) => {
      const likedLen = Array.isArray(a.liked_by) ? a.liked_by.length : 0;
      return sum + (likedLen || a.likes || 0);
    }, 0);

    const bookStars = uBooks.reduce((sum, b) => {
      const info = getBookRatingStats(b);
      return sum + (info.hasRatings ? Number(info.avg) : 0);
    }, 0);

    const worksCount = uArticles.length + uBooks.length;
    const score = likes * 2 + Math.round(bookStars * 3) + worksCount * 3;

    return {
      user: u,
      likes,
      worksCount,
      score
    };
  })
  .filter(item => item.worksCount > 0 || item.likes > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

  // 2. Топ книг за оцінками читачів
  const topBooks = [...state.books]
    .map(b => ({ book: b, rating: getBookRatingStats(b) }))
    .sort((a, b) => {
      const avgDiff = (b.rating.hasRatings ? Number(b.rating.avg) : 0) - (a.rating.hasRatings ? Number(a.rating.avg) : 0);
      if (avgDiff !== 0) return avgDiff;
      return b.rating.count - a.rating.count;
    })
    .slice(0, 5);

  // 3. Топ статей за вподобаннями та коментарями
  const topArticles = [...state.articles]
    .map(a => {
      const likedLen = Array.isArray(a.liked_by) ? a.liked_by.length : 0;
      const likes = likedLen || a.likes || 0;
      const comments = (a.comments || []).length;
      return { art: a, likes, comments };
    })
    .sort((a, b) => (b.likes * 2 + b.comments) - (a.likes * 2 + a.comments))
    .slice(0, 5);

  const bardsHtml = bardStats.length
    ? bardStats.map((item, idx) => `
        <div class="hall-row">
          <div style="display:flex; align-items:center; gap:0.55rem;">
            <span class="hall-rank">${medals[idx] || `#${idx + 1}`}</span>
            <div>
              <div>${renderAuthorLink(item.user.name, item.user.id)}</div>
              <small class="subtitle">Творів: ${item.worksCount} · Вподобань: ${item.likes} ❤️</small>
            </div>
          </div>
          <span class="badge">${item.score} слави</span>
        </div>
      `).join('')
    : '<p class="subtitle">Поки немає опублікованих творів для рейтингу.</p>';

  const booksHtml = topBooks.length
    ? topBooks.map(({ book, rating }, idx) => {
        const firstChap = (book.chapters || [])[0];
        return `
          <div class="hall-row">
            <div style="display:flex; align-items:center; gap:0.55rem;">
              <span class="hall-rank">${medals[idx] || `#${idx + 1}`}</span>
              <div>
                <strong>${escapeHtml(book.title)}</strong>
                <div class="subtitle" style="font-size:0.82rem;">
                  ${renderAuthorLink(book.author, book.author_id)} · ${rating.hasRatings ? `⭐ ${rating.avg}` : '☆ Без оцінок'} · 💬 ${rating.count}
                </div>
              </div>
            </div>
            ${firstChap
              ? `<button class="btn" style="padding:0.3rem 0.75rem; font-size:0.82rem;" onclick="readChapter('${book.id}', '${firstChap.id}')">Читати</button>`
              : ''}
          </div>
        `;
      }).join('')
    : '<p class="subtitle">У бібліотеці поки немає книг.</p>';

  const articlesHtml = topArticles.length
    ? topArticles.map(({ art, likes, comments }, idx) => `
        <div class="hall-row">
          <div style="display:flex; align-items:center; gap:0.55rem;">
            <span class="hall-rank">${medals[idx] || `#${idx + 1}`}</span>
            <div>
              <strong>${escapeHtml(art.title)}</strong>
              <div class="subtitle" style="font-size:0.82rem;">
                ${renderAuthorLink(art.author, art.author_id)} · ❤️ ${likes} · 💬 ${comments}
              </div>
            </div>
          </div>
          <button class="btn" style="padding:0.3rem 0.75rem; font-size:0.82rem;" onclick="openArticle('${art.id}')">Читати</button>
        </div>
      `).join('')
    : '<p class="subtitle">Сувоїв поки немає.</p>';

  container.innerHTML = `
    <div class="card">
      <div>
        <span class="badge">🏆 Майстри слова</span>
        <h3 style="margin-top:0.5rem;">Топ-барди спільноти</h3>
        <p class="subtitle" style="margin-bottom:0.6rem;">Рейтинг за творами, оцінками книг та любов’ю читачів</p>
        ${bardsHtml}
      </div>
    </div>

    <div class="card">
      <div>
        <span class="badge">📚 Золота полиця</span>
        <h3 style="margin-top:0.5rem;">Найкращі книги</h3>
        <p class="subtitle" style="margin-bottom:0.6rem;">Сортування за середнім балом зірок та відгуками</p>
        ${booksHtml}
      </div>
    </div>

    <div class="card">
      <div>
        <span class="badge">🔥 У центрі уваги</span>
        <h3 style="margin-top:0.5rem;">Найпопулярніші сувої</h3>
        <p class="subtitle" style="margin-bottom:0.6rem;">Статті з найбільшою кількістю сердець та обговорень</p>
        ${articlesHtml}
      </div>
    </div>
  `;
}

window.openDailyStreakModal = () => {
  const user = getCurrentUser();
  if (!user) return openAuthModal();

  const { activeStreak, claimedToday, nextReward } = getStreakStatus(user);
  const rewards = [5, 8, 11, 14, 17, 20, 25];
  const cycleProgress = activeStreak % 7 === 0 && activeStreak > 0 ? 7 : activeStreak % 7;

  openModal(`
    <div style="padding-right:2rem;">
      <span class="badge">🔥 Щоденний ритуал</span>
      <h2 style="margin-top:0.5rem;">Вогонь Творчості</h2>
      <p class="subtitle">Заходьте щодня, щоб підтримувати полум’я та отримувати монети Авену.</p>
    </div>

    <div class="stats-row" style="margin:1rem 0 0.5rem;">
      <div class="stat-box"><strong>${activeStreak} 🔥</strong>Днів поспіль</div>
      <div class="stat-box"><strong>+${nextReward} 🪙</strong>${claimedToday ? 'Отримано сьогодні' : 'Сьогоднішній дар'}</div>
    </div>

    <div class="streak-days-grid">
      ${rewards.map((val, idx) => {
        const dayNum = idx + 1;
        const isDone = dayNum <= cycleProgress;
        const isNext = !claimedToday && dayNum === (cycleProgress === 7 ? 1 : cycleProgress + 1);
        return `
          <div class="streak-day-box ${isDone ? 'done' : ''} ${isNext ? 'next' : ''}">
            <div>День ${dayNum}</div>
            <strong>+${val} 🪙</strong>
          </div>
        `;
      }).join('')}
    </div>

    ${claimedToday
      ? `<button type="button" class="btn" disabled style="width:100%; justify-content:center;">✅ Сьогоднішній дар уже забрано — повертайтесь завтра</button>`
      : `<button type="button" id="claimStreakSubmitBtn" class="btn btn-primary" style="width:100%; justify-content:center;">🔥 Підтримати вогонь і забрати +${nextReward} 🪙</button>`}
  `);

  const claimBtn = document.getElementById('claimStreakSubmitBtn');
  if (claimBtn) {
    claimBtn.onclick = async () => {
      claimBtn.disabled = true;
      try {
        const res = await TaliesinAPI.claimDailyStreak();
        await refresh();
        openDailyStreakModal();
        alert(`Полум’я горить ${res.streak} дн. поспіль! Отримано +${res.reward} 🪙.`);
      } catch (err) {
        claimBtn.disabled = false;
        alert(err.message);
      }
    };
  }
};

document.getElementById('streakBtn')?.addEventListener('click', openDailyStreakModal);

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

  const streakInfo = getStreakStatus(user);
  document.getElementById('profileSummary').innerHTML = `
    <div class="stat-box"><strong>${user.coins} 🪙</strong>Поточний баланс</div>
    <div class="stat-box" style="cursor:pointer;" onclick="openDailyStreakModal()" title="Відкрити ритуал Вогнища">
      <strong>${streakInfo.activeStreak} 🔥</strong>Серія днів (${streakInfo.claimedToday ? 'забрано' : `+${streakInfo.nextReward} 🪙`})
    </div>
    <div class="stat-box"><strong>${unlockedItems.length}</strong>Куплених / відкритих глав</div>
    <div class="stat-box"><strong>${myArticles.length + myBooks.length}</strong>Створених творів</div>
  `;

  const favBooks = state.books.filter(b => (user.favoriteBooks || []).includes(b.id));
  const favContainer = document.getElementById('profileFavoritesList');
  const favArticles = state.articles.filter(a => (user.favoriteArticles || []).includes(a.id));
  const favArtContainer = document.getElementById('profileFavArticlesList');
  if (favArtContainer) {
    favArtContainer.innerHTML = favArticles.length
      ? favArticles.map(a => `
          <div class="chapter-item" style="flex-wrap:wrap;">
            <div>
              <div style="font-size:0.95rem; font-weight:600;">★ ${a.title}</div>
              <small class="subtitle">${a.category} · Автор: ${a.author}</small>
            </div>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-primary" onclick="openArticle('${a.id}')">Читати</button>
              <button class="btn" onclick="toggleFavoriteArticle('${a.id}')" title="Прибрати з обраного">✕</button>
            </div>
          </div>
        `).join('')
      : '<p class="subtitle">У вас поки немає збережених статей.</p>';
  }
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

  document.getElementById('profileNewName').value = user.name;
  const bioInput = document.getElementById('profileNewBio');
if (bioInput) bioInput.value = user.bio || '';

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
    await TaliesinAPI.updateProfileInfo({
      name: document.getElementById('profileNewName').value,
      bio: document.getElementById('profileNewBio')?.value || ''
    });
    await refresh();
    renderProfile();
    alert('Профіль барда успішно оновлено!');
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
  if (!document.getElementById('view-hall').classList.contains('hidden')) {
    renderHallOfFame();
  }
}

applyTheme(document.documentElement.getAttribute('data-theme') || 'day');
refresh();
