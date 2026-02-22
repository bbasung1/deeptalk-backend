const express = require("express");
const dotenv = require("dotenv");
const cors = require('cors');
const app = express();
const fs = require("fs");
dotenv.config();
const https = require("https");
const { error } = require("console");
const cron = require('node-cron');
const knex = require('./knex.js');
const morgan = require("morgan");
const { logger, stream } = require("./log.js");

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
app.use("/jin-talk", require("./think.js"));
app.use("/jam-talk", require("./talk.js"));
app.use("/search", require("./search.js"));
app.use("/write", require("./write.js"));
app.use("/useractivity", require("./useractivity.js"));
app.use("/admin", require("./admin.js"));
app.use("/home", require("./home.js"));
app.use("/like", require("./like.js"));
app.use("/mylist", require("./bookmark.js"));
app.use("/follow", require("./follow.js"));
app.use("/report", require("./report.js"));
// app.use("/test", require("./test.js"));
app.use("/test", require("./test.js"));
app.use("/files", express.static(process.env.FILE_DIR));

morgan.token("status", function (req, res) {
    let color;
    if (res.statusCode == 404) color = "\x1B[44m";
    else if (res.statusCode < 300) color = "\x1B[32m"; //green
    else if (res.statusCode < 400) color = "\x1B[36m"; //cyan
    else if (res.statusCode < 500) color = "\x1B[33m"; //yellow
    else if (res.statusCode < 600) color = "\x1B[31m"; //red
    else color = "\x1B[0m"; /*글자색 초기화*/

    return color + res.statusCode + "\x1B[0m" /*보라색*/;
});
app.use(
    morgan(
        "HTTP/:http-version :method :url :status from :remote-addr response length: :res[content-length] :referrer :user-agent in :response-time ms",
        { stream: stream }
    )
);

app.use(cors());

if (!httpsmode) {
    app.listen(9300, () => { console.log("http server is running") });
} else {
    https.createServer(options, app).listen(9300, () => {
        console.log("https server running");
    })
};

cron.schedule('0 0 * * *', async () => {
    console.log("cron working");
    const now = new Date();
    const userset = await knex('user').select('id', 'delete_reason').where('deletetime', '<=', now);
    console.log(userset);
    for (const user of userset) {
        console.log(user);
        const ourid = user.id;
        const reason = user.delete_reason;
        const trx = await knex.transaction();
        try {
            await Promise.all([
                trx("talk").whereIn("talk_num", function () {
                    this.select("post_id").from("post_like").where({ type: 0, user_id: ourid });
                }).decrement("like", 1),

                trx("think").whereIn("think_num", function () {
                    this.select("post_id").from("post_like").where({ type: 1, user_id: ourid });
                }).decrement("like", 1),
                trx("talk").whereIn("talk_num", function () {
                    this.select("post_id").from("bookmark").where({ type: 0, user_id: ourid });
                }).decrement("like", 1),

                trx("think").whereIn("think_num", function () {
                    this.select("post_id").from("bookmark").where({ type: 1, user_id: ourid });
                }).decrement("like", 1)
            ]);
            await Promise.all([
                trx("block_list").where("user_id", ourid).del(),
                trx("comment").where("user_id", ourid).del(),
                trx("talk").where("writer_id", ourid).del(),
                trx("think").where("writer_id", ourid).del(),
                trx("follow").where("user_id", ourid).del(),
                trx("post_like").where("user_id", ourid).del(),
                trx("bookmark").where("user_id", ourid).del(),
            ]);
            await trx("profile").where("id", ourid).del();
            await trx("delete_reason").insert({ id: ourid, delete_reason: reason });
            await trx("user").where("id", ourid).del();

            await trx.commit();
            console.log("complete");
        } catch (err) {
            await trx.rollback();
            console.error(err);
        }
    }
});