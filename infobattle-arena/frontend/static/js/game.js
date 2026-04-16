// InfoBattle Arena - Клиентская логика игры

let currentGame = null;
let selectedBossId = null;
let socket = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    loadBosses();
    loadLeaderboard();
    setupEventListeners();
});

// Инициализация WebSocket соединения
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Подключено к серверу');
    });
    
    socket.on('leaderboard_update', (data) => {
        updateLeaderboard(data);
        updateCommunityProgress(data);
    });
    
    socket.on('game_update', (data) => {
        if (currentGame && data.game_id === currentGame.gameId) {
            updateGameState(data.state);
            if (data.battle_over) {
                endBattle(data.victory);
            }
        }
    });
}

// Загрузка боссов
async function loadBosses() {
    try {
        const response = await fetch('/api/bosses');
        const bosses = await response.json();
        
        const bossContainer = document.getElementById('boss-selection');
        bossContainer.innerHTML = '';
        
        bosses.forEach(boss => {
            const card = document.createElement('div');
            card.className = 'boss-card';
            card.dataset.bossId = boss.id;
            card.innerHTML = `
                <div class="boss-emoji">👾</div>
                <h4>${boss.name}</h4>
                <p>${boss.description}</p>
                <p>❤️ Здоровье: ${boss.health}</p>
            `;
            
            card.addEventListener('click', () => selectBoss(boss.id, card));
            bossContainer.appendChild(card);
        });
    } catch (error) {
        console.error('Ошибка загрузки боссов:', error);
    }
}

// Выбор босса
function selectBoss(bossId, cardElement) {
    // Снять выделение со всех карточек
    document.querySelectorAll('.boss-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Выделить выбранную карточку
    cardElement.classList.add('selected');
    selectedBossId = bossId;
    
    // Активировать кнопку начала битвы
    const startBtn = document.getElementById('start-battle-btn');
    startBtn.disabled = false;
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Начало битвы
    document.getElementById('start-battle-btn').addEventListener('click', startBattle);
    
    // Игра снова
    document.getElementById('play-again-btn').addEventListener('click', () => {
        showScreen('start-screen');
        currentGame = null;
        selectedBossId = null;
        document.querySelectorAll('.boss-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.getElementById('start-battle-btn').disabled = true;
    });
    
    // Ввод имени игрока
    document.getElementById('player-name').addEventListener('input', (e) => {
        const name = e.target.value.trim();
        const startBtn = document.getElementById('start-battle-btn');
        startBtn.disabled = !(name.length > 0 && selectedBossId);
    });
}

// Начало битвы
async function startBattle() {
    const playerName = document.getElementById('player-name').value.trim();
    
    if (!playerName || !selectedBossId) {
        alert('Введите имя и выберите босса!');
        return;
    }
    
    try {
        const response = await fetch('/api/start_game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                player_name: playerName,
                boss_id: selectedBossId
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentGame = {
                gameId: data.game_id,
                boss: data.boss,
                question: data.question
            };
            
            setupBattleScreen(data);
            showScreen('battle-screen');
        } else {
            alert('Ошибка: ' + data.error);
        }
    } catch (error) {
        console.error('Ошибка начала битвы:', error);
        alert('Не удалось начать битву. Проверьте соединение.');
    }
}

// Настройка экрана битвы
function setupBattleScreen(data) {
    document.getElementById('boss-name').textContent = data.boss.name;
    document.getElementById('boss-hp').textContent = `${data.boss.health}/${data.boss.max_health}`;
    document.getElementById('boss-health-fill').style.width = '100%';
    document.getElementById('player-name-display').textContent = document.getElementById('player-name').value.trim();
    document.getElementById('player-hp').textContent = '100/100';
    document.getElementById('player-health-fill').style.width = '100%';
    document.getElementById('score-value').textContent = '0';
    document.getElementById('battle-message').textContent = '';
    document.getElementById('battle-message').className = 'battle-message';
    
    displayQuestion(data.question);
}

// Отображение вопроса
function displayQuestion(question) {
    document.getElementById('question-text').textContent = question.question;
    
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    
    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.addEventListener('click', () => submitAnswer(index));
        optionsContainer.appendChild(button);
    });
}

