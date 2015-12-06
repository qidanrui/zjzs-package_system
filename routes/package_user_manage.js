var express = require('express');
var moment = require('moment');
var nodeExcel = require('excel-export');
var router = express.Router();

var model = require('../models/models');
var lock = require('../models/lock');
var urls = require("../address_configure");
var checkin = require('./package_checkin');
var cm = require("../weixin_basic/custom_menu");
var act_info = require('../weixin_basic/activity_info');
var cache = require("../weixin_handler/handler_ticket");

var ADMIN_DB = model.admins;
var db = model.db;
var getIDClass = model.getIDClass;
var ACTIVITY_DB = model.activities;
var TICKET_DB = model.tickets;
var SEAT_DB = model.seats;
var PACKAGE_ACTIVITY_DB = model.package_activities;
var PACKAGE_DB = model.packages;

var seat_row_2 = 8;
var seat_col_2 = 40;

router.get("/", function(req, res)
{
    res.redirect("/users/package_manage/list");
});

router.use("/checkin",checkin);

router.get("/list", function(req, res) {
    var activities1 = new Array();
    db[PACKAGE_ACTIVITY_DB].find({status:{$gte:0}}, function(err1, docs1){
        if (err1)
        {
            res.send("数据库抓取活动列表出错！请检查数据库。");
            return;
        }
        for (var i = 0; i < docs1.length; i++)
        {
            var j = docs1.length-1-i;
            var activity = {
                status: docs1[j].status,
                name: docs1[j].name,
                description: docs1[j].description,
                start_time: docs1[j].start_time,
                end_time: docs1[j].end_time,
                place: docs1[j].place,
                book_start: docs1[j].book_start,
                book_end: docs1[j].book_end,
                id: docs1[j]["_id"].toString()
            };
            activities1[i] = activity;
        }
        res.render("package_activity_list", {activities1: activities1});
        });
});

router.post("/delete", function(req, res){
    var idObj = getIDClass(req.body.activityId);
    var activity = {status:-1};
    db[PACKAGE_ACTIVITY_DB].find({_id:idObj}, function(err1, docs1){
        if (err1 || docs1.length == 0)
        {
            res.send("数据库查找不到要删除的活动！");
            lock.release(PACKAGE_ACTIVITY_DB);
            return;
        }
        if (docs1[0]["status"] == 1 &&
            moment(docs1[0]["book_start"]).isBefore() && moment(docs1[0]["end_time"]).isAfter())
        {
            res.send("活动处于抢票开始到活动结束间的阶段，此阶段不能删除活动！");
            lock.release(PACKAGE_ACTIVITY_DB);
            return;
        }
        db[PACKAGE_ACTIVITY_DB].update({_id:idObj}, {$set: activity}, {multi:false}, function(err2, result2){
            if (err2 || result2.n == 0)
            {
                res.send("数据库查找不到要删除的活动！");
                lock.release(PACKAGE_ACTIVITY_DB);
            }
            else
            {
                res.send("活动删除成功！");
                lock.release(PACKAGE_ACTIVITY_DB);
            }
        });
    });
});

router.get("/export", function(req, res){
    if (req.query.actid == undefined)
    {
        res.send("导出命令缺少actid参数！");
        return;
    }

    var idObj = getIDClass(req.query.actid);
    db[PACKAGE_ACTIVITY_DB].find({_id:idObj}, function(err1, docs1){
        if (err1 || docs1.length == 0)
        {
            res.send("找不到要导出的活动！");
            return;
        }

        var filename = docs1[0]["name"] + ".xlsx";
        var packageSeatFlag;
        var conf ={};

        if (docs1[0].package_need_seat == "0") packageSeatFlag = 0; else packageSeatFlag = 1;

        conf.cols = [{caption:'学号', type:'string'}];
        conf.cols.push({caption:'入场状态', type:'string'});

        db[PACKAGE_DB].find({activity:idObj, status:{$ne:0}}, function(err2, docs2){
            if (err2)
            {
                res.send("票务数据库查找出错！");
                return;
            }
            conf.rows = [];
            for (var i = 0; i < docs2.length; i++)
            {
                var item = [];
                item.push(docs2[i]["stu_id"]);
                if (docs2[i].status != 2)
                    item.push("未入场");
                else
                    item.push("已入场");
                conf.rows.push(item);
            }

            var result = nodeExcel.execute(conf);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats');

            var userAgent = (req.headers['user-agent']||'').toLowerCase();
            if(userAgent.indexOf('msie') >= 0 || userAgent.indexOf('chrome') >= 0)
                res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent(filename));
            else if(userAgent.indexOf('firefox') >= 0)
                res.setHeader('Content-Disposition', 'attachment; filename*="utf8\'\''
                    + encodeURIComponent(filename)+'"');
            else
                res.setHeader('Content-Disposition', 'attachment; filename='
                    + new Buffer(filename).toString('binary'));

            res.end(result, 'binary');
        });
    });
});

