const express = require("express");
const router = express.Router();
const { startGame, castVote, endPhase } = require("../controllers/gameController");

router.post("/start", startGame); // start the game
router.post("/vote", castVote); // cast a vote
router.post("/end-phase", endPhase); // end phase and process results

module.exports = router;