// Отправка ответа
async function submitAnswer(answerIndex) {
    if (!currentGame) return;
    
    // Блокировка кнопок
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(btn => btn.disabled = true);
    
    try {
        const response = await fetch('/api/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                game_id: currentGame.gameId,
                answer_index: answerIndex
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Подсветка правильного/неправильного ответа
            buttons[answerIndex].classList.add(data.is_correct ? 'correct' : 'wrong');
            if (!data.is_correct && data.correct_answer !== undefined) {
                buttons[data.correct_answer].classList.add('correct');
            }
            
            // Показать сообщение
            const messageEl = document.getElementById('battle-message');
            messageEl.textContent = data.message;
            messageEl.className = 'battle-message ' + (data.is_correct ? 'success' : 'error');
            
            // Обновить состояние
            updateGameState(data.game_state);
            
            // Эффект попадания
            if (data.is_correct && data.damage) {
                showDamageEffect(data.damage);
            }
            
            // Проверка конца битвы
            if (data.battle_over) {
                setTimeout(() => endBattle(data.victory), 1500);
            } else if (data.next_question) {
                // Следующий вопрос через паузу
                setTimeout(() => {
                    displayQuestion(data.next_question);
                    currentGame.question = data.next_question;
                }, 1000);
            }
        } else {
            alert('Ошибка: ' + data.error);
            buttons.forEach(btn => btn.disabled = false);
        }
    } catch (error) {
        console.error('Ошибка отправки ответа:', error);
        alert('Не удалось отправить ответ. Проверьте соединение.');
        buttons.forEach(btn => btn.disabled = false);
    }
}

// Обновление состояния игры
function updateGameState(state) {
    if (!state) return;
    
    // Обновление здоровья босса
    const bossHealthPercent = (state.boss_health / state.max_boss_health) * 100;
    document.getElementById('boss-hp').textContent = `${state.boss_health}/${state.max_boss_health}`;
    document.getElementById('boss-health-fill').style.width = `${bossHealthPercent}%`;
    
    // Обновление здоровья игрока
    document.getElementById('player-hp').textContent = `${state.player_health}/100`;
    document.getElementById('player-health-fill').style.width = `${state.player_health}%`;
    
    // Обновление счёта
    document.getElementById('score-value').textContent = state.score;
}

// Показ эффекта урона
function showDamageEffect(damage) {
    const effectEl = document.getElementById('boss-damage-effect');
    effectEl.textContent = `-${damage}`;
    effectEl.classList.add('show');
    
    const bossEmoji = document.getElementById('boss-image');
    bossEmoji.classList.add('hit');
    
    setTimeout(() => {
        effectEl.classList.remove('show');
        bossEmoji.classList.remove('hit');
    }, 1000);
}

// Конец битвы
function endBattle(victory) {
    const resultScreen = document.getElementById('result-screen');
    const resultTitle = document.getElementById('result-title');
    const resultEmoji = document.getElementById('result-emoji');
    const resultMessage = document.getElementById('result-message');
    const finalScoreValue = document.getElementById('final-score-value');
    
    if (victory) {
        resultTitle.textContent = '🎉 ПОБЕДА! 🎉';
        resultEmoji.textContent = '🏆';
        resultMessage.textContent = 'Босс повержен твоими знаниями! Ты настоящий герой информатики!';
        resultTitle.style.color = '#55efc4';
    } else {
        resultTitle.textContent = '💪 Не сдавайся! 💪';
        resultEmoji.textContent = '📚';
        resultMessage.textContent = 'Попробуй ещё раз! Знания приходят с практикой!';
        resultTitle.style.color = '#ff7675';
    }
    
    finalScoreValue.textContent = currentGame ? document.getElementById('score-value').textContent : '0';
    
    showScreen('result-screen');
    
    // Перезагрузка таблицы лидеров
    loadLeaderboard();
}

// Загрузка таблицы лидеров
async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        updateLeaderboard(data);
        updateCommunityProgress(data);
    } catch (error) {
        console.error('Ошибка загрузки таблицы лидеров:', error);
    }
}

// Обновление таблицы лидеров
function updateLeaderboard(data) {
    const leaderboardEl = document.getElementById('leaderboard');
    
    if (!data.leaderboard || data.leaderboard.length === 0) {
        leaderboardEl.innerHTML = '<div class="loading">Пока нет героев. Стань первым!</div>';
        return;
    }
    
    leaderboardEl.innerHTML = '';
    
    data.leaderboard.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <span class="rank">#${index + 1}</span>
            <span class="player-name">${escapeHtml(entry.name)}</span>
            <span class="player-score">${entry.score} оч.</span>
        `;
        leaderboardEl.appendChild(item);
    });
}

// Обновление общего прогресса
function updateCommunityProgress(data) {
    const totalScoreEl = document.getElementById('total-score');
    const totalPlayersEl = document.getElementById('total-players');
    const progressFillEl = document.getElementById('community-progress-fill');
    
    totalScoreEl.textContent = data.total_score || 0;
    totalPlayersEl.textContent = data.total_players || 0;
    
    // Расчет процента прогресса (цель - 10000 очков)
    const goal = 10000;
    const percent = Math.min((data.total_score / goal) * 100, 100);
    progressFillEl.style.width = `${percent}%`;
}

// Переключение экранов
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
