const Room = require("../models/Room");
const Player = require("../models/Player");

// Join room
exports.joinRoom = async (req, res) => {
  try {
    const { name, code } = req.body;
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const player = new Player({ name, roomId: room._id });
    await player.save();

    room.players.push(player._id);
    await room.save();

    res.json({ player, room });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
