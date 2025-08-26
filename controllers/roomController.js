// const Player = require("../models/Player");

const Room = require("../models/Room");
// Create a new room
exports.createRoom = async (req, res) => {
  try {
    const { hostname } = req.body;
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();

    const room = new Room({
      code,
      host: hostname,
      players: [
        {
          name: hostname,
          isHost: true,
          alive: true,
        },
      ],
    });

    await room.save();
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.joinRoom = async (req, res) => {
  try {
    const { name, roomCode } = req.body;
    if (!name || !roomCode) return res.status(400).json({ error: "Name and room code required" });

    // Find room
    const room = await Room.findOne({ code: roomCode });
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Check if player already exists in the room
    const existingPlayer = room.players.find((p) => p.name === name);
    if (existingPlayer) return res.status(400).json({ error: "Player already joined" });

    // Add new player
    const newPlayer = {
      name,
      role: "villager",
      alive: true,
      isHost: false,
    };
    room.players.push(newPlayer);

    await room.save();

    // Return safe room data (hide roles of others)
    const safePlayers = room.players.map((p) => (p.name === name ? p : { ...p.toObject(), role: undefined }));

    res.status(200).json({
      player: newPlayer, // role visible only to this player
      room: { ...room.toObject(), players: safePlayers },
    });
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
