// ==========================================
// БАЗОВІ ДАНІ ТА СХОВИЩЕ
// ==========================================
function loadFromLocalStorage(defaultData) {
    try {
        const raw = localStorage.getItem('boardgames');
        return raw ? JSON.parse(raw) : defaultData;
    } catch (error) {
        console.error('Пошкоджені дані в localStorage: - script.js:9', error);
        return defaultData;
    }
}

const defaultGames = [
    { id: 1, title: 'Каркасон', minPlayers: 2, maxPlayers: 5, genre: 'Стратегія', img: 'assets/img/carcassonne.jpg', owned: false, description: 'Класична гра про розбудову середньовічної Франції.' },
    { id: 2, title: 'Манчкін', minPlayers: 3, maxPlayers: 6, genre: 'Карткова', img: 'assets/img/munchkin.jpg', owned: false, description: 'Пародія на рольові ігри.' },
    { id: 3, title: 'Діксіт', minPlayers: 3, maxPlayers: 8, genre: 'Асоціації', img: 'assets/img/dixit.jpg', owned: false, description: 'Гра на асоціації з неймовірними ілюстраціями.' },
    { id: 4, title: 'Козаки', minPlayers: 2, maxPlayers: 4, genre: 'Стратегія', img: 'assets/img/Cossacs.jpg', owned: false, description: 'Історична гра про українських козаків.' },
    { id: 5, title: 'Вуаля', minPlayers: 2, maxPlayers: 6, genre: 'Карткова', img: 'assets/img/Wualia.jpg', owned: false, description: 'Швидка гра на реакцію.' }
];

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('BoardGamesDB', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('games')) {
                db.createObjectStore('games', { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveGameToDB(game) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('games', 'readwrite');
        tx.objectStore('games').put(game);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getAllGamesFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('games', 'readonly');
        const request = tx.objectStore('games').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function migrateDataIfNeeded() {
    const isMigrated = localStorage.getItem('migratedToIDB');
    if (!isMigrated) {
        const oldData = loadFromLocalStorage(defaultGames);
        if (oldData.length > 0) {
            for (const game of oldData) {
                await saveGameToDB(game);
            }
        }
        localStorage.setItem('migratedToIDB', 'true');
    }
}

// ==========================================
// РОУТЕР ТА МАРШРУТИЗАТОР
// ==========================================
const routes = [
    { path: '/', view: 'CatalogView' },
    { path: '/games/:id', view: 'GameDetailView' },
    { path: '/owned', view: 'OwnedView' }
];

function matchRoute(path) {
    const pathParts = path.split('/').filter(Boolean);
    for (const route of routes) {
        const routeParts = route.path.split('/').filter(Boolean);
        if (routeParts.length !== pathParts.length) continue;
        
        const params = {};
        const isMatch = routeParts.every((part, i) => {
            if (part.startsWith(':')) {
                params[part.slice(1)] = pathParts[i];
                return true;
            }
            return part === pathParts[i];
        });
        
        if (isMatch) return { view: route.view, params };
    }
    return null;
}

// ==========================================
// VUE КОМПОНЕНТИ ТА ДОДАТОК
// ==========================================
const GameCard = {
    props: ['id', 'title', 'minPlayers', 'maxPlayers', 'genre', 'img', 'owned', 'isGameOfTheDay'],
    emits: ['filter', 'toggle-owned'],
    template: `
        <article class="card" :class="{ 'card-owned': owned, 'game-of-the-day': isGameOfTheDay }">
            <h3>{{ title }}</h3>
            <span class="badge">👥 {{ minPlayers }}–{{ maxPlayers }} гравців</span>
            <img :src="img" :alt="'Обкладинка гри ' + title">
            <p class="genre-text" @click="$emit('filter', genre)">
                Жанр: <span class="genre-link">{{ genre }}</span>
            </p>
            
            <!-- Убрали лишний style="..." отсюда -->
            <a :href="'#/games/' + id" class="btn-detail">📖 Детальніше</a>
            
            <button 
                :class="['btn-status', owned ? 'btn-played' : 'btn-not-played']" 
                @click="$emit('toggle-owned', id)">
                {{ owned ? '✅ Зіграно' : '❌ Не зіграно' }}
            </button>
        </article>
    `
};

const App = {
    data() {
        return {
            currentGenre: '',
            games: [],
            gameOfTheDayId: null,
            currentRoute: { view: 'CatalogView', params: {} }
        };
    },
    async created() {
        await migrateDataIfNeeded();
        this.games = await getAllGamesFromDB();
        
        if (this.games.length === 0) {
            for(const g of defaultGames) await saveGameToDB(g);
            this.games = await getAllGamesFromDB();
        }

        if (this.games.length > 0) {
            const randomIndex = Math.floor(Math.random() * this.games.length);
            this.gameOfTheDayId = this.games[randomIndex].id;
        }

        this.handleHashChange();
        window.addEventListener('hashchange', () => this.handleHashChange());
    },
    computed: {
        filteredGames() {
            if (!this.currentGenre) return this.games;
            return this.games.filter(game => game.genre === this.currentGenre);
        },
        currentGame() {
            const id = Number(this.currentRoute.params.id);
            return this.games.find(g => g.id === id) || null;
        },
        ownedGames() {
            return this.games.filter(g => g.owned);
        }
    },
    methods: {
        handleHashChange() {
            const hashPath = location.hash.slice(1) || '/';
            const matched = matchRoute(hashPath);
            if (matched) {
                this.currentRoute = matched;
            } else {
                this.currentRoute = { view: 'NotFoundView', params: {} };
            }
            window.scrollTo(0, 0);
        },
        setGenreFilter(genre) {
            this.currentGenre = genre;
        },
        async toggleOwned(id) {
            const game = this.games.find(g => g.id === id);
            if (game) {
                game.owned = !game.owned;
                await saveGameToDB(game);
            }
        }
    },
    template: `
        <div>
            <header>
                <h1>Каталог настільних ігор</h1>
                <nav class="nav-menu">
                    <a href="#/">Всі ігри</a>
                    <a href="#/owned">Зіграні ігри</a>
                </nav>
            </header>

            <main class="container">
                <!-- VIEW: КАТАЛОГ -->
                <div v-if="currentRoute.view === 'CatalogView'">
                    <div class="filter-section" style="text-align: center; margin-bottom: 20px;">
                        <p>Активний фільтр жанру: <b>{{ currentGenre || 'Всі жанри' }}</b></p>
                        <button v-if="currentGenre" @click="currentGenre = ''" class="reset-btn">Скинути фільтр</button>
                    </div>

                    <transition-group name="list" tag="div" class="cards">
                        <game-card 
                            v-for="game in filteredGames" 
                            :key="game.id"
                            v-bind="game"
                            :is-game-of-the-day="game.id === gameOfTheDayId"
                            @filter="setGenreFilter"
                            @toggle-owned="toggleOwned">
                        </game-card>
                    </transition-group>
                </div>

                <!-- VIEW: ЗІГРАНІ ІГРИ -->
                <div v-else-if="currentRoute.view === 'OwnedView'">
                    <h2 style="text-align:center;">Мої зіграні ігри ({{ ownedGames.length }})</h2>
                    <div class="cards" v-if="ownedGames.length > 0">
                        <game-card 
                            v-for="game in ownedGames" 
                            :key="game.id"
                            v-bind="game"
                            :is-game-of-the-day="game.id === gameOfTheDayId"
                            @filter="setGenreFilter"
                            @toggle-owned="toggleOwned">
                        </game-card>
                    </div>
                    <p v-else style="text-align:center; padding: 40px;">Ви ще не додали жодної гри до зіграних.</p>
                </div>

                <!-- VIEW: ДЕТАЛІ ГРИ -->
                <div v-else-if="currentRoute.view === 'GameDetailView'">
                    <div v-if="currentGame" class="game-detail">
                        <a href="#/" class="btn-back">⬅ Назад до каталогу</a>
                        <div class="detail-content" style="display: flex; gap: 30px; margin-top: 20px; flex-wrap: wrap;">
                            <img :src="currentGame.img" :alt="currentGame.title" style="max-width: 400px; border-radius: 8px;">
                            <div>
                                <h2>{{ currentGame.title }}</h2>
                                <p class="badge">👥 {{ currentGame.minPlayers }}–{{ currentGame.maxPlayers }} гравців</p>
                                <p><b>Жанр:</b> {{ currentGame.genre }}</p>
                                <p>{{ currentGame.description }}</p>
                                <button 
                                    :class="['btn-status', currentGame.owned ? 'btn-played' : 'btn-not-played']" 
                                    @click="toggleOwned(currentGame.id)" style="max-width: 200px; margin-top: 20px;">
                                    {{ currentGame.owned ? '✅ Зіграно' : '❌ Не зіграно' }}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div v-else style="text-align:center; padding: 50px;">
                        <h2>Гру не знайдено</h2>
                        <a href="#/" class="btn-back">На головну</a>
                    </div>
                </div>

                <!-- VIEW: 404 -->
                <div v-else style="text-align:center; padding: 50px;">
                    <h2>404 — Сторінку не знайдено</h2>
                    <a href="#/" class="btn-back">На головну</a>
                </div>
            </main>
        </div>
    `
};

Vue.createApp(App).component('GameCard', GameCard).mount('#app');