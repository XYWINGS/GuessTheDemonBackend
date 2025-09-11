// Game session class
import { Server as SocketServer } from "socket.io";

export class GameSession {
  io: SocketServer;
  players: any[];
  sessionId: string;
  gameState: string;
  gamePhase: string;
  dayCount: number;
  votes: { [key: string]: any };
  nightActions: { [key: string]: any };
  chatMessages: any[];
  createdAt: number;
  hostId: string;
  timer: NodeJS.Timeout | null;
  winner?: string;
  timeOfDay?: string;

  constructor(io: SocketServer, sessionId: string, hostId: string) {
    this.io = io;
    this.sessionId = sessionId;
    this.hostId = hostId;
    this.players = [];
    this.gameState = "lobby";
    this.gamePhase = "day";
    this.dayCount = 1;
    this.votes = {};
    this.nightActions = {};
    this.chatMessages = [];
    this.createdAt = Date.now();
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
    console.log("=== Resolving Night Actions ===");
    console.log("All night actions:", this.nightActions);

    const demonVotes = {};
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
        console.log(`Skipping action from dead/missing player ${playerId}`);
        return;
      }

      console.log(`Processing action from ${player.role} (${playerId}) ->`, action);

      switch (action.actionType) {
        case "kill":
          if (player.role === "demons" || player.role === "demonLeader") {
            demonVotes[action.targetId] = (demonVotes[action.targetId] || 0) + 1;
            console.log(`Demon vote: ${playerId} voted to kill ${action.targetId}`);
          }
          break;

        case "save":
          if (player.role === "doctor") {
            doctorTarget = action.targetId;
            console.log(`Doctor (${playerId}) chose to save ${doctorTarget}`);
          }
          break;

        case "investigate":
          if (player.role === "inspector") {
            const target = this.players.find((p) => p.id === action.targetId);
            if (target) {
              const result = target.role === "demon" ? "demon" : "villager";
              inspectorResult = {
                inspectorId: playerId,
                targetId: target.id,
                targetName: target.name,
                result,
              };
              console.log(`Inspector (${playerId}) investigated ${target.id} -> ${result}`);
            }
          }
          break;

        default:
          console.log(`Unknown action type: ${action.actionType}`);
          break;
      }
    });

    // Decide demon target
    let targetToKill: string | null = null;
    let maxVotes = 0;
    Object.entries(demonVotes).forEach(([targetId, votes]) => {
      const voteCount = votes as number;
      console.log(`Demon votes for ${targetId}: ${voteCount}`);
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        targetToKill = targetId;
      }
    });

    console.log("Target chosen to kill (before doctor check):", targetToKill);

    // Check doctor save
    if (doctorTarget && targetToKill === doctorTarget) {
      console.log(`Doctor saved ${doctorTarget}! No one dies tonight.`);
      targetToKill = null;
    }

    // Apply kill
    if (targetToKill) {
      const victim = this.players.find((p) => p.id === targetToKill);
      if (victim) {
        victim.isAlive = false;
        console.log(`Player ${victim.id} (${victim.role}) has been killed!`);
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
    console.log("Night actions reset.");

    // Check win conditions
    this.checkWinConditions();
    console.log("=== Night Actions Resolved ===");
  }

  checkWinConditions() {
    console.log("=== Checking Win Conditions ===");

    const aliveDemons = this.players.filter((p) => (p.role === "demon" || p.role === "demonLeader") && p.isAlive);

    const aliveVillagers = this.players.filter((p) => p.isAlive && p.role !== "demon" && p.role !== "demonLeader");

    console.log(
      "Alive Demons:",
      aliveDemons.map((p) => p.id)
    );
    console.log(
      "Alive Villagers:",
      aliveVillagers.map((p) => p.id)
    );

    // --- Win conditions ---
    if (aliveDemons.length === 0) {
      //  Villagers win if no demons left
      this.gameState = "ended";
      this.winner = "villagers";
      console.log("Villagers win!");
    } else if (aliveDemons.length >= aliveVillagers.length && aliveDemons.length > 0) {
      // Demons win if they outnumber/equal villagers
      this.gameState = "ended";
      this.winner = "demons";
      console.log("Demons win!");
    } else {
      // Game continues
      console.log("No winner yet. Moving to day phase.");
      this.timer = setTimeout(() => {
        this.startDayPhase();
      }, 5 * 1000);
    }

    // io.to(this.sessionId).emit("game-state-update", this.getPublicData());
    console.log("=== Win Conditions Checked ===");
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
      gamePhase: this.gamePhase,
      playerCount: this.players.length,
    };
  }

  startDayPhase() {
    this.setPhase("day");
    this.clearVotes();
    this.io.to(this.sessionId).emit("phase-change", { phase: "day", duration: 5 });
    this.timer = setTimeout(() => {
      this.startDemonsPhase();
    }, 5 * 1000);
  }

  startDemonsPhase() {
    this.setPhase("demons");
    this.io.to(this.sessionId).emit("phase-change", { phase: "demons", duration: 5 });
    this.timer = setTimeout(() => {
      this.startInspectorPhase();
    }, 5 * 1000);
  }

  startInspectorPhase() {
    this.setPhase("inspector");
    this.io.to(this.sessionId).emit("phase-change", { phase: "inspector", duration: 5 });
    this.timer = setTimeout(() => {
      this.startDoctorPhase();
    }, 5 * 1000);
  }

  startDoctorPhase() {
    this.setPhase("doctor");
    this.io.to(this.sessionId).emit("phase-change", { phase: "doctor", duration: 5 });
    this.timer = setTimeout(() => {
      this.dayCount += 1;
      this.startNightActions();
    }, 5 * 1000);
  }

  startNightActions() {
    this.resolveNightActions();
  }
}
