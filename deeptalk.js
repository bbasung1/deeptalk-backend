const express = require("express");
const dotenv = require("dotenv");
const cors = require('cors');
const app = express();
const fs = require("fs");
dotenv.config();
const https = require("https");
const { error } = require("console");

let httpsmode = true;
let options = {}
try {
    options = {
        ca: fs.readFileSync(process.env.CA),
        key: fs.readFileSync(process.env.KEY),
        cert: fs.readFileSync(process.env.CERT),
    };
} catch (err) {
    httpsmode = false;
}


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(cors());
app.use("/oauth", require("./oauth.js"));
app.use("/comment", require("./comment.js"));
app.use("/profile", require("./profile.js"));
app.use("/admin", require("./admin.js"));
app.use("/talk", require("./talk.js"));
app.use("/think", require("./think.js"));
app.use("/search", require("./search.js"));
app.use("/write", require("./write.js"));
app.use("/useractivity", require("./useractivity.js"));

if (!httpsmode) {
    app.listen(9300, () => { console.log("http server is running") });
} else {
    https.createServer(options, app).listen(9300, () => {
        console.log("https server running");
    })
};
