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
const roomLanguageSelect = document.getElementById('room-language');
const roomQuestionsInput = document.getElementById('room-questions');
const roomTimerInput = document.getElementById('room-timer');
const roomPasswordInput = document.getElementById('room-password');

createRoomBtn.onclick = () => {
  const roomName = roomNameInput.value.trim() || 'Salle de quiz';
  const language = roomLanguageSelect.value;
  const maxQuestions = parseInt(roomQuestionsInput.value) || 5;
  const timerDuration = parseInt(roomTimerInput.value) || 20;
  const password = roomPasswordInput.value.trim() || null;
  
  // Get selected categories
  const selectedCategories = [];
  document.querySelectorAll('.category-checkbox:checked').forEach(cb => {
    selectedCategories.push(cb.value);
  });

  if (selectedCategories.length === 0) {
    alert('Veuillez sélectionner au moins une catégorie !');
    return;
  }

  // Get selected difficulties
  const selectedDifficulties = [];
  document.querySelectorAll('.difficulty-checkbox:checked').forEach(cb => {
    selectedDifficulties.push(cb.value);
  });

  if (selectedDifficulties.length === 0) {
    alert('Veuillez sélectionner au moins une difficulté !');
    return;
  }

  socket.emit('create-room', {
    name: roomName,
    difficulties: selectedDifficulties,
    language: language,
    categories: selectedCategories,
    maxQuestions: maxQuestions,
    timerDuration: timerDuration,
    password: password
  });
};

// Room list
const roomsContainer = document.getElementById('rooms-container');
const roomSearchInput = document.getElementById('room-search');

// Store all rooms for filtering
let allRooms = [];

// Filter rooms based on search input
roomSearchInput.addEventListener('input', () => {
  displayRooms(allRooms);
});

// Language flags mapping
const languageFlags = {
  'fr': '🇫🇷',
  'en': '🇬🇧',
  'de': '🇩🇪',
  'es': '🇪🇸',
  'it': '🇮🇹',
  'nl': '🇳🇱'
};

function loadRooms() {
  socket.emit('get-rooms');
}

socket.on('rooms-list', (rooms) => {
  allRooms = rooms;
  displayRooms(rooms);
});

function displayRooms(rooms) {
  const searchTerm = roomSearchInput.value.toLowerCase().trim();
  
  // Filter rooms by search term
  let filteredRooms = rooms;
  if (searchTerm) {
    filteredRooms = rooms.filter(room => 
      room.name.toLowerCase().includes(searchTerm)
    );
  }
  
  // Sort rooms: last room first, then started games, then others
  const sortedRooms = [...filteredRooms].sort((a, b) => {
    // Last room comes first
    if (a.isLastRoom && !b.isLastRoom) return -1;
    if (!a.isLastRoom && b.isLastRoom) return 1;
    
    // Then started games
    if (a.gameStarted && !b.gameStarted) return -1;
    if (!a.gameStarted && b.gameStarted) return 1;
    
    return 0;
  });
  
  if (sortedRooms.length === 0) {
    if (searchTerm) {
      roomsContainer.innerHTML = '<p class="loading">Aucune salle trouvée pour cette recherche.</p>';
    } else {
      roomsContainer.innerHTML = '<p class="loading">Aucune salle disponible. Créez-en une !</p>';
    }
    return;
  }

  roomsContainer.innerHTML = '';
  sortedRooms.forEach(room => {
    const roomDiv = document.createElement('div');
    roomDiv.className = 'room-item';
    if (room.isLastRoom) {
      roomDiv.classList.add('last-room');
    }
    if (room.gameStarted) {
      roomDiv.classList.add('game-started');
    }
    
    const languageFlag = languageFlags[room.language] || '🌐';
    const difficultiesText = room.difficulties ? room.difficulties.join(', ') : room.difficulty;
    const passwordIcon = room.hasPassword ? '🔒 ' : '';
    const gameStatus = room.gameStarted ? ' | ⏳ En cours' : '';
    const lastRoomBadge = room.isLastRoom ? '<span class="last-room-badge">🔄 Votre dernière salle</span>' : '';
    
    roomDiv.innerHTML = `
      <div class="room-info">
        <h4>${passwordIcon}${room.name} ${lastRoomBadge}</h4>
        <p>👥 ${room.players}/${room.maxPlayers} joueurs | 🎯 ${difficultiesText} | ${languageFlag} ${room.language.toUpperCase()} | 📚 ${room.categories.length} catégories${gameStatus}</p>
        <p class="room-settings-info">📝 ${room.maxQuestions} questions | ⏱️ ${room.timerDuration}s par question</p>
      </div>
      <button class="btn-join" onclick="joinRoom('${room.id}', ${room.hasPassword})">Rejoindre</button>
    `;
    roomsContainer.appendChild(roomDiv);
  });
}

