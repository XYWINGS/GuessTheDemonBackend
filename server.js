// server/index.js (with multi-game support)
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// Store multiple game sessions
const gameSessions = new Map();

// Game session class
class GameSession {
  constructor(sessionId, hostId) {
    this.sessionId = sessionId;
    this.players = [];
    this.gameState = "lobby";
    this.gamePhase = "day";
    this.dayCount = 1;
    this.votes = {};
    this.nightActions = {};
    this.chatMessages = [];
    this.createdAt = new Date();
    this.hostId = hostId;
    this.timer = null;
  }

  clearVotes() {
    this.votes = {};
  }

  setPhase(phase) {
    this.gamePhase = phase;
  }

  assignRoles() {
    const playerCount = this.players.length;
    let roles = [];

    // Determine roles based on player count
    if (playerCount >= 5 && playerCount <= 7) {
      roles = ["villager", "villager", "villager", "demon", "inspector", "doctor"];
    } else if (playerCount == 2) {
      roles = ["villager", "demon"];
    } else if (playerCount >= 8) {
      roles = ["villager", "villager", "villager", "villager", "demon", "demonLeader", "inspector", "doctor"];
      // Add more villagers for larger games
      for (let i = 8; i < playerCount; i++) {
        roles.push("villager");
      }
    }
    // Shuffle roles
    const shuffled = [...roles].sort(() => Math.random() - 0.5);
    // Assign roles to players
    this.players.forEach((player, index) => {
      player.role = shuffled[index] || "villager";
      player.isAlive = true;

      io.to(player.id).emit("your-role", {
        sessionId: this.sessionId,
        player: this.players.find((p) => p.id === player.id),
      });
    });
  }

  resolveNightActions() {
    // Count demon's votes
    const demonVotes = {};
    Object.entries(this.nightActions).forEach(([playerId, action]) => {
      const player = this.players.find((p) => p.id === playerId);
      if (player && (player.role === "demons" || player.role === "demonLeader") && action.actionType === "kill") {
        demonVotes[action.targetId] = (demonVotes[action.targetId] || 0) + 1;
      }
    });

    // Find player with most votes to be killed
    let targetToKill = null;
    let maxVotes = 0;
    Object.entries(demonVotes).forEach(([targetId, votes]) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        targetToKill = targetId;
      }
    });

    // Check if doctor saved the target
    const doctorAction = Object.values(this.nightActions).find((action) => action.actionType === "save");

    if (doctorAction && doctorAction.targetId === targetToKill) {
      // Doctor saved the target
      targetToKill = null;
    }

    // Kill the player
    if (targetToKill) {
      const player = this.players.find((p) => p.id === targetToKill);
      if (player) {
        player.isAlive = false;
      }
    }

    // Check win conditions
    this.checkWinConditions();
  }

  checkWinConditions() {
    const aliveDemons = this.players.filter((p) => (p.role === "demons" || p.role === "demonLeader") && p.isAlive);

    const aliveVillagers = this.players.filter((p) => p.role !== "demons" && p.role !== "demonLeader" && p.isAlive);

    if (aliveDemons.length === 0) {
      // Villagers win
      this.gameState = "ended";
      this.winner = "villagers";
    } else if (aliveDemons.length >= aliveVillagers.length) {
      // Demons win
      this.gameState = "ended";
      this.winner = "demons";
    }
  }

  // Get public data (without sensitive information)
  getPublicData() {
    return {
      sessionId: this.sessionId,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        role: null,
        isAlive: player.isAlive,
        isHost: player.id === this.hostId,
      })),
      gameState: this.gameState,
      timeOfDay: this.timeOfDay,
      dayCount: this.dayCount,
      chatMessages: this.chatMessages.slice(-50),
      winner: this.winner,
      playerCount: this.players.length,
    };
  }

  startDayPhase() {
    this.setPhase("day");
    this.clearVotes();
    io.to(this.sessionId).emit("phase-change", { phase: "day", duration: 5 });
    this.timer = setTimeout(() => {
      this.startDemonsPhase();
    }, 5 * 1000);
  }

  startDemonsPhase() {
    this.setPhase("demons");
    io.to(this.sessionId).emit("phase-change", { phase: "demons", duration: 5 });
    this.timer = setTimeout(() => {
      this.startInspectorPhase();
    }, 5 * 1000);
  }

  startInspectorPhase() {
    this.setPhase("inspector");
    io.to(this.sessionId).emit("phase-change", { phase: "inspector", duration: 5 });
    this.timer = setTimeout(() => {
      this.startDoctorPhase();
    }, 5 * 1000);
  }

  startDoctorPhase() {
    this.setPhase("doctor");
    io.to(this.sessionId).emit("phase-change", { phase: "doctor", duration: 5 });
    this.timer = setTimeout(() => {
      this.resolveNightActions();
      this.dayCount += 1;
      this.startDayPhase();
    }, 5 * 1000);
  }
}

// Clean up inactive sessions periodically
setInterval(() => {
  const now = new Date();
  const inactiveSessions = [];

  gameSessions.forEach((session, sessionId) => {
    // Remove sessions inactive for more than 1 hours
    if (now - session.createdAt > 60 * 60 * 1000) {
      inactiveSessions.push(sessionId);
    }
  });

  inactiveSessions.forEach((sessionId) => {
    gameSessions.delete(sessionId);
    console.log(`Removed inactive session: ${sessionId}`);
  });
}, 30 * 60 * 1000); // Check every 30 minutes

