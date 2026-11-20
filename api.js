const SUPABASE_URL = 'https://pxvydxpbrdpjkbroonwv.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_sFE27f6RWBwS5rpNaOZszw_J6Nv7r_w';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const SESSION_KEY = 'taliesin_current_user_id';

function buildHistoryItem(label, delta) {
  return {
    id: 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    label,
    delta,
    date: new Date().toLocaleDateString('uk-UA')
  };
}

window.TaliesinAPI = {
  async getState() {
    const [usersRes, articlesRes, booksRes] = await Promise.all([
      sbClient.from('profiles').select('*'),
      sbClient.from('articles').select('*').order('created_at', { ascending: false }),
      sbClient.from('books').select('*').order('created_at', { ascending: false })
    ]);

    const users = (usersRes.data || []).map(u => ({
      ...u,
      unlockedChapters: u.unlocked_chapters || [],
      coinHistory: u.coin_history || []
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
    let { data: user } = await sbClient
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
        unlocked_chapters: [],
        coin_history: [buildHistoryItem('Вітальний дар гільдії', +30)]
      };
      const { data, error } = await sbClient.from('profiles').insert(newUser).select().single();
      if (error) throw new Error(error.message);
      user = data;
    }

    localStorage.setItem(SESSION_KEY, user.id);
    return {
      ...user,
      unlockedChapters: user.unlocked_chapters || [],
      coinHistory: user.coin_history || []
    };
  },

  async switchDemoRole(role) {
    const email = role === 'admin' ? 'bard@taliesin.wales' : 'reader@taliesin.wales';
    const name = role === 'admin' ? 'Талієсін Бард' : 'Керідвен';
    return this.login(email, name, role);
  },

  async logout() {
    localStorage.removeItem(SESSION_KEY);
  },

  async updateProfileName(newName) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Потрібна авторизація');
    const cleanName = newName.trim();
    if (!cleanName) throw new Error('Введіть коректне ім’я');

    const { error } = await sbClient.from('profiles').update({ name: cleanName }).eq('id', userId);
    if (error) throw new Error(error.message);
  },

  async addCoins(amount) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Потрібна авторизація');

    const { data: user } = await sbClient.from('profiles').select('coins, coin_history').eq('id', userId).single();
    const updatedCoins = (user?.coins || 0) + amount;
    const updatedHistory = [buildHistoryItem('Перегляд послання меценатів', +amount), ...(user?.coin_history || [])].slice(0, 30);

    const { error } = await sbClient.from('profiles').update({
      coins: updatedCoins,
      coin_history: updatedHistory
    }).eq('id', userId);

    if (error) throw new Error(error.message);
    return updatedCoins;
  },

  async createArticle({ title, category, content }) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Увійдіть, щоб публікувати статті');

    const { data: user } = await sbClient.from('profiles').select('name').eq('id', userId).single();
    const { data, error } = await sbClient.from('articles').insert({
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
    const { data: art } = await sbClient.from('articles').select('likes').eq('id', articleId).single();
    if (!art) return;
    await sbClient.from('articles').update({ likes: art.likes + 1 }).eq('id', articleId);
  },

  async addComment(articleId, text) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Увійдіть, щоб залишати коментарі');

    const [{ data: user }, { data: art }] = await Promise.all([
      sbClient.from('profiles').select('name').eq('id', userId).single(),
      sbClient.from('articles').select('comments').eq('id', articleId).single()
    ]);

    const nextComments = [...(art.comments || []), { id: 'cm_' + Date.now(), author: user.name, text }];
    await sbClient.from('articles').update({ comments: nextComments }).eq('id', articleId);
  },

  async deleteArticle(articleId) {
    await sbClient.from('articles').delete().eq('id', articleId);
  },

  async unlockChapter(chapterId, price, chapterTitle = 'Глава книги', authorId = null) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Увійдіть у профіль для читання платних глав');

    const { data: user } = await sbClient.from('profiles').select('*').eq('id', userId).single();
    const unlocked = user.unlocked_chapters || [];

    if (unlocked.includes(chapterId)) return true;
    if (user.coins < price) throw new Error('Недостатньо монет! Перегляньте рекламу, щоб поповнити баланс.');

    const nextHistory = [
      buildHistoryItem(`Розблоковано: «${chapterTitle}»`, -price),
      ...(user.coin_history || [])
    ].slice(0, 30);

    const { error } = await sbClient.from('profiles').update({
      coins: user.coins - price,
      unlocked_chapters: [...unlocked, chapterId],
      coin_history: nextHistory
    }).eq('id', userId);

    if (error) throw new Error(error.message);

    if (authorId && authorId !== userId) {
      const royalty = Math.max(1, Math.ceil(price * 0.8));
      const { data: author } = await sbClient.from('profiles').select('coins, coin_history').eq('id', authorId).maybeSingle();
      if (author) {
        const authorHistory = [
          buildHistoryItem(`Роялті за главу «${chapterTitle}»`, +royalty),
          ...(author.coin_history || [])
        ].slice(0, 30);
        await sbClient.from('profiles').update({
          coins: (author.coins || 0) + royalty,
          coin_history: authorHistory
        }).eq('id', authorId);
      }
    }

    return true;
  },

  async addChapter({ bookId, newBookTitle, newBookDesc, chapTitle, price, content }) {
    const userId = localStorage.getItem(SESSION_KEY);
    if (!userId) throw new Error('Потрібна авторизація');

    const { data: user } = await sbClient.from('profiles').select('*').eq('id', userId).single();
    const newChap = {
      id: 'c_' + Date.now(),
      title: chapTitle,
      price: Number(price) || 0,
      content
    };

    let targetBookId = bookId;

    if (!targetBookId && newBookTitle.trim()) {
      const { data: createdBook, error } = await sbClient.from('books').insert({
        title: newBookTitle.trim(),
        author: user.name,
        author_id: userId,
        description: newBookDesc.trim() || 'Авторська книга порталу tali_e_sin',
        chapters: [newChap]
      }).select().single();

      if (error) throw new Error(error.message);
      targetBookId = createdBook.id;
    } else if (targetBookId) {
      const { data: existingBook } = await sbClient.from('books').select('chapters').eq('id', targetBookId).single();
      const updatedChapters = [...(existingBook.chapters || []), newChap];
      await sbClient.from('books').update({ chapters: updatedChapters }).eq('id', targetBookId);
    } else {
      throw new Error('Оберіть книгу або введіть назву нової');
    }

    const unlocked = [...(user.unlocked_chapters || []), newChap.id];
    await sbClient.from('profiles').update({ unlocked_chapters: unlocked }).eq('id', userId);
  }
};
