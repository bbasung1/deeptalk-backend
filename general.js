const knex = require('./knex.js');
const jwt = require("jsonwebtoken");

async function convert_our_id(user_id) {
    return knex('profile').pluck("id").where("user_id", user_id)
        .then(temp => {
            let ourid = temp[0];
            console.log(ourid);
            return ourid;  // 이걸 return하면 바깥에서도 await로 받을 수 있음
        });
};

async function tmp_convert_our_id(token) {
    console.log(token);
    let tkn = token.split("Bearer ")[1];
    let decodetoken = jwt.decode(tkn);
    console.log(decodetoken);
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
        id = await convert_our_id(test_id);
        if (id.code != undefined) {
            const { httpcode, ...rest } = id;
            console.log(httpcode);
            console.log(rest);
            return res.status(httpcode).json(rest);
        }
    };
    return id;
}

module.exports = {
    convert_our_id,
    define_id,
    tmp_convert_our_id
};