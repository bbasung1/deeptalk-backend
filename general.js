const knex = require('./knex.js');
const jwt = require("jsonwebtoken");

const TYPE_BLOCK = 0;
const TYPE_MUTE = 1;
const TYPE_REPORT = 2;

const typeMap = {
    "block": TYPE_BLOCK,
    "mute": TYPE_MUTE,
    "report": TYPE_REPORT,
};

async function convert_our_id(user_id) {
    return knex('profile').pluck("id").where("user_id", user_id)
        .then(temp => {
            let ourid = temp[0];
            console.log(ourid);
            return ourid;  // 이걸 return하면 바깥에서도 await로 받을 수 있음
        });
};

async function tmp_convert_our_id(token) {
    // console.log(token);
    let tkn = token.split("Bearer ")[1];
    let decodetoken = jwt.decode(tkn);
    // console.log(decodetoken);
    if (decodetoken == null) {
        console.error("nodata");
        return {
            code: 4001,
            msg: "no data. check your data",
            httpcode: 400
        }
    }
    if (decodetoken.exp == null) {
        console.error("noexp");
        return {
            code: 4002,
            msg: "exp isn't exsisted. check the idtoken",
            httpcode: 401
        }
    }
    if (decodetoken.exp * 1000 < Date.now()) {
        console.error("token is too old");
        return {
            code: 4003,
            msg: "token is too old",
            exp: decodetoken.exp,
            curr_time: Date.now(),
            httpcode: 400
        }
    }
    return decodetoken.sub;
};

async function define_id(test_id, res) {
    let id = null;
    console.log(test_id);
    if (test_id != undefined) {
        id = await tmp_convert_our_id(test_id);
        if (id.code != undefined) {
            const { httpcode, ...rest } = id;
            // console.log(httpcode);
            console.log(rest);
            return res.status(httpcode).json(rest);
        }
    };
    return id;
}

async function handleBlockAction(req, res, actionType) {
    const ourid = await define_id(req.headers.authorization, res);
    if (!ourid) return; // 인증 실패 시 종료

    const { target_id } = req.body; // 이제 body에는 target_id만 있으면 됨
    console.log(target_id);

    if (!target_id) {
        return res.status(400).json({ success: false, message: "target_id가 필요합니다." });
    }

    if (!(actionType in typeMap)) {
        return res.status(400).json({ success: false, message: "지원하지 않는 타입입니다." });
    }

    try {
        await knex.transaction(async (trx) => {
            // block_list에 등록
            await trx("block_list").insert({
                user_id: ourid, // JWT에서 뽑은 값
                blocked_user_id: target_id,
                type: typeMap[actionType],
            });

            // block일 경우 follow 관계를 backup + 삭제
            if (actionType === "block") {
                const isUserFollowTarget = await trx("follow")
                    .where({ user_id: ourid, friend_id: target_id })
                    .first();
                const isTargetFollowUser = await trx("follow")
                    .where({ user_id: target_id, friend_id: ourid })
                    .first();

                let relation = null;
                if (isUserFollowTarget && isTargetFollowUser) relation = 2;
                else if (isUserFollowTarget) relation = 0;
                else if (isTargetFollowUser) relation = 1;

                if (relation !== null) {
                    // backup 테이블에 기록
                    await trx("follow_backup").insert({
                        user_id1: ourid,
                        user_id2: target_id,
                        relation,
                    });

                    // follow 테이블에서 삭제
                    await trx("follow")
                        .whereIn(["user_id", "friend_id"], [
                            [ourid, target_id],
                            [target_id, ourid],
                        ])
                        .del();
                }
            }
        });

        return res.json({ success: true, message: `${actionType} 등록 완료` });
    } catch (err) {
        if (err.errno === 1062) {
            return res.status(409).json({ success: false, message: `이미 ${actionType}된 사용자입니다.` });
        } else {
            console.error(err);
            return res.status(500).json({ success: false, message: "서버 오류" });
        }
    }
}

function make_code(len) {
    let aucode = ""
    for (let i = 1; i <= len; i++) {
        let testcode = Math.floor(Math.random() * 36)
        if (testcode < 10) {
            aucode += testcode.toString()
        } else {
            aucode += String.fromCharCode(testcode + 55);
        }
    }
    return aucode;
}

