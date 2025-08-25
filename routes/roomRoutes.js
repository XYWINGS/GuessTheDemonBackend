const express = require("express");
const router = express.Router();
const { createRoom, getRoom } = require("../controllers/roomController");

router.post("/create", createRoom);
router.get("/:code", getRoom);

module.exports = router;