window.joinRoom = (roomId, hasPassword) => {
  if (hasPassword) {
    const password = prompt('🔒 Cette salle est protégée par un mot de passe :');
    if (password === null) return; // User cancelled
    socket.emit('join-room', { roomId, password });
  } else {
    socket.emit('join-room', { roomId });
  }
};

// Handle join errors
socket.on('join-error', (error) => {
  alert(error.message);
  if (error.requiresPassword) {
    // Retry with password prompt
    // The user will need to click join again
  }
});

// Room view
const roomTitle = document.getElementById('room-title');
const playersContainer = document.getElementById('players-container');
const startGameBtn = document.getElementById('start-game');
const leaveRoomBtn = document.getElementById('leave-room');
const leaveRoomGameBtn = document.getElementById('leave-room-game');
const toggleRoomSettingsBtn = document.getElementById('toggle-room-settings');
const roomSettingsDiv = document.getElementById('room-settings');
const saveRoomSettingsBtn = document.getElementById('save-room-settings');

socket.on('room-joined', (room) => {
  currentRoom = room;
  lobby.classList.add('hidden');
  roomView.classList.remove('hidden');
  roomTitle.textContent = `🚪 ${room.name}`;
  updatePlayersList(room.players);
  
  // Show/hide settings button based on host status
  if (room.host === socket.id) {
    startGameBtn.disabled = room.players.length < 1;
    toggleRoomSettingsBtn.classList.remove('hidden');
    loadRoomSettings(room);
  } else {
    startGameBtn.disabled = true;
    startGameBtn.textContent = '⏳ En attente de l\'hôte...';
    toggleRoomSettingsBtn.classList.add('hidden');
  }
});

socket.on('room-updated', (room) => {
  currentRoom = room;
  updatePlayersList(room.players);
  
  // Update game leaderboard in real-time during gameplay
  if (room.gameStarted) {
    updateGameLeaderboard(room.players);
  }
  
  if (room.host === socket.id) {
    startGameBtn.disabled = room.players.length < 1;
    toggleRoomSettingsBtn.classList.remove('hidden');
  } else {
    toggleRoomSettingsBtn.classList.add('hidden');
  }
  
  // Update settings if visible
  if (!roomSettingsDiv.classList.contains('hidden')) {
    loadRoomSettings(room);
  }
});