async function add_nickname(id) {
    [nickname] = await knex("profile").select("nickname").where("id", id)
    return nickname.nickname;
}
async function id_to_user_id(id) {
    if (id == undefined) {
        return null;
    }
    user_id_data = await knex("profile").select("user_id").where("id", id).first();
    return user_id_data.user_id
}

async function user_id_to_id(user_id) {
    if (user_id == undefined) {
        return null;
    }
    id_data = await knex("profile").select("id").where("user_id", user_id).first();
    if (id_data.id == undefined) {
        return null;
    }
    return id_data.id
}

const islikeandbookmark = (id, type_name, type_code) => [
    knex.raw(
        `EXISTS(SELECT 1 FROM post_like AS f2 WHERE f2.user_id = ? AND f2.post_id = ${type_name}_num AND f2.type = ?) AS is_like`,
        [id, type_code]
    ),
    knex.raw(
        `EXISTS(SELECT 1 FROM bookmark AS f3 WHERE f3.user_id = ? AND f3.post_id = ${type_name}_num AND f3.type = ?) AS is_bookmark`,
        [id, type_code]
    )
];

async function decrement_quote_num(post_info, trx) {
    const type = post_info.quote_type == 0 ? "talk" : (post_info.quote_type == 1 ? "think" : "comment");
    const type_num = type + "_num";
    await trx(type).where(type_num, post_info.quote).decrement("quote_num", 1);
    const [new_quote_num] = await trx(type).where(type_num, post_info.quote).select("quote_num");
    return new_quote_num.quote_num;
}

async function regist_file(req) {
    const ext = req.file.originalname.split(".").pop();
    const filename = generateFilename(ext);

    const savedPath = await saveImage(req.file.buffer, filename);
    return filename;
}

async function regist_quote(trx, req) {
    const quote_table = req.body.quote_type == "Jam-Talk" ? "talk" : (req.body.quote_type == "Jin-Talk" ? "think" : "comment");
    const quote = req.body.quote_num;
    const quote_type = quote_table == "talk" ? 0 : (quote_table == "think" ? 1 : 2);
    const { quote_num, ...rest } = await trx(quote_table).select("quote_num").where(`${quote_table}_num`, req.body.quote_num).first();
    await trx(quote_table).update({ "quote_num": quote_num + 1 }).where(`${quote_table}_num`, req.body.quote_num);
    return { quote, quote_type }

}

async function regist_vote(trx, { vote, post_num, post_type, table }) {
    if (vote.vote_1.length <= 0 || vote.vote_2.length <= 0) {
        console.log(vote.vote_1.length, vote.vote_2.length);
        await trx.rollback();
        throw Object.assign(new Error("투표 항목은 2개 이상이어야 합니다."), { httpcode: 400 });
    }
    let [vote_num] = await trx("vote").insert({
        post_type,
        post_num,
        vote_1: vote.vote_1,
        vote_2: vote.vote_2,
        vote_3: vote.vote_3 || null,
        vote_4: vote.vote_4 || null,
        vote_5: vote.vote_5 || null,
        vote_6: vote.vote_6 || null,
        end_date: toKstDatetime(vote.end_date)
    })
    const test = await trx(table).update({ vote: vote_num }).where(`${table}_num`, post_num);
    console.log("vote 가 진행됬는지 확인:" + test)
}

function toKstDatetime(isoString) {
    console.log("원본 ISO 문자열:", isoString);
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    // const KST_OFFSET_MS = 0;
    const kstDate = new Date(new Date(isoString).getTime() - KST_OFFSET_MS);
    console.log("KST DATETIME 문자열:", kstDate.toISOString().slice(0, 19).replace('T', ' '));
    return kstDate.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
    convert_our_id,
    define_id,
    tmp_convert_our_id,
    handleBlockAction,
    make_code,
    add_nickname,
    id_to_user_id,
    user_id_to_id,
    islikeandbookmark,
    decrement_quote_num,
    regist_file,
    regist_quote,
    regist_vote,
    typeMap,
    TYPE_BLOCK,
    TYPE_MUTE,
    TYPE_REPORT
};