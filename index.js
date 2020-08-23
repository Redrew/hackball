"use strict";
const io = require("socket.io"),
  express = require("express");

// Init server
const PORT = process.env.PORT || 8080;
const INDEX = "/index.html";

const app = express();
app.use(express.static("client"));
app.get("/", (req, res) => res.sendFile(INDEX, { root: __dirname }));
const server = app.listen(PORT, () => {
  console.log(`Listening at port ${PORT}`);
});

module.exports = io(server);
