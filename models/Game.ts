// Game session class
import { Server as SocketServer } from "socket.io";
import { GamePhase, GameState, PhaseDelay, Role } from "../configs/configs";

export class GameSession {
  io: SocketServer;
  players: any[];
  sessionId: string;
  gameState: GameState;
  gamePhase: GamePhase;
  dayCount: number;
  votes: { [key: string]: any };
  nightActions: { [key: string]: any };
  chatMessages: any[];
  createdAt: number;
  hostId: string;
  timer: NodeJS.Timeout | null;
  winningParty: Role | null;
  timeOfDay?: string;

  constructor(io: SocketServer, sessionId: string, hostId: string) {
    this.io = io;
    this.sessionId = sessionId;
    this.hostId = hostId;
    this.players = [];
    this.gameState = GameState.LOBBY;
    this.gamePhase = GamePhase.DAY;
    this.dayCount = 1;
    this.votes = {};
    this.nightActions = {};
    this.chatMessages = [];
    this.createdAt = Date.now();
    this.timer = null;
    this.winningParty = null;
  }

  clearVotes() {
    this.votes = {};
  }

  setPhase(phase: GamePhase) {
    this.gamePhase = phase;
  }

  setGameState(state: GameState) {
    this.gameState = state;
  }

  assignRoles() {
    const playerCount = this.players.length;
    let roles: string[] = [];

    // Determine roles based on player count
    if (playerCount >= 5 && playerCount <= 7) {
      roles = ["villager", "villager", "villager", "demon", "inspector", "doctor"];
    } else if (playerCount == 2) {
      roles = ["villager", "demon"];
    } else if (playerCount == 4) {
      roles = ["villager", "demon", "inspector", "doctor"];
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

      this.io.to(player.id).emit("your-role", {
        sessionId: this.sessionId,
        player: this.players.find((p) => p.id === player.id),
      });
    });
  }

  resolveNightActions() {
    const demonVotes: Record<string, number> = {};
    let doctorTarget = null;

    type InspectorResult = {
      inspectorId: string;
      targetId: string;
      targetName: string;
      result: string;
    };

    let inspectorResult: InspectorResult = {
      inspectorId: "",
      targetId: "",
      targetName: "",
      result: "",
    };

    // Collect all actions
    Object.entries(this.nightActions).forEach(([playerId, action]) => {
      const player = this.players.find((p) => p.id === playerId);
      if (!player || !player.isAlive) {
        return;
      }

      switch (action.actionType) {
        case "kill":
          if (player.role === Role.DEMON || player.role === Role.DEMON_LEADER) {
            const target = this.players.find((p) => p.id === action.targetId);

            if (!target) {
              return;
            }

            if (target.role === Role.DEMON || target.role === Role.DEMON_LEADER) {
              return;
            }

            demonVotes[target.id] = (demonVotes[target.id] || 0) + 1;
          }
          break;

        case "save":
          if (player.role === Role.DOCTOR) {
            doctorTarget = action.targetId;
          }
          break;

        case "investigate":
          if (player.role === Role.INSPECTOR) {
            const target = this.players.find((p) => p.id === action.targetId);
            if (target) {
              const result = target.role === Role.DEMON ? Role.DEMON : Role.VILLAGER;
              inspectorResult = {
                inspectorId: playerId,
                targetId: target.id,
                targetName: target.name,
                result,
              };
            }
          }
          break;

        default:
          break;
      }
    });

    // Decide demon target
    let targetToKill: string | null = null;
    let maxVotes = 0;
    Object.entries(demonVotes).forEach(([targetId, votes]) => {
      const voteCount = votes as number;
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        targetToKill = targetId;
      }
    });

    // Check doctor save
    if (doctorTarget && targetToKill === doctorTarget) {
      targetToKill = null;
    }

    // Apply kill
    if (targetToKill) {
      const victim = this.players.find((p) => p.id === targetToKill);
      if (victim) {
        victim.isAlive = false;
        this.io.to(targetToKill).emit("your-role", {
          sessionId: this.sessionId,
          player: victim,
        });
      }
    }

    // Inspector results

    if (inspectorResult) {
      this.io.to(inspectorResult.inspectorId).emit("investigation-result", {
        targetId: inspectorResult.targetId,
        targetName: inspectorResult.targetName,
        result: inspectorResult.result,
        inspectorId: inspectorResult.inspectorId,
      });
    }

    // Reset night actions
    this.nightActions = {};

    // Check win conditions
    this.checkWinConditions();
  }

  checkWinConditions() {
    const aliveDemons = this.players.filter((p) => (p.role === "demon" || p.role === "demonLeader") && p.isAlive);

    const aliveVillagers = this.players.filter((p) => p.isAlive && p.role !== "demon" && p.role !== "demonLeader");

    // --- Win conditions ---
    if (aliveDemons.length === 0) {
      //  Villagers win if no demons left
      this.gameState = GameState.ENDED;
      this.winningParty = Role.VILLAGER;
    } else if (aliveDemons.length >= aliveVillagers.length && aliveDemons.length > 0) {
      // Demons win if they outnumber/equal villagers
      this.gameState = GameState.ENDED;
      this.winningParty = Role.DEMON;
    } else {
      // Game continues
      this.timer = setTimeout(() => {
        this.startDayPhase();
      }, 5 * 1000);
    }

    this.io.to(this.sessionId).emit("game-state-update", this.getPublicData());
  }

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
      winningParty: this.winningParty,
      gamePhase: this.gamePhase,
      playerCount: this.players.length,
    };
  }

  resolveVotes() {
    const voteCounts: Record<string, number> = {};

    Object.values(this.votes).forEach((targetId) => {
      voteCounts[targetId] = (voteCounts[targetId] ?? 0) + 1;
    });

    const [targetId] = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0] || [];

    if (targetId) {
      const victim = this.players.find((p) => p.id === targetId);
      if (victim) {
        victim.isAlive = false;

        this.io.to(victim.id).emit("your-role", {
          sessionId: this.sessionId,
          player: victim,
        });
      }
    }
    this.io.to(this.sessionId).emit("game-state-update", this.getPublicData());
    this.clearVotes();
  }

  startDayPhase() {
    this.setPhase(GamePhase.DAY);
    this.resolveVotes();
    this.io.to(this.sessionId).emit("phase-change", { phase: GamePhase.DAY, duration: 5 });
    this.timer = setTimeout(() => {
      this.startDemonsPhase();
    }, PhaseDelay.DAY * 1000);
  }

  startDemonsPhase() {
    this.setPhase(GamePhase.DEMONS);
    this.io.to(this.sessionId).emit("phase-change", { phase: GamePhase.DEMONS, duration: 5 });
    this.timer = setTimeout(() => {
      this.startInspectorPhase();
    }, PhaseDelay.DEMONS * 1000);
  }

  startInspectorPhase() {
    this.setPhase(GamePhase.INSPECTOR);
    this.io.to(this.sessionId).emit("phase-change", { phase: GamePhase.INSPECTOR, duration: 5 });
    this.timer = setTimeout(() => {
      this.startDoctorPhase();
    }, PhaseDelay.INSPECTOR * 1000);
  }

  startDoctorPhase() {
    this.setPhase(GamePhase.DOCTOR);
    this.io.to(this.sessionId).emit("phase-change", { phase: GamePhase.DOCTOR, duration: 5 });
    this.timer = setTimeout(() => {
      this.dayCount += 1;
      this.startNightActions();
    }, PhaseDelay.DOCTOR * 1000);
  }

  startNightActions() {
    this.resolveNightActions();
  }
}
