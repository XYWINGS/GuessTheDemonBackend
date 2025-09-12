export enum GamePhase {
  DAY = "day",
  DEMONS = "demons",
  DOCTOR = "doctor",
  INSPECTOR = "inspector",
}

export enum Role {
  VILLAGER = "villager",
  DEMON = "demon",
  DEMON_LEADER = "demonLeader",
  DOCTOR = "doctor",
  INSPECTOR = "inspector",
}

export enum GameState {
  PRE_LOBBY = "pre-lobby",
  PLAYING = "playing",
  LOBBY = "lobby",
  ENDED = "ended",
}

export enum PhaseDelay {
  DAY = 20,
  DEMONS = 2,
  DOCTOR = 2,
  INSPECTOR = 2,
  INACTIVE_DELAY = 5,
}

export type SessionBasic = {
  sessionId: string;
  playerCount: number;
  hostName: string;
  createdAt: number;
};
