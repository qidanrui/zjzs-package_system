//微信用户查看套票活动详情页面
var express = require('express');
var router = express.Router();

var model = require('../models/models');
var lock = require('../models/lock');
var urls = require("../address_configure");

var PACKAGE_DB = model.package_activity;
var db = model.db;

function addZero(num)
{
    if (num<10)
        return "0"+num;
    return ""+num;
}
function getTime(datet,isSecond)
{
    if (!(datet instanceof Date))
        datet=new Date(datet);
    datet.getMinutes()
    return datet.getFullYear() + "年"
        + (datet.getMonth()+1) + "月"
        + (datet.getDate()) + "日 "
        + addZero(datet.getHours()) + ":"
        + addZero(datet.getMinutes())
        + (isSecond===true? ":"+datet.getSeconds() : "");
}
router.get("/", function(req, res, next)
{
    if (req.query.actid == null)
    {
        res.send("Activity does not exist!");
        return;
    }
    //WARNING: 500 when invalid id
    var theActID=model.getIDClass(req.query.actid);

    db[PACKAGE_DB].find(
    {
        _id:theActID,
        status:{$gt:0}
    },function(err, docs)
    {
        if (err || docs.length==0)
        {
            res.send("Activity not exist!");
            return;
        }
        var theAct=docs[0];
        var nowStatus=0;
        var current=(new Date()).getTime();
        if (current>theAct.book_start && current<theAct.book_end)
            nowStatus=1;
        else if (current>=theAct.book_end)
            nowStatus=2;
        var tmp=
        {
            act_name:           theAct.name,
            act_book_start:     theAct.book_start,
            act_book_end:       theAct.book_end,
            act_start:          theAct.start_time,
            act_end:            theAct.end_time,
            act_place:          theAct.place,
            act_key:            theAct.key,
            act_pic_url:        theAct.pic_url,
            act_desc:           theAct.description
                                    .replace(/ /g,"&nbsp;")
                                    .replace(/"/g,"&quot;")
                                    .replace(/</g,"&lt;")
                                    .replace(/>/g,"&gt;")
                                    .replace(/\\n/g,"<br>"),
            act_type:           theAct.need_package_or_not+1,
			act_area:			theAct.package_need_seat_area,
			act_need_seat:      theAct.package_need_seat,
            cur_time:           getTime(new Date(),true),
            rem_tik:            theAct.remain_tickets,

            time_rem:           Math.round((theAct.book_start-current)/1000),
            ticket_status:      nowStatus,
            current_time:       (new Date()).getTime(),
			//seat_type:          5
        };

        res.render("package_activity_detail_user", tmp);
    });
});

module.exports = router;
