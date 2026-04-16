"""
InfoBattle Arena - Серверная часть
Запускается на Windows сервере, хранит данные и логику игры.
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import json
import os
import random
from datetime import datetime

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Пути к данным
DATA_DIR = os.path.join(os.path.dirname(__file__), '../data')
QUESTIONS_FILE = os.path.join(DATA_DIR, 'questions.json')
PLAYERS_FILE = os.path.join(DATA_DIR, 'players.json')
LEADERBOARD_FILE = os.path.join(DATA_DIR, 'leaderboard.json')

# Инициализация данных
def init_data():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    if not os.path.exists(QUESTIONS_FILE):
        default_questions = {
            "bosses": [
                {
                    "id": 1,
                    "name": "Бит Базовый",
                    "description": "Хранитель основ информатики",
                    "health": 100,
                    "questions": [
                        {
                            "question": "Что такое бит?",
                            "options": ["Минимальная единица информации", "Большой файл", "Программа", "Вирус"],
                            "correct": 0,
                            "damage": 25
                        },
                        {
                            "question": "Сколько бит в одном байте?",
                            "options": ["4", "8", "16", "32"],
                            "correct": 1,
                            "damage": 25
                        },
                        {
                            "question": "Что означает аббревиатура CPU?",
                            "options": ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Computer Process Unit"],
                            "correct": 0,
                            "damage": 25
                        },
                        {
                            "question": "Какая система счисления используется в компьютерах?",
                            "options": ["Десятичная", "Двоичная", "Восьмеричная", "Шестнадцатеричная"],
                            "correct": 1,
                            "damage": 25
                        }
                    ]
                },
                {
                    "id": 2,
                    "name": "Гига Громовержец",
                    "description": "Повелитель больших данных",
                    "health": 150,
                    "questions": [
                        {
                            "question": "Что такое алгоритм?",
                            "options": ["Набор инструкций для решения задачи", "Тип вируса", "Часть компьютера", "Игра"],
                            "correct": 0,
                            "damage": 30
                        },
                        {
                            "question": "Какой язык программирования используется для веб-разработки?",
                            "options": ["Только Python", "JavaScript", "Только C++", "Только Java"],
                            "correct": 1,
                            "damage": 30
                        },
                        {
                            "question": "Что такое HTML?",
                            "options": ["Язык разметки", "Язык программирования", "База данных", "Операционная система"],
                            "correct": 0,
                            "damage": 30
                        },
                        {
                            "question": "Для чего нужен CSS?",
                            "options": ["Для стилизации веб-страниц", "Для создания баз данных", "Для шифрования", "Для игр"],
                            "correct": 0,
                            "damage": 30
                        },
                        {
                            "question": "Что такое переменная в программировании?",
                            "options": ["Константа", "Хранилище данных", "Функция", "Цикл"],
                            "correct": 1,
                            "damage": 30
                        }
                    ]
                }
            ]
        }
        with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_questions, f, ensure_ascii=False, indent=2)
    
    if not os.path.exists(PLAYERS_FILE):
        with open(PLAYERS_FILE, 'w', encoding='utf-8') as f:
            json.dump({}, f, ensure_ascii=False, indent=2)
    
    if not os.path.exists(LEADERBOARD_FILE):
        with open(LEADERBOARD_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False, indent=2)

# Хранилище активных игр
active_games = {}

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend/static', path)

@app.route('/api/bosses', methods=['GET'])
def get_bosses():
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return jsonify(data['bosses'])

@app.route('/api/start_game', methods=['POST'])
def start_game():
    data = request.json
    player_name = data.get('player_name', 'Игрок')
    boss_id = int(data.get('boss_id', 1))
    
    # Загрузка вопроса о боссе
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        questions_data = json.load(f)
    
    boss = None
    for b in questions_data['bosses']:
        if b['id'] == boss_id:
            boss = b
            break
    
    if not boss:
        return jsonify({'error': 'Босс не найден'}), 404
    
    game_id = f"{player_name}_{datetime.now().timestamp()}"
    active_games[game_id] = {
        'player_name': player_name,
        'boss_id': boss_id,
        'boss_health': boss['health'],
        'max_boss_health': boss['health'],
        'player_health': 100,
        'current_question_index': 0,
        'score': 0,
        'questions': boss['questions']
    }
    
    return jsonify({
        'game_id': game_id,
        'boss': {
            'name': boss['name'],
            'description': boss['description'],
            'health': boss['health'],
            'max_health': boss['health']
        },
        'question': boss['questions'][0]
    })

@app.route('/api/answer', methods=['POST'])
def answer_question():
    data = request.json
    game_id = data.get('game_id')
    answer_index = int(data.get('answer_index', -1))
    
    if game_id not in active_games:
        return jsonify({'error': 'Игра не найдена'}), 404
    
    game = active_games[game_id]
    
    if game['current_question_index'] >= len(game['questions']):
        return jsonify({'error': 'Вопросы закончились'}), 400
    
    current_question = game['questions'][game['current_question_index']]
    is_correct = (answer_index == current_question['correct'])
    
    result = {
        'is_correct': is_correct,
        'correct_answer': current_question['correct'],
        'message': ''
    }
    
    if is_correct:
        damage = current_question['damage']
        game['boss_health'] -= damage
        game['score'] += 10
        result['message'] = f"Правильно! Босс получил {damage} урона."
        result['damage'] = damage
    else:
        damage = 10
        game['player_health'] -= damage
        result['message'] = f"Неправильно! Вы получили {damage} урона."
        result['damage'] = damage
    
    # Проверка результата боя
    if game['boss_health'] <= 0:
        game['boss_health'] = 0
        result['battle_over'] = True
        result['victory'] = True
        result['message'] = "Победа! Босс повержен!"
        update_leaderboard(game['player_name'], game['score'])
    elif game['player_health'] <= 0:
        game['player_health'] = 0
        result['battle_over'] = True
        result['victory'] = False
        result['message'] = "Поражение! Попробуйте снова."
    else:
        game['current_question_index'] += 1
        if game['current_question_index'] < len(game['questions']):
            result['next_question'] = game['questions'][game['current_question_index']]
        else:
            # Если вопросы кончились, но босс еще жив
            result['battle_over'] = True
            result['victory'] = game['boss_health'] <= 0
    
    result['game_state'] = {
        'boss_health': game['boss_health'],
        'max_boss_health': game['max_boss_health'],
        'player_health': game['player_health'],
        'score': game['score']
    }
    
    # Отправка обновления всем клиентам через WebSocket
    socketio.emit('game_update', {
        'game_id': game_id,
        'state': result['game_state'],
        'battle_over': result.get('battle_over', False),
        'victory': result.get('victory', False)
    })
    
    return jsonify(result)

def update_leaderboard(player_name, score):
    try:
        with open(LEADERBOARD_FILE, 'r', encoding='utf-8') as f:
            leaderboard = json.load(f)
    except:
        leaderboard = []
    
    # Добавление или обновление записи игрока
    found = False
    for entry in leaderboard:
        if entry['name'] == player_name:
            if score > entry['score']:
                entry['score'] = score
                entry['date'] = datetime.now().isoformat()
            found = True
            break
    
    if not found:
        leaderboard.append({
            'name': player_name,
            'score': score,
            'date': datetime.now().isoformat()
        })
    
    # Сортировка по очкам
    leaderboard.sort(key=lambda x: x['score'], reverse=True)
    leaderboard = leaderboard[:100]  # Топ 100
    
    with open(LEADERBOARD_FILE, 'w', encoding='utf-8') as f:
        json.dump(leaderboard, f, ensure_ascii=False, indent=2)
    
    # Обновление общего прогресса
    total_score = sum(entry['score'] for entry in leaderboard)
    socketio.emit('leaderboard_update', {
        'leaderboard': leaderboard[:10],
        'total_score': total_score,
        'total_players': len(leaderboard)
    })

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    try:
        with open(LEADERBOARD_FILE, 'r', encoding='utf-8') as f:
            leaderboard = json.load(f)
    except:
        leaderboard = []
    
    leaderboard.sort(key=lambda x: x['score'], reverse=True)
    
    total_score = sum(entry['score'] for entry in leaderboard)
    
    return jsonify({
        'leaderboard': leaderboard[:10],
        'total_score': total_score,
        'total_players': len(leaderboard)
    })

@socketio.on('connect')
def handle_connect():
    print('Клиент подключился')
    # Отправка текущего состояния таблицы лидеров
    try:
        with open(LEADERBOARD_FILE, 'r', encoding='utf-8') as f:
            leaderboard = json.load(f)
        leaderboard.sort(key=lambda x: x['score'], reverse=True)
        total_score = sum(entry['score'] for entry in leaderboard)
        emit('leaderboard_update', {
            'leaderboard': leaderboard[:10],
            'total_score': total_score,
            'total_players': len(leaderboard)
        })
    except:
        pass

if __name__ == '__main__':
    init_data()
    print("🎮 InfoBattle Arena сервер запущен!")
    print("🌐 Откройте в браузере: http://localhost:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
