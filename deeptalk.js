const express = require("express");
const dotenv = require("dotenv");
const cors = require('cors');
const app = express();
const fs = require("fs");
dotenv.config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use("/oauth", require("./oauth.js"));
app.use("/comment", require("./comment.js"));
app.use("/profile", require("./profile.js"));
app.use("/admin", require("./admin.js"));
app.use("/talk", require("./talk.js"));
app.use("/think", require("./think.js"));

app.listen(9300);
// https.createServer(options, app).listen(9200);
