const knex = require('./knex.js');
async function convert_our_id(user_id) {
    return knex('profile').pluck("id").where("user_id", user_id)
        .then(temp => {
            let ourid = temp[0];
            console.log(ourid);
            return ourid;  // 이걸 return하면 바깥에서도 await로 받을 수 있음
        });
};
async function define_id(test_id) {
    let id = null;
    console.log(test_id);
    if (test_id != undefined) {
        id = await convert_our_id(test_id);
    };
    return id;
}

module.exports = {
    convert_our_id,
    define_id
};