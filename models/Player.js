const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: {
    type: String,
    enum: ["villager", "demon", "demonLeader", "inspector", "doctor", "vampire"],
  },
  alive: { type: Boolean, default: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
});

module.exports = mongoose.model("Player", playerSchema);
