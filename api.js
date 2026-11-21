const SUPABASE_URL = 'https://pxvydxpbrdpjkbroonwv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sFE27f6RWBwS5rpNaOZszw_J6Nv7r_w';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getGuestId() {
  let gid = localStorage.getItem('taliesin_guest_id');
  if (!gid) {
    gid = 'g_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem('taliesin_guest_id', gid);
  }
  return gid;
}

window.TaliesinAPI = {
  async getState() {
    const [{ data: sessionData }, usersRes, articlesRes, booksRes] = await Promise.all([
      sbClient.auth.getSession(),
      sbClient.from('profiles').select('*'),
      sbClient.from('articles').select('*').order('created_at', { ascending: false }),
      sbClient.from('books').select('*').order('created_at', { ascending: false })
    ]);

    const currentUserId = sessionData?.session?.user?.id || null;

    const users = (usersRes.data || []).map(u => ({
      ...u,
      bio: u.bio || '',
      unlockedChapters: u.unlocked_chapters || [],
      coinHistory: u.coin_history || [],
      favoriteBooks: Array.isArray(u.favorite_books) ? u.favorite_books : [],
      favoriteArticles: Array.isArray(u.favorite_articles) ? u.favorite_articles : [],
      readingProgress: (u.reading_progress && typeof u.reading_progress === 'object') ? u.reading_progress : {}
    }));

    return {
      users,
      currentUserId,
      articles: articlesRes.data || [],
      books: booksRes.data || []
    };
  },

  async register({ name, email, password }) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (password.length < 6) throw new Error('Пароль має містити щонайменше 6 символів');

    const { data, error } = await sbClient.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { name: cleanName || cleanEmail.split('@')[0] }
      }
    });

    if (error) throw new Error(error.message);
    await sbClient.rpc('claim_guest_logs', { p_guest_id: getGuestId() });
    return data.user;
  },

  async login({ email, password }) {
    const { data, error } = await sbClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });

    if (error) throw new Error('Невірний email або пароль');
    await sbClient.rpc('claim_guest_logs', { p_guest_id: getGuestId() });
    return data.user;
  },

  async logout() {
    await sbClient.auth.signOut();
  },

  async updateProfileName(newName) {
    const { data: { user } } = await sbClient.auth.getUser();
    if (!user) throw new Error('Потрібна авторизація');
    const cleanName = newName.trim();
    if (!cleanName) throw new Error('Введіть коректне ім’я');

    const { error } = await sbClient.from('profiles').update({ name: cleanName }).eq('id', user.id);
    if (error) throw new Error(error.message);
  },

  async updateProfileInfo({ name, bio }) {
    const { data: { user } } = await sbClient.auth.getUser();
    if (!user) throw new Error('Потрібна авторизація');
    const cleanName = name.trim();
    if (!cleanName) throw new Error('Введіть коректне ім’я');

    const cleanBio = String(bio || '').trim().slice(0, 240);
    const { error } = await sbClient
      .from('profiles')
      .update({ name: cleanName, bio: cleanBio })
      .eq('id', user.id);

    if (error) throw new Error(error.message);
  },

  async toggleFavoriteBook(bookId) {
    const { data: { session } } = await sbClient.auth.getSession();
    if (!session?.user) throw new Error('Увійдіть, щоб додавати книги в Обране');

    const uid = session.user.id;
    const { data: prof, error: fetchErr } = await sbClient
      .from('profiles')
      .select('favorite_books')
      .eq('id', uid)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);

    const current = Array.isArray(prof?.favorite_books) ? prof.favorite_books : [];
    const exists = current.includes(bookId);
    const updated = exists ? current.filter(id => id !== bookId) : [...current, bookId];

    const { error } = await sbClient
      .from('profiles')
      .update({ favorite_books: updated })
      .eq('id', uid);

    if (error) throw new Error(error.message);
    return !exists;
  },

  async toggleFavoriteArticle(articleId) {
    const { data: { session } } = await sbClient.auth.getSession();
    if (!session?.user) throw new Error('Увійдіть, щоб додавати статті в Обране');

    const uid = session.user.id;
    const { data: prof, error: fetchErr } = await sbClient
      .from('profiles')
      .select('favorite_articles')
      .eq('id', uid)
      .single();

    if (fetchErr) throw new Error(fetchErr.message);

    const current = Array.isArray(prof?.favorite_articles) ? prof.favorite_articles : [];
    const exists = current.includes(articleId);
    const updated = exists ? current.filter(id => id !== articleId) : [...current, articleId];

    const { error } = await sbClient
      .from('profiles')
      .update({ favorite_articles: updated })
      .eq('id', uid);

    if (error) throw new Error(error.message);
    return !exists;
  },

  async saveReadingBookmark(bookId, chapterId) {
    const { data: { session } } = await sbClient.auth.getSession();
    if (!session?.user) return;

    const uid = session.user.id;
    const { data: prof } = await sbClient
      .from('profiles')
      .select('reading_progress')
      .eq('id', uid)
      .single();

    const current = (prof?.reading_progress && typeof prof.reading_progress === 'object')
      ? prof.reading_progress
      : {};

    if (current[bookId] === chapterId) return;

    const updated = { ...current, [bookId]: chapterId };
    await sbClient
      .from('profiles')
      .update({ reading_progress: updated })
      .eq('id', uid);
  },

  async addCoins(amount = 15) {
    const { data, error } = await sbClient.rpc('claim_ad_reward', { reward_amount: amount });
    if (error) throw new Error(error.message);
    return data;
  },

  async createArticle({ title, category, content }) {
    const { data: { user } } = await sbClient.auth.getUser();
    if (!user) throw new Error('Увійдіть, щоб публікувати статті');

    const { data: profile } = await sbClient.from('profiles').select('name').eq('id', user.id).single();
    const { data, error } = await sbClient.from('articles').insert({
      title,
      category,
      author: profile.name,
      author_id: user.id,
      date: new Date().toISOString().slice(0, 10),
      likes: 1,
      content,
      comments: []
    }).select().single();

    if (error) throw new Error(error.message);
    return data;
  },

  async updateArticle(articleId, { title, category, content }) {
    const { error } = await sbClient.from('articles').update({
      title: title.trim(),
      category,
      content: content.trim()
    }).eq('id', articleId);

    if (error) throw new Error(error.message);
  },

  async toggleLike(articleId) {
    const { data: art } = await sbClient.from('articles').select('likes').eq('id', articleId).single();
    if (!art) return;
    await sbClient.from('articles').update({ likes: art.likes + 1 }).eq('id', articleId);
  },

  async addComment(articleId, text) {
    const { data: { user } } = await sbClient.auth.getUser();
    if (!user) throw new Error('Увійдіть, щоб залишати коментарі');

    const [{ data: profile }, { data: art }] = await Promise.all([
      sbClient.from('profiles').select('name').eq('id', user.id).single(),
      sbClient.from('articles').select('comments').eq('id', articleId).single()
    ]);

    const nextComments = [...(art.comments || []), { id: 'cm_' + Date.now(), author: profile.name, text }];
    await sbClient.from('articles').update({ comments: nextComments }).eq('id', articleId);
  },

  async deleteArticle(articleId) {
    const { error } = await sbClient.from('articles').delete().eq('id', articleId);
    if (error) throw new Error(error.message);
  },

  async unlockChapter(chapterId, price, chapterTitle = 'Глава книги', authorId = null) {
    const { data, error } = await sbClient.rpc('purchase_chapter', {
      p_chapter_id: chapterId,
      p_price: Number(price),
      p_chapter_title: chapterTitle,
      p_author_id: authorId || ''
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async addChapter({ bookId, newBookTitle, newBookDesc, chapTitle, price, content }) {
    const { data: { user } } = await sbClient.auth.getUser();
    if (!user) throw new Error('Потрібна авторизація');

    const { data: profile } = await sbClient.from('profiles').select('*').eq('id', user.id).single();
    const newChap = {
      id: 'c_' + Date.now(),
      title: chapTitle,
      price: Number(price) || 0,
      content
    };

    if (!bookId && newBookTitle.trim()) {
      const { error } = await sbClient.from('books').insert({
        title: newBookTitle.trim(),
        author: profile.name,
        author_id: user.id,
        description: newBookDesc.trim() || 'Авторська книга порталу tali_e_sin',
        chapters: [newChap]
      });
      if (error) throw new Error(error.message);
    } else if (bookId) {
      const { data: existingBook } = await sbClient.from('books').select('chapters').eq('id', bookId).single();
      const updatedChapters = [...(existingBook.chapters || []), newChap];
      const { error } = await sbClient.from('books').update({ chapters: updatedChapters }).eq('id', bookId);
      if (error) throw new Error(error.message);
    } else {
      throw new Error('Оберіть книгу або введіть назву нової');
    }

    const unlocked = [...(profile.unlocked_chapters || []), newChap.id];
    await sbClient.from('profiles').update({ unlocked_chapters: unlocked }).eq('id', user.id);
  },

  async updateBookInfo(bookId, { title, description }) {
    const { error } = await sbClient.from('books').update({
      title: title.trim(),
      description: description.trim()
    }).eq('id', bookId);
    if (error) throw new Error(error.message);
  },

  async updateChapter(bookId, chapterId, { title, price, content }) {
    const { data: book, error: fetchErr } = await sbClient.from('books').select('chapters').eq('id', bookId).single();
    if (fetchErr || !book) throw new Error('Книгу не знайдено');

    const updatedChapters = (book.chapters || []).map(ch =>
      ch.id === chapterId
        ? { ...ch, title: title.trim(), price: Math.max(0, Number(price) || 0), content: content.trim() }
        : ch
    );

    const { error } = await sbClient.from('books').update({ chapters: updatedChapters }).eq('id', bookId);
    if (error) throw new Error(error.message);
  },

  async adminAdjustUserCoins(targetUserId, delta) {
    const numericDelta = Number(delta);
    if (!numericDelta || Number.isNaN(numericDelta)) throw new Error('Вкажіть ненульову кількість монет');
    const { data, error } = await sbClient.rpc('admin_adjust_coins', {
      p_target_id: targetUserId,
      p_delta: numericDelta,
      p_guest_id: getGuestId()
    });
    if (error) throw new Error(error.message);
    if (data === 'DENIED') throw new Error('Доступ заборонено (інцидент зафіксовано)');
  },

  async adminToggleUserRole(targetUserId, nextRole) {
    const { data, error } = await sbClient.rpc('admin_set_role', {
      p_target_id: targetUserId,
      p_role: nextRole,
      p_guest_id: getGuestId()
    });
    if (error) throw new Error(error.message);
    if (data === 'DENIED') throw new Error('Доступ заборонено (інцидент зафіксовано)');
  },

  async getSecurityLogs() {
    const { data } = await sbClient
      .from('security_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  },

  async clearSecurityLogs() {
    await sbClient.from('security_logs').delete().neq('id', 0);
  },

  async adminDeleteComment(articleId, commentId) {
    const { data: art } = await sbClient.from('articles').select('comments').eq('id', articleId).single();
    if (!art) return;
    const filtered = (art.comments || []).filter(c => c.id !== commentId);
    await sbClient.from('articles').update({ comments: filtered }).eq('id', articleId);
  },

  async adminDeleteBook(bookId) {
    const { error } = await sbClient.from('books').delete().eq('id', bookId);
    if (error) throw new Error(error.message);
  },

  async adminDeleteChapter(bookId, chapterId) {
    const { data: book } = await sbClient.from('books').select('chapters').eq('id', bookId).single();
    if (!book) return;
    const filtered = (book.chapters || []).filter(c => c.id !== chapterId);
    await sbClient.from('books').update({ chapters: filtered }).eq('id', bookId);
  }
};
