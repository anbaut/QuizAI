// Initialize Socket.io - use relative URL for better portability
const socket = io();

// Connection status
const connectionStatus = document.getElementById('connection-status');

socket.on('connect', () => {
  connectionStatus.textContent = '✅ Connecté au serveur';
  connectionStatus.className = 'connection-status connected';
});

socket.on('disconnect', () => {
  connectionStatus.textContent = '⚠️ Déconnecté du serveur';
  connectionStatus.className = 'connection-status disconnected';
});

// Mode switching
const soloModeBtn = document.getElementById('solo-mode-btn');
const multiModeBtn = document.getElementById('multi-mode-btn');
const soloMode = document.getElementById('solo-mode');
const multiMode = document.getElementById('multi-mode');

soloModeBtn.onclick = () => {
  soloModeBtn.classList.add('active');
  multiModeBtn.classList.remove('active');
  soloMode.classList.remove('hidden');
  multiMode.classList.add('hidden');
};

multiModeBtn.onclick = () => {
  multiModeBtn.classList.add('active');
  soloModeBtn.classList.remove('active');
  multiMode.classList.remove('hidden');
  soloMode.classList.add('hidden');
};

// ===== SOLO MODE =====
const generateBtn = document.getElementById("generate");
const questionBox = document.getElementById("question-box");
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const solutionEl = document.getElementById("solution");
const showAnswerBtn = document.getElementById("show-answer");

generateBtn.onclick = async () => {
  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ Génération...';
  
  solutionEl.classList.add("hidden");
  answersEl.innerHTML = "";

  const category = document.getElementById("category").value;
  const difficulty = document.getElementById("difficulty").value;

  try {
    const res = await fetch("/api/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, difficulty })
    });

    const data = await res.json();

    questionBox.classList.remove("hidden");
    questionEl.textContent = data.question;

    if (data.type === "qcm") {
      data.choices.forEach(choice => {
        const div = document.createElement("div");
        div.className = "choice";
        div.textContent = choice;
        div.onclick = () => {
          document.querySelectorAll('.choice').forEach(c => c.classList.remove('selected'));
          div.classList.add('selected');
        };
        answersEl.appendChild(div);
      });
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "answer-input";
      input.placeholder = "Votre réponse...";
      answersEl.appendChild(input);
    }

    solutionEl.textContent = "✅ Réponse correcte : " + data.answer;
  } catch (error) {
    questionBox.classList.remove("hidden");
    questionEl.textContent = "❌ Erreur lors de la génération de la question. Vérifiez que le serveur LM Studio est démarré sur http://localhost:1234";
    questionEl.style.color = '#721c24';
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '🎲 Générer une question';
  }
};

showAnswerBtn.onclick = () => {
  solutionEl.classList.remove("hidden");
};

// ===== MULTIPLAYER MODE =====
let playerName = '';
let currentRoom = null;

const playerSetup = document.getElementById('player-setup');
const lobby = document.getElementById('lobby');
const roomView = document.getElementById('room');
const playerNameInput = document.getElementById('player-name');
const setPlayerNameBtn = document.getElementById('set-player-name');

// Set player name
setPlayerNameBtn.onclick = () => {
  const name = playerNameInput.value.trim();
  if (name) {
    playerName = name;
    playerSetup.classList.add('hidden');
    lobby.classList.remove('hidden');
    socket.emit('set-player-name', playerName);
    loadRooms();
  }
};

// Room creation
const createRoomBtn = document.getElementById('create-room');
const roomNameInput = document.getElementById('room-name');
const roomDifficultySelect = document.getElementById('room-difficulty');

createRoomBtn.onclick = () => {
  const roomName = roomNameInput.value.trim() || 'Salle de quiz';
  const difficulty = roomDifficultySelect.value;
  
  // Get selected categories
  const selectedCategories = [];
  document.querySelectorAll('.category-checkbox:checked').forEach(cb => {
    selectedCategories.push(cb.value);
  });

  if (selectedCategories.length === 0) {
    alert('Veuillez sélectionner au moins une catégorie !');
    return;
  }

  socket.emit('create-room', {
    name: roomName,
    difficulty: difficulty,
    categories: selectedCategories
  });
};

// Room list
const roomsContainer = document.getElementById('rooms-container');

function loadRooms() {
  socket.emit('get-rooms');
}

socket.on('rooms-list', (rooms) => {
  if (rooms.length === 0) {
    roomsContainer.innerHTML = '<p class="loading">Aucune salle disponible. Créez-en une !</p>';
    return;
  }

  roomsContainer.innerHTML = '';
  rooms.forEach(room => {
    const roomDiv = document.createElement('div');
    roomDiv.className = 'room-item';
    roomDiv.innerHTML = `
      <div class="room-info">
        <h4>${room.name}</h4>
        <p>👥 ${room.players}/${room.maxPlayers} joueurs | 🎯 ${room.difficulty} | 📚 ${room.categories.length} catégories</p>
      </div>
      <button class="btn-join" onclick="joinRoom('${room.id}')">Rejoindre</button>
    `;
    roomsContainer.appendChild(roomDiv);
  });
});