// Handle socket connections
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle creating a new game session
  socket.on("create-session", (playerName) => {
    const sessionId = uuidv4();
    const gameSession = new GameSession(sessionId, socket.id);

    // Add host to the session
    gameSession.players.push({
      id: socket.id,
      name: playerName,
      role: null,
      isAlive: true,
      isHost: true,
    });

    gameSessions.set(sessionId, gameSession);
    socket.join(sessionId);

    // Send session ID to the host
    socket.emit("session-created", {
      sessionId,
      player: gameSession.players.find((p) => p.id === socket.id),
    });

    io.to(sessionId).emit("game-state-update", gameSession.getPublicData());
  });

  // Handle joining an existing game session
  socket.on("join-session", (data) => {
    const { sessionId, playerName } = data;
    const gameSession = gameSessions.get(sessionId);

    if (!gameSession) {
      socket.emit("error", { message: "Game session not found" });
      return;
    }

    if (gameSession.gameState !== "lobby") {
      socket.emit("error", { message: "Game has already started" });
      return;
    }

    if (gameSession.players.length >= 15) {
      socket.emit("error", { message: "Game is full" });
      return;
    }

    // Add player to the session
    gameSession.players.push({
      id: socket.id,
      name: playerName,
      role: null,
      isAlive: true,
      isHost: false,
    });

    socket.join(sessionId);

    // Send game data to the new player
    socket.emit("session-joined", {
      sessionId,
      player: gameSession.players.find((p) => p.id === socket.id),
    });

    // Notify all players in the session
    io.to(sessionId).emit("game-state-update", gameSession.getPublicData());
  });

  // Handle game start
  socket.on("start-game", (sessionId) => {
    const gameSession = gameSessions.get(sessionId);

    if (!gameSession || gameSession.hostId !== socket.id) {
      socket.emit("error", { message: "Not authorized to start game" });
      return;
    }

    // if (gameSession.players.length < 5) {
    //   socket.emit("error", { message: "Need at least 5 players to start" });
    //   return;
    // }

    gameSession.gameState = "playing";
    gameSession.assignRoles();
    gameSession.startDayPhase();

    io.to(sessionId).emit("game-state-update", gameSession.getPublicData());
    console.log(`Game started in session: ${sessionId}`);
  });

  // Handle voting
  socket.on("vote", (data) => {
    const { voterName, sessionId, voterId, targetId, targetName } = data;
    console.log(`Vote in session ${sessionId} from ${voterName} to ${targetName}`);
    console.log(`Vote in session data ${data}`);

    const gameSession = gameSessions.get(sessionId);

    if (!gameSession) return;

    gameSession.votes[voterId] = targetId;
    io.to(sessionId).emit("vote-update", gameSession.votes);
  });

  // Handle night actions
  socket.on("night-action", (data) => {
    const { sessionId, playerId, targetId, actionType } = data;
    const gameSession = gameSessions.get(sessionId);

    if (!gameSession) return;

    gameSession.nightActions[playerId] = {
      targetId,
      actionType,
    };
  });

  // Handle chat messages
  socket.on("chat-message", (data) => {
    const { sessionId, playerId, message } = data;
    const gameSession = gameSessions.get(sessionId);

    if (!gameSession) return;

    const player = gameSession.players.find((p) => p.id === playerId);
    if (player) {
      const chatMessage = {
        player: player.name,
        message,
        timestamp: new Date(),
      };

      gameSession.chatMessages.push(chatMessage);
      io.to(sessionId).emit("chat-message", chatMessage);
    }
  });

  // Handle session list request
  socket.on("get-sessions", () => {
    const sessionsList = [];

    gameSessions.forEach((session, sessionId) => {
      if (session.gameState === "lobby") {
        sessionsList.push({
          sessionId,
          playerCount: session.players.length,
          hostName: session.players.find((p) => p.isHost)?.name || "Unknown",
        });
      }
    });

    socket.emit("sessions-list", sessionsList);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Find and remove player from all sessions
    gameSessions.forEach((session, sessionId) => {
      const playerIndex = session.players.findIndex((p) => p.id === socket.id);

      if (playerIndex !== -1) {
        const player = session.players[playerIndex];
        session.players.splice(playerIndex, 1);

        // If host left, assign new host
        if (session.hostId === socket.id && session.players.length > 0) {
          session.hostId = session.players[0].id;
          session.players[0].isHost = true;
        }

        // Notify remaining players
        io.to(sessionId).emit("game-state-update", session.getPublicData());
        console.log(`Player ${player.name} removed from session: ${sessionId}`);

        // Remove empty sessions
        if (session.players.length === 0) {
          gameSessions.delete(sessionId);
          console.log(`Session ${sessionId} removed (no players)`);
        }
      }
    });
  });
});

// HTTP endpoint to get active sessions
app.get("/sessions", (req, res) => {
  const sessionsList = [];

  gameSessions.forEach((session, sessionId) => {
    if (session.gameState === "lobby") {
      sessionsList.push({
        sessionId,
        playerCount: session.players.length,
        hostName: session.players.find((p) => p.isHost)?.name || "Unknown",
        createdAt: session.createdAt,
      });
    }
  });

  res.json(sessionsList);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
