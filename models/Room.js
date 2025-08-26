const mongoose = require("mongoose");
const Player = require("../models/Player");
const playerSchema = Player.schema;

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  host: { type: String, required: true },
  players: [playerSchema],
  numOfPlayers: { type: Number, default: playerSchema.paths.length },
  phase: { type: String, enum: ["day", "demons", "doctor", "inspector", "lobby"], default: "lobby" },
});

module.exports = mongoose.model("Room", roomSchema);
