const knex = require('./knex.js');
const jwt = require("jsonwebtoken");
const { saveImage, generateFilename } = require("./utils/imageSaver");

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
    let decodetoken;
    try {
        // jwt.decode()는 서명 검증을 안 해서 누구나 토큰을 위조할 수 있었음.
        // jwt.verify()로 바꿔서 우리 서버가 발급한(JWT_SECRET으로 서명한) 토큰인지 확인.
        decodetoken = jwt.verify(tkn, process.env.JWT_SECRET, { issuer: 'jamdeeptalk.com' });
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            console.error("token is too old");
            return {
                code: 4003,
                msg: "token is too old",
                httpcode: 400
            }
        }
        console.error("invalid token:", err.message);
        return {
            code: 4001,
            msg: "no data. check your data",
            httpcode: 400
        }
    }
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
    const [nickname] = await knex("profile").select("nickname").where("id", id)
    return nickname.nickname;
}
async function id_to_user_id(id) {
    if (id == undefined) {
        return null;
    }
    const user_id_data = await knex("profile").select("user_id").where("id", id).first();
    if (user_id_data == undefined) {
        return null;
    }
    return user_id_data.user_id
}

async function user_id_to_id(user_id) {
    if (user_id == undefined) {
        return null;
    }
    const id_data = await knex("profile").select("id").where("user_id", user_id).first();
    if (id_data == undefined || id_data.id == undefined) {
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
    if (new_quote_num == undefined) {
        return null;
    }
    return new_quote_num.quote_num;
}

async function regist_file(file) {
    const ext = file.originalname.split(".").pop();
    const filename = generateFilename(ext);

    const savedPath = await saveImage(file.buffer, filename);
    return filename;
}

async function regist_quote(trx, req) {
    const quote_table = req.body.quote_type == "Jam-Talk" ? "talk" : (req.body.quote_type == "Jin-Talk" ? "think" : "comment");
    const quote = req.body.quote;
    const quote_type = quote_table == "talk" ? 0 : (quote_table == "think" ? 1 : 2);
    const { quote_num, ...rest } = await trx(quote_table).select("quote_num").where(`${quote_table}_num`, req.body.quote).first();
    console.log("Quote Num: " + quote_num);
    console.log("Quote Type: " + quote_type);
    console.log("Quote Table: " + quote_table);
    await trx(quote_table).update({ "quote_num": quote_num + 1 }).where(`${quote_table}_num`, req.body.quote);
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

// 양방향 차단 관계인 writer_id 목록 반환 (block_list type=0)
async function getBlockedIds(id) {
    const rows = await knex("block_list")
        .where(function () {
            this.where({ user_id: id, type: 0 })
                .orWhere({ blocked_user_id: id, type: 0 });
        })
        .select("user_id", "blocked_user_id");
    const ids = new Set();
    for (const row of rows) {
        if (row.user_id === id) ids.add(row.blocked_user_id);
        else ids.add(row.user_id);
    }
    return [...ids];
}

// 댓글 체인(대댓글의 대댓글 ...)을 따라 위로 올라가 최상위 게시글(talk/think)
// 작성자의 profile.id를 반환합니다.
// type: 0(talk), 1(think), 2(comment) / post_num: 해당 글 또는 부모 댓글의 번호.
// MAX_DEPTH로 체인 길이를 제한해 잘못된 데이터로 인한 무한 루프를 방지합니다.
async function getOriginalPostWriterId(type, post_num) {
    let curType = type;
    let curPostNum = post_num;
    const MAX_DEPTH = 30;

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
        if (curType === 0) {
            const row = await knex("talk").select("writer_id").where("talk_num", curPostNum).first();
            return row ? row.writer_id : null;
        }
        if (curType === 1) {
            const row = await knex("think").select("writer_id").where("think_num", curPostNum).first();
            return row ? row.writer_id : null;
        }
        const parent = await knex("comment").select("type", "post_num").where("comment_num", curPostNum).first();
        if (!parent) return null;
        curType = parent.type;
        curPostNum = parent.post_num;
    }
    return null;
}

// 본문에서 "@user_id" 형태의 멘션을 추출.
// user_id 형식을 강제하는 별도 검증 로직이 코드상 확인되지 않아 보수적으로 제한.
// 영문/숫자/언더스코어/하이픈/점만 허용하고 길이를 제한해 ReDoS 및 과도한 매칭을 방지.
const MENTION_REGEX = /@([a-zA-Z0-9_.-]{1,30})/g;

// 본문 텍스트에서 멘션된 유저들의 id 목록을 반환합니다.
// - 존재하지 않는 user_id, 작성자 자기 자신, 차단 관계인 유저는 제외합니다.
// - mentionerId는 글/댓글 작성자의 internal id 입니다.
async function extractMentionedIds(text, mentionerId) {
    if (!text || typeof text !== "string") return [];

    const handles = [...new Set([...text.matchAll(MENTION_REGEX)].map(m => m[1]))];
    if (handles.length === 0) return [];

    const profiles = await knex("profile").select("id").whereIn("user_id", handles);
    let ids = profiles.map(p => p.id).filter(id => Number(id) !== Number(mentionerId));
    if (ids.length === 0) return [];

    const blockedIds = await getBlockedIds(mentionerId);
    if (blockedIds.length > 0) {
        const blockedSet = new Set(blockedIds.map(Number));
        ids = ids.filter(id => !blockedSet.has(Number(id)));
    }
    return ids;
}

module.exports = {
    convert_our_id,
    define_id,
    tmp_convert_our_id,
    handleBlockAction,
    getBlockedIds,
    extractMentionedIds,
    getOriginalPostWriterId,
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