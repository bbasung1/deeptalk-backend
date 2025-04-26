const express = require("express");
const router = express.Router();
const knex = require("./knex.js");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.post("/",async(req,res)=>{
    let id=req.body.id;
    console.log(id);
    if(id==undefined){
        id=null;
    }
    try{
        const block_id= await knex('block_list').where('user_id',id).pluck('block_id');
        const talk=await knex('talk').whereNotIn('writer_id',block_id).select('*');
        console.log(talk);
        res.json(talk);
    }catch(err){
        console.error(err);
        res.status(500).json({error:"서버오류발생"});
    }
});

module.exports = router;