router.get("/detail", function(req, res)
{
    var isPackage = false;
    if (!req.query.actid)
    {
        var activity = {name: "新建套票活动"};
        res.render("package_activity_detail", {activity:activity});
        return;
    }
    else
    {
        var idObj = getIDClass(req.query.actid);

        lock.acquire(PACKAGE_ACTIVITY_DB, function(){
            db[PACKAGE_ACTIVITY_DB].find({_id:idObj},function(err1,docs1){
                if (err1 || docs1.length == 0)
                {
                    res.send("没有这个id对应的活动！");
                    lock.release(PACKAGE_ACTIVITY_DB);
                    return;
                }
                isPackage = true;
                var act = docs1[0];
                var st = parseInt(docs1[0].start_time, 10);
                var et = parseInt(docs1[0].end_time, 10);
                var bs = parseInt(docs1[0].book_start, 10);
                var be = parseInt(docs1[0].book_end, 10);
                docs1[0].description.replace(/\n/g,"\\\\n");
                var activity = {
                    name: act.name,
                    key: act.key,
                    place: act.place,
                    description: act.description,
                    start_time: {
                        year: moment(st).get("year"),
                        month: (moment(st).get("month")+1),
                        day: moment(st).get("date"),
                        hour: moment(st).get("hour"),
                        minute: moment(st).get("minute")
                    },
                    end_time: {
                        year: moment(et).get("year"),
                        month: (moment(et).get("month")+1),
                        day: moment(et).get("date"),
                        hour: moment(et).get("hour"),
                        minute: moment(et).get("minute")
                    },
                    total_packages: act.total_packages,
                    pic_url: act.pic_url,
                    book_start: {
                        year: moment(bs).get("year"),
                        month: (moment(bs).get("month")+1),
                        day: moment(bs).get("date"),
                        hour: moment(bs).get("hour"),
                        minute: moment(bs).get("minute")
                    },
                    book_end: {
                        year: moment(be).get("year"),
                        month: (moment(be).get("month")+1),
                        day: moment(be).get("date"),
                        hour: moment(be).get("hour"),
                        minute: moment(be).get("minute")
                    },
                    need_package_or_not:act.need_package_or_not,
                    package_need_seat: act.package_need_seat,
                    status: act.status,
                    id: req.query.actid
                };
                if (activity.package_need_seat == "0"){
                    res.render("package_activity_detail", {activity:activity});
                    lock.release(PACKAGE_ACTIVITY_DB);
                    return;
                }
                else if (activity.package_need_seat == "1"){
                    activity["package_need_seat_area"] = act.package_need_seat_area;
                    res.render("package_activity_detail", {activity:activity});
                    lock.release(PACKAGE_ACTIVITY_DB);
                    return;
                }
                else
                {
                    lock.release(PACKAGE_ACTIVITY_DB);
                    return;
                }
            });
        });
    }
});

