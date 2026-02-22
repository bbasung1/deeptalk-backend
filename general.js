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
    user_id_data = await knex("profile").select("user_id").where("id", id).first();
    return user_id_data.user_id
}

async function user_id_to_id(user_id) {
    id_data = await knex("profile").select("id").where("user_id", user_id).first();
    return id_data.id
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
    typeMap,
    TYPE_BLOCK,
    TYPE_MUTE,
    TYPE_REPORT
};