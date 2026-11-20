const DB_KEY = 'taliesin_portal_db_v1';

const SEED_DATA = {
  users: [
    { id: 'u1', name: 'Талієсін Бард', email: 'bard@taliesin.wales', role: 'admin', coins: 120, unlockedChapters: ['c1', 'c2'] },
    { id: 'u2', name: 'Керідвен', email: 'reader@taliesin.wales', role: 'user', coins: 25, unlockedChapters: ['c1'] }
  ],
  currentUserId: 'u2',
  articles: [
    {
      id: 'a1',
      title: 'Три краплі натхнення з казана Керідвен',
      category: 'Міфологія',
      author: 'Талієсін Бард',
      date: '2026-11-18',
      likes: 14,
      content: 'У валлійській традиції Авен (Awen) — це не просто поетичний хист, а раптове осяяння, що поєднує пам’ять минулого та бачення майбутнього.\n\nКоли юний Ґвіон Бах випадково скуштував три вогняні краплі з казана мудрості, світ перестав бути для нього набором розрізнених речей — кожен вітер і кожен камінь отримали власний голос.',
      comments: [
        { id: 'cm1', author: 'Керідвен', text: 'Чудовий переказ! Дуже пасує до вечірнього читання біля вогню.' }
      ]
    },
    {
      id: 'a2',
      title: 'Чому стародавні барди цінували стислість метафори',
      category: 'Аналіз',
      author: 'Керідвен',
      date: '2026-11-19',
      likes: 9,
      content: 'У ранній кельтській поезії зайве слово вважалося ознакою слабкої думки. Образ мав бити точно, як іскра з кременю в темряві.\n\nСаме тому тріади — групи з трьох пов’язаних образів — стали основою збереження знань без паперу.',
      comments: []
    }
  ],
  books: [
    {
      id: 'b1',
      title: 'Хроніки Срібної Арфи',
      author: 'Талієсін Бард',
      description: 'Подорож мандрівного співця крізь туманні долини Гвінеду в пошуках загубленої пісні.',
      chapters: [
        { id: 'c1', title: 'Глава 1. Попіл і зорі', price: 0, content: 'Ніч опустилася на пагорби швидко, залишаючи по собі лише запах вологого вересу та диму від далеких вогнищ. Арфа за спиною здавалася важчою, ніж уранці...' },
        { id: 'c2', title: 'Глава 2. Міст через Афон', price: 15, content: 'Біля кам’яного броду на нього вже чекали. Старий перевізник не просив срібла — лише одну правдиву історію, якої ще не чув вітер...' },
        { id: 'c3', title: 'Глава 3. Таємниця Котла', price: 25, content: 'У підземеллі фортеці пахло сушеними травами та розпеченою міддю. Три іскри злетіли вгору, освітивши давні руни на стінах...' }
      ]
    }
  ]
};

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    localStorage.setItem(DB_KEY, JSON.stringify(SEED_DATA));
    return structuredClone(SEED_DATA);
  }
  return JSON.parse(raw);
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// Публічний асинхронний API-шар (легко замінюється на fetch / Firebase / Supabase)
window.TaliesinAPI = {
  async getState() {
    return loadDB();
  },

  async login(email, name, role = 'user') {
    const db = loadDB();
    let user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      user = {
        id: 'u_' + Date.now(),
        name: name || email.split('@')[0],
        email,
        role,
        coins: 30,
        unlockedChapters: ['c1']
      };
      db.users.push(user);
    }
    db.currentUserId = user.id;
    saveDB(db);
    return user;
  },

  async switchDemoRole(role) {
    const db = loadDB();
    const target = db.users.find(u => u.role === role);
    if (target) {
      db.currentUserId = target.id;
      saveDB(db);
    }
    return target;
  },

  async logout() {
    const db = loadDB();
    db.currentUserId = null;
    saveDB(db);
  },

  async addCoins(amount) {
    const db = loadDB();
    const user = db.users.find(u => u.id === db.currentUserId);
    if (!user) throw new Error('Потрібна авторизація');
    user.coins += amount;
    saveDB(db);
    return user.coins;
  },

  async createArticle({ title, category, content }) {
    const db = loadDB();
    const user = db.users.find(u => u.id === db.currentUserId);
    if (!user) throw new Error('Увійдіть, щоб публікувати статті');
    const article = {
      id: 'a_' + Date.now(),
      title,
      category,
      author: user.name,
      date: new Date().toISOString().slice(0, 10),
      likes: 1,
      content,
      comments: []
    };
    db.articles.unshift(article);
    saveDB(db);
    return article;
  },

  async toggleLike(articleId) {
    const db = loadDB();
    const art = db.articles.find(a => a.id === articleId);
    if (art) {
      art.likes += 1;
      saveDB(db);
    }
    return art;
  },

  async addComment(articleId, text) {
    const db = loadDB();
    const user = db.users.find(u => u.id === db.currentUserId);
    if (!user) throw new Error('Увійдіть, щоб залишати коментарі');
    const art = db.articles.find(a => a.id === articleId);
    if (art) {
      art.comments.push({ id: 'cm_' + Date.now(), author: user.name, text });
      saveDB(db);
    }
    return art;
  },

  async deleteArticle(articleId) {
    const db = loadDB();
    db.articles = db.articles.filter(a => a.id !== articleId);
    saveDB(db);
  },

  async unlockChapter(chapterId, price) {
    const db = loadDB();
    const user = db.users.find(u => u.id === db.currentUserId);
    if (!user) throw new Error('Увійдіть у профіль для читання платних глав');
    if (user.unlockedChapters.includes(chapterId)) return true;
    if (user.coins < price) throw new Error('Недостатньо монет! Перегляньте рекламу, щоб поповнити баланс.');
    user.coins -= price;
    user.unlockedChapters.push(chapterId);
    saveDB(db);
    return true;
  },

  async addChapter({ bookId, newBookTitle, newBookDesc, chapTitle, price, content }) {
    const db = loadDB();
    const user = db.users.find(u => u.id === db.currentUserId);
    if (!user) throw new Error('Потрібна авторизація');

    let book = db.books.find(b => b.id === bookId);
    if (!book && newBookTitle.trim()) {
      book = {
        id: 'b_' + Date.now(),
        title: newBookTitle.trim(),
        author: user.name,
        description: newBookDesc.trim() || 'Авторська книга порталу tali_e_sin',
        chapters: []
      };
      db.books.unshift(book);
    }
    if (!book) throw new Error('Оберіть книгу або введіть назву нової');

    const newChap = {
      id: 'c_' + Date.now(),
      title: chapTitle,
      price: Number(price) || 0,
      content
    };
    book.chapters.push(newChap);
    user.unlockedChapters.push(newChap.id);
    saveDB(db);
    return book;
  }
};