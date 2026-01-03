import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";
import csv from "csv-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// 🚨 Vérifie bien le nom du modèle dans LM Studio
const LM_MODEL = "mistral-7b-instruct-v0.3"; // ex: "mistral-7b-instruct"

const LM_URL = "http://localhost:1234/v1/chat/completions";

// Timer configuration
const QUESTION_TRANSITION_BUFFER_SECONDS = 3; // Buffer time after timer expires before next question

// Store rooms and players
const rooms = new Map();
const players = new Map();

// Store questions loaded from CSV
let questionsDatabase = [];

// Load questions from CSV
function loadQuestionsFromCSV() {
  return new Promise((resolve, reject) => {
    const questions = [];
    const csvPath = join(__dirname, 'questions.csv');
    
    fs.createReadStream(csvPath)
      .pipe(csv({ headers: false }))
      .on('data', (row) => {
        // CSV structure: id, lang, question, answer1, answer2, answer3, answer4, difficulty, info, url
        const rowArray = Object.values(row);
        if (rowArray.length >= 9) {
          questions.push({
            id: rowArray[0],
            language: rowArray[1],
            question: rowArray[2],
            choices: [rowArray[3], rowArray[4], rowArray[5], rowArray[6]], // First choice is always correct
            answer: rowArray[3], // First choice is the correct answer
            difficulty: rowArray[7],
            additionalInfo: rowArray[8],
            sourceUrl: rowArray[9] || '',
            category: 'Culture générale' // All questions are general knowledge
          });
        }
      })
      .on('end', () => {
        console.log(`✅ Loaded ${questions.length} questions from CSV`);
        resolve(questions);
      })
      .on('error', (error) => {
        console.error('❌ Error loading CSV:', error);
        reject(error);
      });
  });
}

// Initialize questions database
loadQuestionsFromCSV().then(questions => {
  questionsDatabase = questions;
}).catch(err => {
  console.error('Failed to load questions:', err);
});

// Broadcast rooms list to all connected clients
function broadcastRoomsList() {
  const roomsList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    difficulties: room.difficulties || [room.difficulty], // Support both formats
    language: room.language,
    categories: room.categories,
    players: room.players.length,
    maxPlayers: room.maxPlayers,
    gameStarted: room.gameStarted
  })).filter(room => !room.gameStarted);
  
  io.emit('rooms-list', roomsList);
}

// Clean up rooms older than 20 minutes
function cleanupOldRooms() {
  const twentyMinutesAgo = Date.now() - (20 * 60 * 1000);
  let deletedCount = 0;
  
  rooms.forEach((room, roomId) => {
    if (room.createdAt && room.createdAt < twentyMinutesAgo) {
      // Notify all players in the room
      io.to(roomId).emit('room-deleted', { message: 'La salle a été automatiquement supprimée après 20 minutes.' });
      
      // Remove players from room
      room.players.forEach(player => {
        const playerData = players.get(player.id);
        if (playerData) {
          playerData.roomId = null;
        }
      });
      
      // Delete the room
      rooms.delete(roomId);
      deletedCount++;
      console.log(`🗑️ Salle supprimée (20 min): ${room.name}`);
    }
  });
  
  if (deletedCount > 0) {
    broadcastRoomsList();
  }
}

// Run cleanup every minute
setInterval(cleanupOldRooms, 60000);

app.post("/api/question", async (req, res) => {
  const { category, difficulty } = req.body;

  const prompt = `
Tu es un générateur de questions pour un jeu.

Catégorie : ${category}
Difficulté : ${difficulty}

Règles :
- Une seule question
- Langue : français
- Si difficulté = Facile ou Moyen → QCM
- Si difficulté = Difficile → réponse libre
- Pas d'explications
- Pas de texte autour du JSON

Réponds STRICTEMENT au format JSON suivant :

{
  "question": "string",
  "type": "qcm" ou "text",
  "choices": ["string"],
  "answer": "string"
}
`;

  try {
    const response = await fetch(LM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LM_MODEL,
        messages: [
          { role: "system", content: "Tu es un assistant de jeu qui génère des questions." },
          { role: "user", content: prompt }
        ],
        temperature: 0.8
      })
    });

    const data = await response.json();

    // ✅ Sécurisation JSON : on retire les ```json ``` éventuels
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(content);
    res.json(parsed);

  } catch (err) {
    console.error("❌ Erreur IA :", err);
    res.status(500).json({ error: "Erreur génération IA" });
  }
});