window.joinRoom = (roomId) => {
  socket.emit('join-room', roomId);
};

// Room view
const roomTitle = document.getElementById('room-title');
const playersContainer = document.getElementById('players-container');
const startGameBtn = document.getElementById('start-game');
const leaveRoomBtn = document.getElementById('leave-room');

socket.on('room-joined', (room) => {
  currentRoom = room;
  lobby.classList.add('hidden');
  roomView.classList.remove('hidden');
  roomTitle.textContent = `🚪 ${room.name}`;
  updatePlayersList(room.players);
  
  // Only host can start the game
  if (room.host === socket.id) {
    startGameBtn.disabled = room.players.length < 1;
  } else {
    startGameBtn.disabled = true;
    startGameBtn.textContent = '⏳ En attente de l\'hôte...';
  }
});

socket.on('room-updated', (room) => {
  currentRoom = room;
  updatePlayersList(room.players);
  
  if (room.host === socket.id) {
    startGameBtn.disabled = room.players.length < 1;
  }
});

function updatePlayersList(players) {
  playersContainer.innerHTML = '';
  players.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    playerDiv.innerHTML = `
      <span class="player-name">${player.name}${player.id === currentRoom.host ? ' 👑' : ''}</span>
      <span class="player-score">${player.score} pts</span>
    `;
    playersContainer.appendChild(playerDiv);
  });
}

leaveRoomBtn.onclick = () => {
  socket.emit('leave-room');
  roomView.classList.add('hidden');
  lobby.classList.remove('hidden');
  document.getElementById('game-box').classList.add('hidden');
  loadRooms();
};

// Game logic
const gameBox = document.getElementById('game-box');
const multiQuestionBox = document.getElementById('multi-question-box');
const multiQuestionEl = document.getElementById('multi-question');
const multiAnswersEl = document.getElementById('multi-answers');
const multiResultEl = document.getElementById('multi-result');

startGameBtn.onclick = () => {
  socket.emit('start-game');
};

socket.on('game-started', () => {
  gameBox.classList.remove('hidden');
  startGameBtn.disabled = true;
  multiResultEl.classList.add('hidden');
});

socket.on('new-question', (question) => {
  multiResultEl.classList.add('hidden');
  multiQuestionEl.textContent = question.question;
  multiAnswersEl.innerHTML = '';

  if (question.type === 'qcm') {
    question.choices.forEach(choice => {
      const div = document.createElement('div');
      div.className = 'choice';
      div.textContent = choice;
      div.onclick = () => {
        document.querySelectorAll('#multi-answers .choice').forEach(c => {
          c.classList.remove('selected');
          c.onclick = null;
        });
        div.classList.add('selected');
        socket.emit('submit-answer', choice);
      };
      multiAnswersEl.appendChild(div);
    });
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'answer-input';
    input.placeholder = 'Votre réponse...';
    const submitBtn = document.createElement('button');
    submitBtn.textContent = '✅ Valider';
    submitBtn.className = 'btn-primary';
    submitBtn.onclick = () => {
      if (input.value.trim()) {
        socket.emit('submit-answer', input.value.trim());
        input.disabled = true;
        submitBtn.disabled = true;
      }
    };
    multiAnswersEl.appendChild(input);
    multiAnswersEl.appendChild(submitBtn);
  }
});

socket.on('answer-result', (result) => {
  multiResultEl.classList.remove('hidden');
  if (result.correct) {
    multiResultEl.innerHTML = `<div style="background: #d4edda; color: #155724; padding: 20px; border-radius: 10px; text-align: center; font-weight: 600;">
      ✅ Bonne réponse ! +10 points<br>
      Réponse correcte : ${result.correctAnswer}
    </div>`;
  } else {
    multiResultEl.innerHTML = `<div style="background: #f8d7da; color: #721c24; padding: 20px; border-radius: 10px; text-align: center; font-weight: 600;">
      ❌ Mauvaise réponse<br>
      Réponse correcte : ${result.correctAnswer}
    </div>`;
  }
  
  // Update scores
  if (currentRoom) {
    updatePlayersList(currentRoom.players);
  }
});

socket.on('game-ended', (results) => {
  gameBox.classList.add('hidden');
  startGameBtn.disabled = false;
  
  let resultsHtml = '<div class="controls"><h3>🏆 Résultats finaux</h3>';
  results.forEach((player, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
    resultsHtml += `<div class="player-item">
      <span class="player-name">${medal} ${player.name}</span>
      <span class="player-score">${player.score} pts</span>
    </div>`;
  });
  resultsHtml += '</div>';
  
  multiResultEl.innerHTML = resultsHtml;
  multiResultEl.classList.remove('hidden');
});

socket.on('room-deleted', (data) => {
  alert(data.message);
  roomView.classList.add('hidden');
  lobby.classList.remove('hidden');
  document.getElementById('game-box').classList.add('hidden');
  currentRoom = null;
  loadRooms();
});

// Refresh rooms list periodically (every 1 second)
setInterval(() => {
  if (!lobby.classList.contains('hidden')) {
    loadRooms();
  }
}, 1000);
