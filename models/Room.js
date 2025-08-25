const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true }, // room code
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }],
  phase: { type: String, enum: ["lobby", "day", "night", "ended"], default: "lobby" },
  votes: { type: Map, of: String, default: {} }, // playerId → targetId
  nightActions: { type: Map, of: String, default: {} }, // role-specific actions
});

module.exports = mongoose.model("Room", roomSchema);