// Socket.io for multiplayer
io.on('connection', (socket) => {
  console.log('✅ Joueur connecté:', socket.id);

  socket.on('set-player-name', (name) => {
    players.set(socket.id, {
      id: socket.id,
      name: name,
      score: 0,
      roomId: null
    });
    console.log(`👤 ${name} s'est connecté`);
  });

  socket.on('create-room', (config) => {
    const player = players.get(socket.id);
    if (!player) return;

    const roomId = `room-${Date.now()}`;
    const room = {
      id: roomId,
      name: config.name,
      difficulties: config.difficulties || [config.difficulty], // Support both array and single value for backward compatibility
      categories: config.categories,
      language: config.language || 'fr', // Default to French
      host: socket.id,
      players: [],
      maxPlayers: 10,
      gameStarted: false,
      currentQuestion: null,
      questionCount: 0,
      maxQuestions: config.maxQuestions || 5,
      timerDuration: config.timerDuration || 20,
      createdAt: Date.now()
    };

    rooms.set(roomId, room);
    
    // Auto-join creator directly
    socket.join(roomId);
    player.roomId = roomId;
    player.score = 0;
    
    room.players.push({
      id: player.id,
      name: player.name,
      score: player.score,
      hasAnswered: false,
      connected: true
    });

    socket.emit('room-joined', room);
    
    // Broadcast updated rooms list to all clients
    broadcastRoomsList();
    
    console.log(`🚪 Salle créée: ${config.name} (${roomId}) par ${player.name} - Langue: ${room.language}`);
  });

  socket.on('get-rooms', () => {
    const roomsList = Array.from(rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      difficulties: room.difficulties || [room.difficulty], // Support both formats
      language: room.language,
      categories: room.categories,
      players: room.players.length,
      maxPlayers: room.maxPlayers,
      gameStarted: room.gameStarted
    })).filter(room => !room.gameStarted);
    
    socket.emit('rooms-list', roomsList);
  });

  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    const player = players.get(socket.id);

    if (!room || !player) return;

    // Check if player was previously in this room (reconnection)
    const existingPlayer = room.players.find(p => p.name === player.name);
    
    if (existingPlayer) {
      // Reconnecting player - restore their data
      existingPlayer.id = socket.id;
      existingPlayer.connected = true;
      player.roomId = roomId;
      socket.join(roomId);
      socket.emit('room-joined', room);
      io.to(roomId).emit('room-updated', room);
      console.log(`🔄 ${player.name} s'est reconnecté à ${room.name}`);
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit('error', 'Salle pleine');
      return;
    }

    // Leave previous room if any
    if (player.roomId) {
      socket.leave(player.roomId);
      const prevRoom = rooms.get(player.roomId);
      if (prevRoom) {
        prevRoom.players = prevRoom.players.filter(p => p.id !== socket.id);
      }
    }

    socket.join(roomId);
    player.roomId = roomId;
    player.score = 0;
    
    room.players.push({
      id: player.id,
      name: player.name,
      score: player.score,
      hasAnswered: false,
      connected: true
    });

    socket.emit('room-joined', room);
    io.to(roomId).emit('room-updated', room);
    broadcastRoomsList();
    
    console.log(`👥 ${player.name} a rejoint ${room.name}`);
  });

  socket.on('leave-room', () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (room) {
      // Find the player in the room
      const roomPlayer = room.players.find(p => p.id === socket.id);
      
      if (room.gameStarted && roomPlayer) {
        // During game: mark as disconnected but keep in the room
        roomPlayer.connected = false;
        socket.leave(player.roomId);
        io.to(player.roomId).emit('room-updated', room);
        console.log(`👋 ${player.name} s'est déconnecté de ${room.name} (en jeu)`);
      } else {
        // Before game: remove completely
        room.players = room.players.filter(p => p.id !== socket.id);
        socket.leave(player.roomId);
        
        // If host left, assign new host or delete room
        if (room.host === socket.id) {
          if (room.players.length > 0) {
            room.host = room.players[0].id;
            io.to(player.roomId).emit('room-updated', room);
            broadcastRoomsList();
          } else {
            rooms.delete(player.roomId);
            console.log(`🚪 Salle supprimée: ${room.name}`);
            broadcastRoomsList();
          }
        } else {
          io.to(player.roomId).emit('room-updated', room);
          broadcastRoomsList();
        }
        
        console.log(`👋 ${player.name} a quitté ${room.name}`);
      }
    }
    
    player.roomId = null;
  });

  socket.on('start-game', async () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || room.host !== socket.id) return;

    room.gameStarted = true;
    room.questionCount = 0;
    room.nextQuestionScheduled = false;
    
    // Reset scores and answer flags
    room.players.forEach(p => {
      p.score = 0;
      p.hasAnswered = false;
    });
    
    io.to(room.id).emit('game-started');
    console.log(`🎮 Jeu démarré dans ${room.name}`);
    
    // Generate first question
    await sendNextQuestion(room);
  });

  socket.on('update-room-settings', (settings) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || room.host !== socket.id) return;

    // Update room settings
    room.difficulties = settings.difficulties;
    room.categories = settings.categories;
    room.maxQuestions = settings.maxQuestions;
    room.timerDuration = settings.timerDuration;

    // Broadcast updated room to all players
    io.to(room.id).emit('room-updated', room);
    console.log(`⚙️ Paramètres de ${room.name} mis à jour par ${player.name}`);
  });

  socket.on('submit-answer', (answer) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.currentQuestion) return;

    // Prevent multiple submissions by checking if player already answered
    const roomPlayer = room.players.find(p => p.id === socket.id);
    if (roomPlayer.hasAnswered) return;
    
    roomPlayer.hasAnswered = true;

    // Check answer against the original correct answer (not shuffled)
    // The user's clicked choice is compared to question.answer which is always the first choice from CSV
    const correct = checkAnswer(answer, room.currentQuestion.answer);
    
    if (correct) {
      roomPlayer.score += 10;
      player.score += 10;
    }

    socket.emit('answer-result', {
      correct: correct,
      correctAnswer: room.currentQuestion.answer,
      additionalInfo: room.currentQuestion.additionalInfo,
      sourceUrl: room.currentQuestion.sourceUrl
    });

    // Update room for all players
    io.to(room.id).emit('room-updated', room);
  });

  socket.on('chat-message', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;

    const chatData = {
      author: player.name,
      message: data.message,
      timestamp: Date.now()
    };

    // Broadcast message to all players in the room
    io.to(room.id).emit('chat-message', chatData);
    console.log(`💬 Chat in ${room.name} - ${player.name}: ${data.message}`);
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player && player.roomId) {
      const room = rooms.get(player.roomId);
      if (room) {
        const roomPlayer = room.players.find(p => p.id === socket.id);
        
        if (room.gameStarted && roomPlayer) {
          // During game: mark as disconnected but keep in the room
          roomPlayer.connected = false;
          io.to(player.roomId).emit('room-updated', room);
          console.log(`❌ ${player.name} déconnecté de ${room.name} (en jeu)`);
        } else {
          // Before game: remove completely
          room.players = room.players.filter(p => p.id !== socket.id);
          
          if (room.host === socket.id) {
            if (room.players.length > 0) {
              room.host = room.players[0].id;
              io.to(player.roomId).emit('room-updated', room);
              broadcastRoomsList();
            } else {
              rooms.delete(player.roomId);
              broadcastRoomsList();
            }
          } else {
            io.to(player.roomId).emit('room-updated', room);
            broadcastRoomsList();
          }
        }
      }
    }
    
    players.delete(socket.id);
    console.log('❌ Joueur déconnecté:', socket.id);
  });
});

