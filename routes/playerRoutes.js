const express = require("express");
const router = express.Router();
const { joinRoom } = require("../controllers/playerController");

router.post("/join", joinRoom);

module.exports = router;
