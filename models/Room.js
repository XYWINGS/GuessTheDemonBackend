const mongoose = require("mongoose");
const Player = require("../models/Player");
const playerSchema = Player.schema;

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  host: { type: String, required: true },
  players: [playerSchema],
  phase: { type: String, enum: ["day", "night"], default: "day" },
});

module.exports = mongoose.model("Room", roomSchema);
