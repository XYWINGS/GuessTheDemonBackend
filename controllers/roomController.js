// const Player = require("../models/Player");

const Room = require("../models/Room");
// Create a new room
exports.createRoom = async (req, res) => {
  try {
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    const room = new Room({ code });
    await room.save();
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get room by code
exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code }).populate("players");
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
