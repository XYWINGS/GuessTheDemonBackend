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
  killedBy: { type: String, enum: ["demons", "vampire", "villagers"], default: null },
  votes: { type: Number, default: 0 },
});

module.exports = mongoose.model("Player", playerSchema);
