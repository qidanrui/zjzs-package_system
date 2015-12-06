var express = require('express');
var router = express.Router();
var models = require('../models/models');
var lock = require('../models/lock');

var db = models.db;
var PACKAGE_TICKET_DB = models.package_tickets;
var PACKAGE_DB = models.package_activity;

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

//0是被人退掉的票，1是订了但未支付，2是订了且支付了，3是使用过的票，4是活动结束的票
router.get('/', function(req, res) {
    if (req.query.ticketid == null){
        res.send("不要捣乱，要有ticketid！！");
        return;
    }

    db[PACKAGE_TICKET_DB].find({unique_id: req.query.ticketid}, function(err, docs) {
        if (docs.length == 0){
            res.send("不要捣乱，你的ticketid没有对应的票！！");
            return;
        }
        else{
            var activityid = docs[0].activity;
            var ticketstatus = docs[0].status;
            var tiSeat = docs[0].seat;

            db[PACKAGE_DB].find({_id: activityid}, function(err, docs1) {
                if (docs1.length == 0){
                    res.send("您的票所对应的活动不存在！");
                    return;
                }
                else{
                    var activityName = docs1[0].name;
                    var activityPhoto = docs1[0].pic_url;
                    var activityPlace = docs1[0].place;
                    var tmp1 = new Date(docs1[0].start_time);
                    var beginTime = getTime(tmp1);
                    var tmp2 = new Date(docs1[0].end_time);
                    var endTime = getTime(tmp2);
                    var activityKey = docs1[0].key;

                    var ticket_status;

                    if (ticketstatus==0 || ticketstatus==99)
                    {
                        res.render("alert",
                            {
                                errorinfo: "无效票。可能是已经退掉的票或是活动已结束而无效。",
                                backadd:    null
                            });
                        return;
                    }

                    ticket_status=1;
                    if (ticketstatus==2)
                        ticket_status=2;
                    var be=new Date(docs1[0].book_end);
                    var tmp3 = {
                        act_name: activityName,
                        act_photo: activityPhoto,
                        act_place: activityPlace,
                        act_begintime: beginTime,
                        act_endtime: endTime,
                        act_key: activityKey,
                        tid:req.query.ticketid,
                        act_need_seat: docs[0].package_need_seat,
                        seat: tiSeat,
                        ticket_status:ticket_status,
                        ticket_price:docs[0].cost,
                        ticket_type:docs[0].type,
                        has_paid:(docs[0].cost==0 || ticketstatus==2),
                        act_book_end: getTime(be)
                    }
                    res.render('checkPackageTicket', tmp3);

                    return;
                }
            });
        }
    });
});

module.exports = router;