import http from "http";
import cors from "cors";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { GameSession } from "./models/Game";
import { GameState } from "./configs/configs";
import { Server as SocketServer } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// Store multiple game sessions
const gameSessions: Map<string, GameSession> = new Map();

// Clean up inactive sessions periodically
setInterval(() => {
  const inactiveSessions: string[] = [];

  const now = new Date().getTime(); // number (ms since epoch)

  gameSessions.forEach((session, sessionId) => {
    if (now - session.createdAt > 60 * 60 * 1000) {
      inactiveSessions.push(sessionId);
    }
  });

  inactiveSessions.forEach((sessionId) => {
    gameSessions.delete(sessionId);
  });
  broadcastSessionInfo();
}, 5 * 1000); // Check every  5 seconds

// Broadcast updated session info to all connected clients
const broadcastSessionInfo = () => {
  const sessionsList: { sessionId: string; playerCount: number; hostName: string }[] = [];

  gameSessions.forEach((session, sessionId) => {
    if (session.gameState === "lobby") {
      sessionsList.push({
        sessionId,
        playerCount: session.players.length,
        hostName: session.players.find((p) => p.isHost)?.name || "Unknown",
      });
    }
  });

  io.emit("sessions-list", sessionsList);
};

// Handle socket connections
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle creating a new game session
  socket.on("create-session", (playerName) => {
    const sessionId = uuidv4();
    const gameSession = new GameSession(io, sessionId, socket.id);

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

    broadcastSessionInfo();

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

    gameSession.gameState = GameState.PLAYING;
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

  type SessionBasic = {
    sessionId: string;
    playerCount: number;
    hostName: string;
    createdAt: number;
  };
  // Handle session list request
  socket.on("get-sessions", () => {
    const sessionsList: SessionBasic[] = [];

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

        // Remove empty sessions
        if (session.players.length === 0) {
          gameSessions.delete(sessionId);
        }
      }
    });
  });
});

//Serve4 configs
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
