const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isHost: { type: Boolean, default: false },
  role: {
    type: String,
    enum: ["villager", "demon", "demonLeader", "inspector", "doctor", "vampire"],
    default: "villager",
  },
  alive: { type: Boolean, default: true },
});

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  host: { type: String, required: true },
  players: [playerSchema],
  phase: { type: String, enum: ["day", "night"], default: "day" },
});

module.exports = mongoose.model("Room", roomSchema);