function updatePlayersList(players) {
  playersContainer.innerHTML = '';
  players.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item';
    if (!player.connected) {
      playerDiv.classList.add('disconnected');
    }
    
    const playerNameClass = player.connected ? 'player-name' : 'player-name disconnected';
    const disconnectedText = !player.connected ? ' (déconnecté)' : '';
    
    playerDiv.innerHTML = `
      <span class="${playerNameClass}">${player.name}${player.id === currentRoom.host ? ' 👑' : ''}${disconnectedText}</span>
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

leaveRoomGameBtn.onclick = () => {
  if (confirm('Êtes-vous sûr de vouloir quitter la partie en cours ? Votre score sera conservé si vous revenez.')) {
    socket.emit('leave-room');
    roomView.classList.add('hidden');
    lobby.classList.remove('hidden');
    document.getElementById('game-box').classList.add('hidden');
    stopTimer();
    loadRooms();
  }
};

toggleRoomSettingsBtn.onclick = () => {
  if (roomSettingsDiv.classList.contains('hidden')) {
    roomSettingsDiv.classList.remove('hidden');
    toggleRoomSettingsBtn.textContent = '🔼 Masquer les paramètres';
  } else {
    roomSettingsDiv.classList.add('hidden');
    toggleRoomSettingsBtn.textContent = '⚙️ Modifier les paramètres';
  }
};

function loadRoomSettings(room) {
  // Load difficulties
  const roomDifficulties = room.difficulties || [room.difficulty];
  document.querySelectorAll('.edit-difficulty-checkbox').forEach(cb => {
    cb.checked = roomDifficulties.includes(cb.value);
  });
  
  // Load categories
  document.querySelectorAll('.edit-category-checkbox').forEach(cb => {
    cb.checked = room.categories.includes(cb.value);
  });
  
  // Load questions and timer
  document.getElementById('edit-room-questions').value = room.maxQuestions || 5;
  document.getElementById('edit-room-timer').value = room.timerDuration || 20;
}

saveRoomSettingsBtn.onclick = () => {
  // Get selected difficulties
  const selectedDifficulties = [];
  document.querySelectorAll('.edit-difficulty-checkbox:checked').forEach(cb => {
    selectedDifficulties.push(cb.value);
  });

  if (selectedDifficulties.length === 0) {
    alert('Veuillez sélectionner au moins une difficulté !');
    return;
  }

  // Get selected categories
  const selectedCategories = [];
  document.querySelectorAll('.edit-category-checkbox:checked').forEach(cb => {
    selectedCategories.push(cb.value);
  });

  if (selectedCategories.length === 0) {
    alert('Veuillez sélectionner au moins une catégorie !');
    return;
  }

  const maxQuestions = parseInt(document.getElementById('edit-room-questions').value) || 5;
  const timerDuration = parseInt(document.getElementById('edit-room-timer').value) || 20;

  socket.emit('update-room-settings', {
    roomId: currentRoom.id,
    difficulties: selectedDifficulties,
    categories: selectedCategories,
    maxQuestions: maxQuestions,
    timerDuration: timerDuration
  });

  roomSettingsDiv.classList.add('hidden');
  toggleRoomSettingsBtn.textContent = '⚙️ Modifier les paramètres';
};

// Game logic
const gameBox = document.getElementById('game-box');
const roomControls = document.getElementById('room-controls');
const multiQuestionBox = document.getElementById('multi-question-box');
const multiQuestionEl = document.getElementById('multi-question');
const multiAnswersEl = document.getElementById('multi-answers');
const multiResultEl = document.getElementById('multi-result');
const timerDisplay = document.getElementById('timer-display');
const timerBar = document.getElementById('timer-bar');
const timerContainer = document.getElementById('timer-container');
const gameLeaderboard = document.getElementById('game-leaderboard');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send');
const questionDifficultyBadge = document.getElementById('question-difficulty-badge');

let timerInterval = null;
let currentTimerDuration = 20;

function startTimer(duration) {
  currentTimerDuration = duration;
  let timeRemaining = duration;
  timerDisplay.textContent = timeRemaining;
  timerBar.style.width = '100%';
  timerBar.className = 'timer-bar';
  timerDisplay.className = 'timer-display';
  
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  timerInterval = setInterval(() => {
    timeRemaining--;
    timerDisplay.textContent = timeRemaining;
    
    const percentage = (timeRemaining / currentTimerDuration) * 100;
    timerBar.style.width = percentage + '%';
    
    // Change color based on time remaining
    if (timeRemaining <= 5) {
      timerDisplay.className = 'timer-display danger';
      timerBar.className = 'timer-bar danger';
    } else if (timeRemaining <= 10) {
      timerDisplay.className = 'timer-display warning';
      timerBar.className = 'timer-bar warning';
    }
    
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

startGameBtn.onclick = () => {
  socket.emit('start-game');
};

socket.on('game-started', () => {
  gameBox.classList.remove('hidden');
  roomControls.classList.add('hidden'); // Hide start/leave buttons during game
  startGameBtn.disabled = true;
  multiResultEl.classList.add('hidden');
  timerContainer.classList.remove('hidden');
  updateGameLeaderboard(currentRoom.players); // Initialize leaderboard
});

socket.on('new-question', (question) => {
  multiResultEl.classList.add('hidden');
  multiQuestionEl.textContent = question.question;
  multiAnswersEl.innerHTML = '';
  
  // Display difficulty badge
  if (question.difficulty) {
    questionDifficultyBadge.classList.remove('hidden', 'easy', 'medium', 'hard');
    questionDifficultyBadge.textContent = question.difficulty;
    
    // Add color class based on difficulty
    if (question.difficulty === 'Débutant') {
      questionDifficultyBadge.classList.add('easy');
    } else if (question.difficulty === 'Confirmé') {
      questionDifficultyBadge.classList.add('medium');
    } else if (question.difficulty === 'Expert') {
      questionDifficultyBadge.classList.add('hard');
    }
  } else {
    questionDifficultyBadge.classList.add('hidden');
  }
  
  // Start timer
  if (question.timerDuration) {
    startTimer(question.timerDuration);
  }

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
        // Don't stop timer - let it continue running
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
        // Don't stop timer - let it continue running
      }
    };
    multiAnswersEl.appendChild(input);
    multiAnswersEl.appendChild(submitBtn);
  }
});

socket.on('answer-result', (result) => {
  multiResultEl.classList.remove('hidden');
  
  let additionalInfoHtml = '';
  if (result.additionalInfo) {
    additionalInfoHtml = `<div style="margin-top: 15px; padding: 15px; background: #e7f3ff; border-left: 4px solid #2196F3; border-radius: 5px;">
      <strong>ℹ️ Info complémentaire :</strong><br>
      ${result.additionalInfo}
    </div>`;
  }
  
  let sourceHtml = '';
  if (result.sourceUrl) {
    sourceHtml = `<div style="margin-top: 10px; font-size: 0.9em;">
      <a href="${result.sourceUrl}" target="_blank" style="color: #2196F3; text-decoration: none;">📚 Source</a>
    </div>`;
  }
  
  if (result.correct) {
    multiResultEl.innerHTML = `<div style="background: #d4edda; color: #155724; padding: 20px; border-radius: 10px; text-align: center; font-weight: 600;">
      ✅ Bonne réponse ! +10 points<br>
      Réponse correcte : ${result.correctAnswer}
      ${additionalInfoHtml}
      ${sourceHtml}
    </div>`;
  } else {
    multiResultEl.innerHTML = `<div style="background: #f8d7da; color: #721c24; padding: 20px; border-radius: 10px; text-align: center; font-weight: 600;">
      ❌ Mauvaise réponse<br>
      Réponse correcte : ${result.correctAnswer}
      ${additionalInfoHtml}
      ${sourceHtml}
    </div>`;
  }
  
  // Update scores and leaderboard
  if (currentRoom) {
    updatePlayersList(currentRoom.players);
    updateGameLeaderboard(currentRoom.players);
  }
});

socket.on('game-ended', (results) => {
  stopTimer();
  gameBox.classList.add('hidden');
  roomControls.classList.remove('hidden'); // Show start/leave buttons again
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

// Update game leaderboard with sorted players
function updateGameLeaderboard(players) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  
  gameLeaderboard.innerHTML = '';
  sortedPlayers.forEach((player, index) => {
    const playerDiv = document.createElement('div');
    playerDiv.className = `leaderboard-player position-${index + 1}`;
    if (!player.connected) {
      playerDiv.classList.add('disconnected');
    }
    playerDiv.setAttribute('data-player-id', player.id);
    
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
    const nameClass = player.connected ? 'leaderboard-name' : 'leaderboard-name disconnected';
    const disconnectedText = !player.connected ? ' (déco)' : '';
    
    playerDiv.innerHTML = `
      <div class="leaderboard-player-info">
        <span class="leaderboard-position">${medal || (index + 1)}</span>
        <span class="${nameClass}">${player.name}${disconnectedText}</span>
      </div>
      <span class="leaderboard-score">${player.score}</span>
    `;
    
    gameLeaderboard.appendChild(playerDiv);
  });
}

// Chat functionality
chatSendBtn.onclick = () => {
  sendChatMessage();
};

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
});

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (message && currentRoom) {
    socket.emit('chat-message', {
      roomId: currentRoom.id,
      message: message
    });
    chatInput.value = '';
  }
}

// Receive chat messages
socket.on('chat-message', (data) => {
  displayChatMessage(data);
});

function displayChatMessage(data) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  
  const time = new Date(data.timestamp).toLocaleTimeString('fr-FR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  messageDiv.innerHTML = `
    <div class="chat-message-header">
      <span class="chat-message-author">${data.author}</span>
      <span class="chat-message-time">${time}</span>
    </div>
    <div class="chat-message-text">${escapeHtml(data.message)}</div>
  `;
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Refresh rooms list periodically (every 1 second)
setInterval(() => {
  if (!lobby.classList.contains('hidden')) {
    loadRooms();
  }
}, 1000);
