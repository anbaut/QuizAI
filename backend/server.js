import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

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

// Store rooms and players
const rooms = new Map();
const players = new Map();

// Broadcast rooms list to all connected clients
function broadcastRoomsList() {
  const roomsList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    difficulty: room.difficulty,
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
    const roomId = `room-${Date.now()}`;
    const room = {
      id: roomId,
      name: config.name,
      difficulty: config.difficulty,
      categories: config.categories,
      host: socket.id,
      players: [],
      maxPlayers: 10,
      gameStarted: false,
      currentQuestion: null,
      questionCount: 0,
      maxQuestions: 5,
      createdAt: Date.now()
    };

    rooms.set(roomId, room);
    socket.emit('room-created', room);
    
    // Auto-join creator
    socket.emit('join-room', roomId);
    
    // Broadcast updated rooms list to all clients
    broadcastRoomsList();
    
    console.log(`🚪 Salle créée: ${config.name} (${roomId})`);
  });

  socket.on('get-rooms', () => {
    const roomsList = Array.from(rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      difficulty: room.difficulty,
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
      hasAnswered: false
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

  socket.on('submit-answer', (answer) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.currentQuestion) return;

    // Prevent multiple submissions by checking if player already answered
    const roomPlayer = room.players.find(p => p.id === socket.id);
    if (roomPlayer.hasAnswered) return;
    
    roomPlayer.hasAnswered = true;

    const correct = checkAnswer(answer, room.currentQuestion.answer);
    
    if (correct) {
      roomPlayer.score += 10;
      player.score += 10;
    }

    socket.emit('answer-result', {
      correct: correct,
      correctAnswer: room.currentQuestion.answer
    });

    // Update room for all players
    io.to(room.id).emit('room-updated', room);

    // Check if all players have answered
    const allAnswered = room.players.every(p => p.hasAnswered);
    
    // If all answered or this is the first answer, schedule next question
    if (!room.nextQuestionScheduled) {
      room.nextQuestionScheduled = true;
      
      setTimeout(async () => {
        room.questionCount++;
        room.nextQuestionScheduled = false;
        
        // Reset hasAnswered flag for all players
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
      }, allAnswered ? 2000 : 5000); // 2s if all answered, 5s timeout otherwise
    }
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player && player.roomId) {
      const room = rooms.get(player.roomId);
      if (room) {
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
    
    players.delete(socket.id);
    console.log('❌ Joueur déconnecté:', socket.id);
  });
});

async function sendNextQuestion(room) {
  try {
    // Pick random category from room's allowed categories
    const category = room.categories[Math.floor(Math.random() * room.categories.length)];
    const difficulty = room.difficulty;

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
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    const question = JSON.parse(content);
    room.currentQuestion = question;
    
    io.to(room.id).emit('new-question', question);
    console.log(`❓ Question envoyée dans ${room.name}: ${question.question.substring(0, 50)}...`);
    
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