// Shuffle array randomly
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function sendNextQuestion(room) {
  try {
    // Get room difficulties (support both array and single value)
    const roomDifficulties = room.difficulties || [room.difficulty];
    
    // Filter questions by language, category and any of the selected difficulties
    const availableQuestions = questionsDatabase.filter(q => 
      room.categories.includes(q.category) && 
      roomDifficulties.includes(q.difficulty) &&
      q.language === (room.language || 'fr') // Default to French if not specified
    );
    
    if (availableQuestions.length === 0) {
      console.error(`❌ No questions found for categories: ${room.categories}, difficulties: ${roomDifficulties}, language: ${room.language || 'fr'}`);
      return;
    }
    
    // Pick a random question
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    const question = availableQuestions[randomIndex];
    
    // Shuffle the choices (first answer is always correct in CSV)
    // Note: question.answer remains unchanged and points to the correct answer
    const shuffledChoices = shuffleArray(question.choices);
    
    room.currentQuestion = {
      ...question,
      shuffledChoices: shuffledChoices
    };
    room.questionStartTime = Date.now();
    
    io.to(room.id).emit('new-question', {
      question: question.question,
      type: 'qcm', // All questions are multiple choice
      choices: shuffledChoices,
      timerDuration: room.timerDuration,
      additionalInfo: question.additionalInfo,
      sourceUrl: question.sourceUrl,
      difficulty: question.difficulty // Send difficulty for display
    });
    
    console.log(`❓ Question envoyée dans ${room.name}: ${question.question.substring(0, 50)}...`);
    
    // Auto-advance after timer duration + buffer
    setTimeout(async () => {
      // Reset hasAnswered flag for all players who haven't answered
      room.players.forEach(p => {
        if (!p.hasAnswered) {
          p.hasAnswered = true; // Mark as "answered" to proceed
        }
      });
      
      room.questionCount++;
      room.nextQuestionScheduled = false;
      
      // Reset hasAnswered flag for next question
      room.players.forEach(p => p.hasAnswered = false);
      
      if (room.questionCount >= room.maxQuestions) {
        // Game ended
        const results = room.players.sort((a, b) => b.score - a.score);
        io.to(room.id).emit('game-ended', results);
        room.gameStarted = false;
        console.log(`🏆 Jeu terminé dans ${room.name}`);
      } else {
        await sendNextQuestion(room);
      }
    }, (room.timerDuration + QUESTION_TRANSITION_BUFFER_SECONDS) * 1000);
    
  } catch (err) {
    console.error("❌ Erreur génération question:", err);
  }
}

function checkAnswer(userAnswer, correctAnswer) {
  const normalize = (str) => str.toLowerCase().trim().replace(/[^\w\s]/g, '');
  return normalize(userAnswer) === normalize(correctAnswer);
}

httpServer.listen(3000, () => {
  console.log("✅ Backend LM Studio prêt sur http://localhost:3000");
  console.log("✅ Socket.io activé pour le multijoueur");
});
