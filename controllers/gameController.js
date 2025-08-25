const Room = require("../models/Room");
const Player = require("../models/Player");

/**
 * Start the game (assign roles + move to day phase)
 */
exports.startGame = async (req, res) => {
  try {
    const { code } = req.body;
    const room = await Room.findOne({ code }).populate("players");
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Assign roles (simple logic: first demon leader, next demons, etc.)
    let roles = ["demonLeader", "demon", "inspector", "doctor"];
    while (roles.length < room.players.length) roles.push("villager");
    roles = roles.sort(() => Math.random() - 0.5); // shuffle

    for (let i = 0; i < room.players.length; i++) {
      const player = await Player.findById(room.players[i]._id);
      player.role = roles[i];
      await player.save();
    }

    room.phase = "day";
    await room.save();

    res.json({ message: "Game started", room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Cast a vote (works for both day and night phases)
 */
exports.castVote = async (req, res) => {
  try {
    const { code, voterId, targetId } = req.body;
    const room = await Room.findOne({ code });
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Save vote
    room.votes.set(voterId, targetId);
    await room.save();

    res.json({ message: "Vote cast", votes: Object.fromEntries(room.votes) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * End current phase → process votes → move to next phase
 */
exports.endPhase = async (req, res) => {
  try {
    const { code } = req.body;
    const room = await Room.findOne({ code }).populate("players");
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (room.phase === "day") {
      // --- DAY: majority vote eliminates player ---
      const tally = {};
      for (const targetId of room.votes.values()) {
        tally[targetId] = (tally[targetId] || 0) + 1;
      }
      const eliminatedId = Object.keys(tally).reduce((a, b) => (tally[a] > tally[b] ? a : b));

      if (eliminatedId) {
        const eliminated = await Player.findById(eliminatedId);
        eliminated.alive = false;
        await eliminated.save();
      }

      room.votes.clear();
      room.phase = "night";
    } else if (room.phase === "night") {
      // --- NIGHT: demons vote, doctor heal, inspector inspect ---
      const tally = {};
      let demonTarget = null;
      let doctorSave = null;
      let inspectorCheck = null;

      for (const [voterId, targetId] of room.votes) {
        const voter = await Player.findById(voterId);
        if (!voter.alive) continue;

        if (["demon", "demonLeader"].includes(voter.role)) {
          tally[targetId] = (tally[targetId] || 0) + 1;
        }
        if (voter.role === "doctor") doctorSave = targetId;
        if (voter.role === "inspector") inspectorCheck = targetId;
      }

      if (Object.keys(tally).length > 0) {
        demonTarget = Object.keys(tally).reduce((a, b) => (tally[a] > tally[b] ? a : b));
      }

      if (demonTarget && demonTarget !== doctorSave) {
        const victim = await Player.findById(demonTarget);
        victim.alive = false;
        await victim.save();
      }

      // Inspector result
      let inspectorResult = null;
      if (inspectorCheck) {
        const checked = await Player.findById(inspectorCheck);
        if (checked.role === "demon") inspectorResult = "demon";
        else inspectorResult = "villager"; // demonLeader looks innocent
      }

      room.votes.clear();
      room.phase = "day";
      await room.save();

      return res.json({ message: "Night ended", inspectorResult });
    }

    await room.save();
    res.json({ message: "Phase ended", room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