router.post("/detail", function(req, res)
{
    var key;
    var activity = {};
    if (req.body.publish)
        activity.status = 1;
    else
        activity.status = 0;
    console.log(req.body["need_package_or_not"]);
    for (key in req.body)
    {

        if (key == "total_packages")
        {
            activity["remain_tickets"] = parseInt(req.body[key]);
            activity[key] = req.body[key];
        }
        else
        {
            activity[key] = req.body[key];
        }

    }

    if (activity.publish)
        delete activity.publish;
    if (activity.id)
        delete activity.id;
    if (activity.remain_tickets)
        activity.remain_tickets = parseInt(activity["remain_tickets"]);
    if (activity.total_packages)
        activity.total_packages = parseInt(activity["total_packages"]);
    if (activity.start_time)
        activity.start_time = parseInt(activity["start_time"]);
    if (activity.end_time)
        activity.end_time = parseInt(activity["end_time"]);
    if (activity.book_start)
        activity.book_start = parseInt(activity["book_start"]);
    if (activity.book_end)
        activity.book_end = parseInt(activity["book_end"]);
    if (activity.need_package_or_not)
        activity.need_package_or_not = parseInt(activity["need_package_or_not"]);
    if (activity.package_need_seat)
        activity.package_need_seat = parseInt(activity["package_need_seat"]);
    if (activity.package_need_seat_area)
        activity.package_need_seat_area = parseInt(activity["package_need_seat_area"]);

    console.log(activity);
    if (req.body.id == undefined) //新建活动
    {
        lock.acquire(PACKAGE_ACTIVITY_DB, function () {
            db[PACKAGE_ACTIVITY_DB].find({key: activity["key"], $or: [{status: 0}, {status: 1}]}, function (err, docs) {
                if (err || docs.length != 0) {
                    res.send("404#新建活动失败，已经有同代称的活动！");
                    lock.release(PACKAGE_ACTIVITY_DB);
                    return;
                }
                    if (!(activity["name"] && activity["key"] && activity["place"] && activity["description"] &&
                        activity["remain_tickets"] != undefined && activity["pic_url"] && activity["start_time"] &&
                        activity["end_time"] && activity["book_start"] && activity["book_end"] &&
                        activity["package_need_seat"] != undefined && activity["total_packages"] != undefined &&
                        activity["need_package_or_not"] != undefined)) {
                        res.send("404#活动信息不完整，没有录入数据库！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (activity["remain_tickets"] < 0) {
                        res.send("404#活动余票量小于0！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["end_time"]).isBefore(activity["start_time"])) {
                        res.send("404#活动结束时间早于开始时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["book_end"]).isBefore(activity["book_start"])) {
                        res.send("404#抢票结束时间早于开始时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["start_time"]).isBefore()) {
                        res.send("404#活动开始时间早于当前时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["book_start"]).isBefore()) {
                        res.send("404#抢票开始时间早于当前时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }

                    /*if (activity["package_need_seat"] == "1") {
                     if (activity["package_need_seat_area"] == "0")
                     activity["package_need_seat_area"] = "A区";
                     else if (activity["package_need_seat_area"] == "1")
                     activity["package_need_seat_area"] = "B区";
                     else if (activity["package_need_seat_area"] == "2")
                     activity["package_need_seat_area"] = "C区";
                     else if (activity["package_need_seat_area"] == "3")
                     activity["package_need_seat_area"] = "D区";
                     else if (activity["package_need_seat_area"] == "4")
                     activity["package_need_seat_area"] = "E区";
                     }*/

                    var st = activity["start_time"];
                    var be = activity["book_end"];
                    if (!(moment([moment(be).year(), moment(be).month(), moment(be).date()]).isBefore(
                            [moment(st).year(), moment(st).month(), moment(st).date()]))) {
                        res.send("404#抢票结束时间应不晚于活动开始的前一天！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (activity["description"])
                        activity["description"] = activity["description"].replace(/\r?\n/g, "\\n");
                    console.log("121");
                    db[PACKAGE_ACTIVITY_DB].insert(activity, function () {
                        console.log("122");
                        db[PACKAGE_ACTIVITY_DB].find({key: activity["key"], $or: [{status: 0}, {status: 1}]},
                            function (err1, docs1) {
                                console.log("123");
                                if (err1 || docs1.length != 1) {
                                    res.send("404#活动数据库录入出错，或有相同代称的活动被同时录入，请删除它们再重新录入！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                                console.log("124");
                                if (activity["package_need_seat"] == "1") {
                                    res.send("200#新建活动成功(分区票务)！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                                else {
                                    res.send("200#新建活动成功(无选座票务)！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                            });
                    });
            });
        });
    }
    else //修改活动
    {
        var idObj = getIDClass(req.body.id);
        console.log(idObj);
        lock.acquire(PACKAGE_ACTIVITY_DB, function(){
            db[PACKAGE_ACTIVITY_DB].find({_id:idObj, $or:[{status:0},{status:1}]},function(err,docs){
                if (err || docs.length != 1)
                {
                    res.send("404#修改活动失败，没有此ID对应的活动！");
                    lock.release(PACKAGE_ACTIVITY_DB);
                    return;
                }
                if (docs[0].status == 0) //修改暂存的活动
                {
                    if (!(activity["name"] && activity["key"] && activity["place"] && activity["description"] &&
                        activity["remain_tickets"] != undefined && activity["pic_url"] && activity["start_time"] &&
                        activity["end_time"] && activity["book_start"] && activity["book_end"] &&
                        activity["package_need_seat"] != undefined && activity["total_packages"] != undefined &&
                        activity["need_package_or_not"] != undefined)) {
                        res.send("404#活动信息不完整，没有录入数据库！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (activity["remain_tickets"] < 0) {
                        res.send("404#活动余票量小于0！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["end_time"]).isBefore(activity["start_time"])) {
                        res.send("404#活动结束时间早于开始时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["book_end"]).isBefore(activity["book_start"])) {
                        res.send("404#抢票结束时间早于开始时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["start_time"]).isBefore()) {
                        res.send("404#活动开始时间早于当前时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["book_start"]).isBefore()) {
                        res.send("404#抢票开始时间早于当前时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }

                    /*if (activity["package_need_seat"] == "1") {
                     if (activity["package_need_seat_area"] == "0")
                     activity["package_need_seat_area"] = "A区";
                     else if (activity["package_need_seat_area"] == "1")
                     activity["package_need_seat_area"] = "B区";
                     else if (activity["package_need_seat_area"] == "2")
                     activity["package_need_seat_area"] = "C区";
                     else if (activity["package_need_seat_area"] == "3")
                     activity["package_need_seat_area"] = "D区";
                     else if (activity["package_need_seat_area"] == "4")
                     activity["package_need_seat_area"] = "E区";
                     }*/

                    var st = activity["start_time"];
                    var be = activity["book_end"];
                    if (!(moment([moment(be).year(), moment(be).month(), moment(be).date()]).isBefore(
                            [moment(st).year(), moment(st).month(), moment(st).date()]))) {
                        res.send("404#抢票结束时间应不晚于活动开始的前一天！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (activity["description"])
                        activity["description"] = activity["description"].replace(/\r?\n/g, "\\n");
                    console.log("121");
                    db[PACKAGE_ACTIVITY_DB].insert(activity, function () {
                        console.log("122");
                        db[PACKAGE_ACTIVITY_DB].find({key: activity["key"], $or: [{status: 0}, {status: 1}]},
                            function (err1, docs1) {
                                console.log("123");
                                if (err1 || docs1.length != 1) {
                                    res.send("404#活动数据库录入出错，或有相同代称的活动被同时录入，请删除它们再重新录入！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                                console.log("124");
                                if (activity["package_need_seat"] == "1") {
                                    res.send("200#新建活动成功(分区票务)！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                                else {
                                    res.send("200#新建活动成功(无选座票务)！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                            });
                    });
                }
                else //修改已经发布的活动
                {
                    if (activity.status == 0)
                    {
                        res.send("404#已发布的活动不允许暂存，没有录入数据库！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (!(activity["place"] && activity["description"] && activity["name"] &&
                        activity["pic_url"] && activity["start_time"] &&
                        activity["end_time"] && activity["book_end"]))
                    {
                        res.send("404#活动信息不完整，没有录入数据库！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }

                    if (activity["key"])
                    {
                        res.send("404#已发布的活动不允许修改活动代称!");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["start_time"]).isBefore())
                    {
                        res.send("404#活动开始时间早于当前时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    if (moment(activity["end_time"]).isBefore(activity["start_time"]))
                    {
                        res.send("404#活动结束时间早于开始时间！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }
                    var st = activity["start_time"];
                    var be = activity["book_end"];
                    if (!(moment([moment(be).year(), moment(be).month(), moment(be).date()]).isBefore(
                            [moment(st).year(), moment(st).month(), moment(st).date()])))
                    {
                        res.send("404#抢票结束时间应不晚于活动开始的前一天！请重新检查。");
                        lock.release(PACKAGE_ACTIVITY_DB);
                        return;
                    }

                    db[PACKAGE_ACTIVITY_DB].find({_id:idObj},function(err,docs){
                        if (err || docs.length == 0)
                        {
                            res.send("404#修改活动失败！数据库操作错误或没有这个活动ID!");
                            lock.release(PACKAGE_ACTIVITY_DB);
                            return;
                        }
                        if (moment(docs[0]["book_start"]).isBefore()) //抢票已经开始
                        {
                            if (activity["book_start"])
                            {
                                res.send("404#抢票已开始，不允许修改抢票开始时间!");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }
                            if (moment(activity["book_end"]).isBefore(docs[0]["book_start"]))
                            {
                                res.send("404#抢票结束时间早于开始时间！请重新检查。");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }
                            if (activity["remain_tickets"] != undefined)
                            {
                                res.send("404#抢票已开始，不允许更改总票数！请重新检查。");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }
                            if (activity["need_package_or_not"] != undefined)
                            {
                                res.send("404#抢票已开始，不允许更改票的种类！请重新检查。");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }
                            if (activity["package_need_seat"] != undefined)
                            {
                                res.send("404#抢票已开始，不允许更改座位分配方式！请重新检查。");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }
                            if (activity["package_need_seat_area"] != undefined)
                            {
                                res.send("404#抢票已开始，不允许更改套票区域！请重新检查。");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }
                            if (activity["description"])
                                activity["description"] = activity["description"].replace(/\r?\n/g, "\\n");
                            db[PACKAGE_ACTIVITY_DB].update({_id:idObj},{$set: activity},{multi:false},function(err,result){
                                if (err || result.n != 1)
                                {
                                    res.send("404#修改活动失败，没有此ID对应的活动！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                                if (activity.status == 1)
                                {
                                    if (urls.autoRefresh)
                                    {
                                        act_info.getCurrentActivity(cm.autoClearOldMenus);
                                    }
                                    cache.clearCache();
                                }
                                res.send("200#修改活动成功！");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            });
                        }
                        else //抢票还没开始
                        {
                            if (moment(activity["book_end"]).isBefore(docs[0]["book_start"]))
                            {
                                res.send("404#抢票结束时间早于开始时间！请重新检查。");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }
                            if (!(activity["remain_tickets"] != undefined && activity["need_package_or_not"] != undefined))
                            {
                                res.send("404#总票数和座位分配信息缺失，请重新检查。");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }
                            if (activity["remain_tickets"] < 0)
                            {
                                res.send("404#活动余票量小于0！请重新检查。");
                                lock.release(PACKAGE_ACTIVITY_DB);
                                return;
                            }

                            if (activity["description"])
                                activity["description"] = activity["description"].replace(/\r?\n/g, "\\n");
                            db[PACKAGE_ACTIVITY_DB].update({_id:idObj},{$set: activity},{multi:false},function(err,result){
                                if (err || result.n != 1)
                                {
                                    res.send("404#修改活动失败，没有此ID对应的活动！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                                if (activity["package_need_seat"] == 1)
                                {
                                    res.send("200#修改活动成功(分区票务)！");
                                    lock.release(PACKAGE_ACTIVITY_DB);
                                    return;
                                }
                                else
                                {
                                    if (activity.status == 1)
                                    {
                                        if (urls.autoRefresh)
                                        {
                                            act_info.getCurrentActivity(cm.autoClearOldMenus);
                                        }
                                        cache.clearCache();
                                    }
                                    res.send("200#修改活动成功(无选座票务)！");
                                    lock.release(ACTIVITY_DB);
                                    return;
                                }
                            });
                        }
                    });
                }
            });
        });
    }

});

module.exports = router;
/**
 * Created by 13121 on 2015/12/6.
 */
