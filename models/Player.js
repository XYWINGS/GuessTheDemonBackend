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
  killedBy: { type: String, enum: ["demon", "vampire", "villagers"], default: null },
  votes: { type: Number, default: 0 },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
});

module.exports = mongoose.model("Player", playerSchema);
