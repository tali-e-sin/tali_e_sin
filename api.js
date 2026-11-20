const SUPABASE_URL = 'https://pxvydxpbrdpjkbroonwv.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_sFE27f6RWBwS5rpNaOZszw_J6Nv7r_w';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SESSION_KEY = 'taliesin_current_user_id';

window.TaliesinAPI = {
  async getState() {
    const [usersRes, articlesRes, booksRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('articles').select('*').order('created_at', { ascending: false }),
      supabase.from('books').select('*').order('created_at', { ascending: false })
    ]);

    const users = (usersRes.data || []).map(u => ({
      ...u,
      unlockedChapters: u.unlocked_chapters || []
    }));

    return {
      users,
      currentUserId: localStorage.getItem(SESSION_KEY) || null,
      articles: articlesRes.data || [],
      books: booksRes.data || []
    };
  },

  async login(email, name, role = 'user') {
    const cleanEmail = email.trim().toLowerCase();
    let { data: user } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (!user) {
      const newUser = {
        id: 'u_' + Date.now(),
        name: name.trim() || cleanEmail.split('@')[0],
        email: cleanEmail,
        role,
        coins: 30,
        unlocked_chapters: []
      };
      const { data, error } = await supabase.from('profiles').insert(newUser).select().single();
      if (error) throw new Error(error.message);
      user = data;
    }

    localStorage.setItem(SESSION_KEY, user.id);
    return { ...user, unlockedChapters: user.unlocked_chapters || [] };
  },

  async switchDemoRole(role) {
    const email = role === 'admin' ? 'bard@taliesin.wales' : 'reader@taliesin.wales';
    const name = role === 'admin' ? 'Талієсін Бард' : 'Керідвен';
    return this.login(email, name, role);
  },

  async logout() {
    localStorage.removeItem(SESSION_KEY);
  },

  async addCoins(amount) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Потрібна авторизація');

    const { data: user } = await supabase.from('profiles').select('coins').eq('id', userId).single();
    const updatedCoins = (user?.coins || 0) + amount;

    const { error } = await supabase.from('profiles').update({ coins: updatedCoins }).eq('id', userId);
    if (error) throw new Error(error.message);
    return updatedCoins;
  },

  async createArticle({ title, category, content }) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Увійдіть, щоб публікувати статті');

    const { data: user } = await supabase.from('profiles').select('name').eq('id', userId).single();
    const { data, error } = await supabase.from('articles').insert({
      title,
      category,
      author: user.name,
      date: new Date().toISOString().slice(0, 10),
      likes: 1,
      content,
      comments: []
    }).select().single();

    if (error) throw new Error(error.message);
    return data;
  },

  async toggleLike(articleId) {
    const { data: art } = await supabase.from('articles').select('likes').eq('id', articleId).single();
    if (!art) return;
    await supabase.from('articles').update({ likes: art.likes + 1 }).eq('id', articleId);
  },

  async addComment(articleId, text) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Увійдіть, щоб залишати коментарі');

    const [{ data: user }, { data: art }] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', userId).single(),
      supabase.from('articles').select('comments').eq('id', articleId).single()
    ]);

    const nextComments = [...(art.comments || []), { id: 'cm_' + Date.now(), author: user.name, text }];
    await supabase.from('articles').update({ comments: nextComments }).eq('id', articleId);
  },

  async deleteArticle(articleId) {
    await supabase.from('articles').delete().eq('id', articleId);
  },

  async unlockChapter(chapterId, price) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Увійдіть у профіль для читання платних глав');

    const { data: user } = await supabase.from('profiles').select('*').eq('id', userId).single();
    const unlocked = user.unlocked_chapters || [];

    if (unlocked.includes(chapterId)) return true;
    if (user.coins < price) throw new Error('Недостатньо монет! Перегляньте рекламу, щоб поповнити баланс.');

    const { error } = await supabase.from('profiles').update({
      coins: user.coins - price,
      unlocked_chapters: [...unlocked, chapterId]
    }).eq('id', userId);

    if (error) throw new Error(error.message);
    return true;
  },

  async addChapter({ bookId, newBookTitle, newBookDesc, chapTitle, price, content }) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Потрібна авторизація');

    const { data: user } = await supabase.from('profiles').select('*').eq('id', userId).single();
    const newChap = {
      id: 'c_' + Date.now(),
      title: chapTitle,
      price: Number(price) || 0,
      content
    };

    let targetBookId = bookId;

    if (!targetBookId && newBookTitle.trim()) {
      const { data: createdBook, error } = await supabase.from('books').insert({
        title: newBookTitle.trim(),
        author: user.name,
        description: newBookDesc.trim() || 'Авторська книга порталу tali_e_sin',
        chapters: [newChap]
      }).select().single();

      if (error) throw new Error(error.message);
      targetBookId = createdBook.id;
    } else if (targetBookId) {
      const { data: existingBook } = await supabase.from('books').select('chapters').eq('id', targetBookId).single();
      const updatedChapters = [...(existingBook.chapters || []), newChap];
      await supabase.from('books').update({ chapters: updatedChapters }).eq('id', targetBookId);
    } else {
      throw new Error('Оберіть книгу або введіть назву нової');
    }

    // Автоматично відкриваємо автору його власну главу
    const unlocked = [...(user.unlocked_chapters || []), newChap.id];
    await supabase.from('profiles').update({ unlocked_chapters: unlocked }).eq('id', userId);
  }
};
