const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./configs/mongoDBConn");

dotenv.config();
connectDB();

const app = express();
app.use(express.json());

// app.use("/api/rooms", require("./routes/roomRoutes"));
// app.use("/api/players", require("./routes/playerRoutes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
