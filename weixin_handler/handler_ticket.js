var template = require('./reply_template');
var model = require('../models/models');
var lock = require('../models/lock');
var urls = require("../address_configure");
var checker = require("./checkRequest");
var basicInfo = require("../weixin_basic/settings.js");

//Attentez: keep the activity::key unique globally.
var TICKET_DB = model.tickets;
var PACKAGE_TICKET_DB = model.package_tickets;
var USER_DB = model.students;
var ACTIVITY_DB = model.activities;
var PACKAGE_DB = model.package_activity;
var SEAT_DB = model.seats;
var db = model.db;

var alphabet = "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM0123456789";

var act_cache={};
var pack_act_cache={};
var rem_cache={};
var rem_pack_cache={};
var tik_cache={};
var pack_tik_cache={};
var usr_lock={};

exports.clearCache=function()
{
    act_cache={};
    pack_act_cache={};
}

function verifyStudent(openID,ifFail,ifSucc)
{
    db[USER_DB].find({weixin_id:openID,status:1},function(err,docs)
    {
        if (err || docs.length==0)
        {
            ifFail();
            return;
        }
        ifSucc(docs[0].stu_id);
    });
}
exports.verifyStu=verifyStudent;
function verifyActivities(actKey,ifFail,ifSucc)
{
    var timer = new Date();
    var current=timer.getTime();
    var theAct=act_cache[actKey];
    if (theAct)
    {
        if (current<theAct.book_end)
        {
            if (current>theAct.book_start)
            {
                ifSucc(theAct._id,theAct);
                return;
            }
            ifFail(theAct.book_start-current);
            return;
        }
        act_cache[actKey]=null;
        tik_cache[actKey]=null;
        ifFail();
        return;
    }
    db[ACTIVITY_DB].find(
    {
        key:actKey,
        book_end:{$gt:current},
        status:1
    },function(err,docs)
    {
        if (err || docs.length==0)
        {
            ifFail();
            return;
        }
        act_cache[actKey]=docs[0];
        if (current>docs[0].book_start)
        {
            ifSucc(docs[0]._id,docs[0]);
            return;
        }
        else
        {
            ifFail(docs[0].book_start-current);
            if (tik_cache[actKey]==null)
            {
                lock.acquire("rem_tik_fetcher",function()
                {
                    if (tik_cache[actKey]!=null)
                    {
                        lock.release("rem_tik_fetcher");
                        return;
                    }
                    tik_cache[actKey]={};
                    tik_cache[actKey].tikMap={};
                    tik_cache[actKey].usrMap={};
                    lock.release("rem_tik_fetcher");
                    return;
                });
            }
            return;
        }
    });
}
function getRandomString()
{
    var ret="";

    for (var i=0;i<13;i++)
        ret+=alphabet[Math.floor(Math.random()*alphabet.length)];
    return ret;
}

//Attentez: this function can only be called on condition that the collection is locked.
function generateUniqueCode(callback,prefix,actKey)
{
    while (true)
    {
        var tickCode=prefix+"_"+getRandomString();
        if (tik_cache[actKey].tikMap[tickCode]==null)
        {
            callback(tickCode);
            return;
        }
    }
}


function presentTicket(msg,res,tick,act)
{
    var tmp="恭喜，抢票成功！\n";
    tmp+=template.getHyperLink("点我查看电子票",urls.ticketInfo+"?ticketid="+tick.unique_id);
    if (act.need_seat!=0)
        tmp+="\n注意:该活动需在抢票结束前选座(区)，请进入电子票选择。";
    res.send(template.getPlainTextTemplate(msg,tmp));
}

function fetchRemainTicket(key,callback)
{
    if (rem_cache[key]!=null)
    {
        callback();
        return;
    }
    lock.acquire("rem_tik_fetcher",function()
    {
        if (rem_cache[key]!=null)
        {
            lock.release("rem_tik_fetcher");
            callback();
            return;
        }
        db[ACTIVITY_DB].find(
        {
            key:key,
            status:1
        },function(err,docs)
        {
            if (err || docs.length==0)
            {
                lock.release("rem_tik_fetcher");
                return;
            }
            if (tik_cache[key]==null)
            {
                tik_cache[key]={};
                tik_cache[key].tikMap={};
                tik_cache[key].usrMap={};
                db[TICKET_DB].find({activity:docs[0]._id},function(err2,docs2)
                {
                    if (err2)
                    {
                        lock.release("rem_tik_fetcher");
                        return;
                    }
                    for (var i=0;i<docs2.length;i++)
                    {
                        tik_cache[key].tikMap[docs2[i].unique_id]=true;
                        if (docs2[i].status!=0)
                            tik_cache[key].usrMap[docs2[i].stu_id]=true;
                    }
                    rem_cache[key]=docs[0].remain_tickets;
                    lock.release("rem_tik_fetcher");
                    callback();
                    return;
                });
            }
            else
            {
                rem_cache[key]=docs[0].remain_tickets;
                lock.release("rem_tik_fetcher");
                callback();
                return;
            }
        });
    });
}

function getTimeFormat(timeInMS)
{
    var sec=Math.floor(timeInMS/1000);
    var min=Math.floor(sec/60);
    var hou=Math.floor(min/60);

    sec-=min*60;
    min-=hou*60;
    if (hou+min+sec==0)
        return "1秒";
    return (hou>0?hou+"小时":"")+(min>0?min+"分":"")+(sec>0?sec+"秒":"");
}

function needValidateMsg(msg) {
  return template.getPlainTextTemplate(msg,'<a href="' + urls.validateAddress
    + '?openid=' + msg.FromUserName +  '">请先点我绑定学号。</a>');
}

exports.check_get_ticket=function(msg)
{
    if (checker.checkMenuClick(msg).substr(0,basicInfo.WEIXIN_BOOK_HEADER.length)===basicInfo.WEIXIN_BOOK_HEADER)
        return true;
    if (msg.MsgType[0]==="text")
        if (msg.Content[0]==="抢票" || msg.Content[0].substr(0,3)==="抢票 ")
            return true;
    return false;
}
exports.faire_get_ticket=function(msg,res)
{
    var actName,openID;

    if (msg.MsgType[0]==="text")
    {
        if (msg.Content[0]==="抢票")
        {
            res.send(template.getPlainTextTemplate(msg,"请使用“抢票 活动代称”的命令或菜单按钮完成指定活动的抢票。"));
            return;
        }
        else
        {
            actName=msg.Content[0].substr(3);
        }
    }
    else
    {
        actName=msg.EventKey[0].substr(basicInfo.WEIXIN_BOOK_HEADER.length);
    }

    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        if (usr_lock[stuID]!=null)
        {
            res.send(template.getPlainTextTemplate(msg,"您的抢票请求正在处理中，请稍后通过查票功能查看抢票结果(/▽＼)"));
            return;
        }

        verifyActivities(actName,function(tl)
        {
            if (tl==null)
                res.send(template.getPlainTextTemplate(msg,"目前没有符合要求的活动处于抢票期。"));
            else
                res.send(template.getPlainTextTemplate(msg,"该活动将在 "+getTimeFormat(tl)+" 后开始抢票，请耐心等待！"));
        },function(actID,staticACT)
        {
            fetchRemainTicket(actName,function()
            {
                //Attentez: unlike stuID which is THUid, act id is simply act._id
                if (tik_cache[actName].usrMap[stuID]!=null)
                {
                    res.send(template.getPlainTextTemplate(msg,"你已经有票啦，请用查票功能查看抢到的票吧！"));
                    return;
                }
                else
                {
                    if (usr_lock[stuID]!=null)
                    {
                        res.send(template.getPlainTextTemplate(msg,"您的抢票请求正在处理中，请稍后通过查票功能查看抢票结果(/▽＼)"));
                        return;
                    }
                    usr_lock[stuID]="true";

                    if (rem_cache[actName]==0)
                    {
                        usr_lock[stuID]=null;
                        res.send(template.getPlainTextTemplate(msg,"对不起，票已抢完...\n(╯‵□′)╯︵┻━┻。"));
                        return;
                    }
                    rem_cache[actName]--;
                    db[ACTIVITY_DB].update(
                    {
                        _id:actID
                    },
                    {
                        $inc: {remain_tickets:-1}
                    },{multi:false},function(err,result)
                    {
                        if (err || result.n==0)
                        {
                            usr_lock[stuID]=null;
                            res.send(template.getPlainTextTemplate(msg,"(╯‵□′)╯︵┻━┻"));
                            return;
                        }
                        var ss=actID.toString();
                        generateUniqueCode(function(tiCode)
                        {
                            tik_cache[actName].tikMap[tiCode]=true;
                            tik_cache[actName].usrMap[stuID]=true;
                            db[TICKET_DB].insert(
                            {
                                stu_id:     stuID,
                                unique_id:  tiCode,
                                activity:   actID,
                                status:     1,
                                seat:       "",
                                cost:       (staticACT.need_seat==2?parseInt(staticACT.price):0)
                            }, function()
                            {
                                usr_lock[stuID]=null;
                                presentTicket(msg,res,{unique_id:tiCode},staticACT);
                                return;
                            });
                        },ss.substr(0,8)+ss.substr(14),actName);
                    });
                }
            });
        });
    });
}

//==================================================//packageticketInfo未設置
function presentPackTicket(msg,res,tick,act)
{
    var tmp="恭喜，抢套票成功！\n";
    tmp+=template.getHyperLink("点我查看电子票",urls.packageticketInfo+"?ticketid="+tick.unique_id);
    res.send(template.getPlainTextTemplate(msg,tmp));
}

function fetchRemainPackTicket(key,callback)
{
    if (rem_pack_cache[key]!=null)
    {
        callback();
        return;
    }
    lock.acquire("rem_pack_tik_fetcher",function()
    {
        if (rem_pack_cache[key]!=null)
        {
            lock.release("rem_pack_tik_fetcher");
            callback();
            return;
        }
        db[PACKAGE_DB].find(
            {
                key:key,
                status:1
            },function(err,docs)
            {
                if (err || docs.length==0)
                {
                    lock.release("rem_pack_tik_fetcher");
                    return;
                }
                if (rem_pack_cache[key]==null)
                {
                    pack_tik_cache[key]={};
                    pack_tik_cache[key].tikMap={};
                    pack_tik_cache[key].usrMap={};
                    db[PACKAGE_TICKET_DB].find({activity:docs[0]._id},function(err2,docs2)
                    {
                        if (err2)
                        {
                            lock.release("rem_pack_tik_fetcher");
                            return;
                        }
                        for (var i=0;i<docs2.length;i++)
                        {
                            pack_tik_cache[key].tikMap[docs2[i].unique_id]=true;
                            if (docs2[i].status!=0)
                                pack_tik_cache[key].usrMap[docs2[i].stu_id]=true;
                        }
                        rem_pack_cache[key]=docs[0].remain_tickets;
                        lock.release("rem_pack_tik_fetcher");
                        callback();
                        return;
                    });
                }
                else
                {
                    rem_pack_cache[key]=docs[0].remain_tickets;
                    lock.release("rem_pack_tik_fetcher");
                    callback();
                    return;
                }
            });
    });
}

function verifyPackActivities(actKey,ifFail,ifSucc)
{
    var timer = new Date();
    var current=timer.getTime();
    var theAct=pack_act_cache[actKey];
    if (theAct)
    {
        if (current<theAct.book_end)
        {
            if (current>theAct.book_start)
            {
                ifSucc(theAct._id,theAct);
                return;
            }
            ifFail(theAct.book_start-current);
            return;
        }
        pack_act_cache[actKey]=null;
        pack_tik_cache[actKey]=null;
        ifFail();
        return;
    }
    db[PACKAGE_DB].find(
        {
            key:actKey,
            book_end:{$gt:current},
            status:1
        },function(err,docs)
        {
            if (err || docs.length==0)
            {
                ifFail();
                return;
            }
            pack_act_cache[actKey]=docs[0];
            if (current>docs[0].book_start)
            {
                ifSucc(docs[0]._id,docs[0]);
                return;
            }
            else
            {
                ifFail(docs[0].book_start-current);
                if (pack_tik_cache[actKey]==null)
                {
                    lock.acquire("rem_pack_tik_fetcher",function()
                    {
                        if (pack_tik_cache[actKey]!=null)
                        {
                            lock.release("rem_pack_tik_fetcher");
                            return;
                        }
                        pack_tik_cache[actKey]={};
                        pack_tik_cache[actKey].tikMap={};
                        pack_tik_cache[actKey].usrMap={};
                        lock.release("rem_pack_tik_fetcher");
                        return;
                    });
                }
                return;
            }
        });
}

function generateUniquePackCode(callback,prefix,actKey)
{
    while (true)
    {
        var tickCode=prefix+"_"+getRandomString();
        if (pack_tik_cache[actKey].tikMap[tickCode]==null)
        {
            callback(tickCode);
            return;
        }
    }
}
//==================================================

exports.check_get_package=function(msg)
{
    if (checker.checkMenuClick(msg).substr(0,basicInfo.WEIXIN_BOOK_HEADER.length)===basicInfo.WEIXIN_BOOK_HEADER)
        return true;
    if (msg.MsgType[0]==="text")
        if (msg.Content[0].indexOf("套票") > -1 && msg.Content[0].indexOf("套票") !=3)
            return true;
    return false;
}

exports.faire_get_package=function(msg,res)
{
    var actName,openID;

    if (msg.MsgType[0]==="text")
    {
        if (msg.Content[0]==="套票")
        {
            res.send(template.getPlainTextTemplate(msg, "请使用“套票 活动代称”的命令或菜单按钮完成指定活动套票的抢票。"));
            return;
        }
        else
        {
            actName=msg.Content[0].substr(3);
        }
    }
    else
    {
        actName=msg.EventKey[0].substr(basicInfo.WEIXIN_BOOK_HEADER.length);
    }

    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        if (usr_lock[stuID]!=null)
        {
            res.send(template.getPlainTextTemplate(msg,"您的抢票请求正在处理中，请稍后通过查票功能查看抢票结果(/▽＼)"));
            return;
        }

        verifyPackActivities(actName,function(tl)
        {
            if (tl==null)
                res.send(template.getPlainTextTemplate(msg,"目前没有符合要求的活动处于抢套票期。"));
            else
                res.send(template.getPlainTextTemplate(msg,"该活动将在 "+getTimeFormat(tl)+" 后开始抢套票，请耐心等待！"));
        },function(actID,staticACT)
        {
            fetchRemainPackTicket(actName,function()
            {
                //Attentez: unlike stuID which is THUid, act id is simply act._id
                if (pack_tik_cache[actName].usrMap[stuID]!=null)
                {
                    res.send(template.getPlainTextTemplate(msg,"你已经有套票啦，请用查票功能查看抢到的套票吧！"));
                    return;
                }
                else
                {
                    if (usr_lock[stuID]!=null)
                    {
                        res.send(template.getPlainTextTemplate(msg,"您的抢票请求正在处理中，请稍后通过查票功能查看抢票结果(/▽＼)"));
                        return;
                    }
                    usr_lock[stuID]="true";

                    if (rem_cache[actName]==0)
                    {
                        usr_lock[stuID]=null;
                        res.send(template.getPlainTextTemplate(msg,"对不起，套票已抢完...\n(╯‵□′)╯︵┻━┻。"));
                        return;
                    }
                    rem_cache[actName]--;
                    db[PACKAGE_DB].update(
                        {
                            _id:actID
                        },
                        {
                            $inc: {remain_tickets:-1}
                        },{multi:false},function(err,result)
                        {
                            if (err || result.n==0)
                            {
                                usr_lock[stuID]=null;
                                res.send(template.getPlainTextTemplate(msg,"(╯‵□′)╯︵┻━┻"));
                                return;
                            }
                            var ss=actID.toString();
                            generateUniquePackCode(function(tiCode)
                            {
                                pack_tik_cache[actName].tikMap[tiCode]=true;
                                pack_tik_cache[actName].usrMap[stuID]=true;
                                db[PACKAGE_TICKET_DB].insert(
                                    {
                                        stu_id:     stuID,
                                        unique_id:  tiCode,
                                        activity:   actID,
                                        status:     1,
                                        seat:       staticACT.package_need_seat_area,
                                        cost:       0,
                                        type:       staticACT.need_package_or_not+1
                                    }, function()
                                    {
                                        usr_lock[stuID]=null;
                                        presentPackTicket(msg,res,{unique_id:tiCode},staticACT);
                                        return;
                                    });
                            },ss.substr(0,8)+ss.substr(14),actName);
                        });
                }
            });
        });
    });
}
//========================================
exports.check_reinburse_ticket=function(msg)
{
    if (msg.MsgType[0]==="text")
        if (msg.Content[0].indexOf("退票") > -1)
            return true;
    return false;
}
exports.faire_reinburse_ticket=function(msg,res)
{
    var actName,openID,tictype;
    if (msg.Content[0]==="退票")
    {
        //WARNING: Fill the activity name!!
        res.send(template.getPlainTextTemplate(msg,"请使用“退票 票类型(普通/套票) 活动代称”的命令完成指定活动的退票。"));
        return;
    }
    else
    {
        tictype = msg.Content[0].substr(3,2);
        actName=msg.Content[0].substr(6);
    }

    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        if(tictype==="普通"){
            verifyActivities(actName,function()
            {
                res.send(template.getPlainTextTemplate(msg,"目前没有符合要求的活动处于退票期。"));
            },function(actID)
            {
                db[TICKET_DB].findAndModify(
                    {
                        query: {stu_id:stuID,activity:actID,status:1},
                        update: {$set: {status:0}}
                    },function(err,result)
                    {
                        if (err || result==null)
                        {
                            res.send(template.getPlainTextTemplate(msg,
                                "未找到您的抢票记录或您的票已经支付，退票失败。如为已支付票，请联系售票机构退还钱款后退票。"));
                            return;
                        }
                        if (result.seat!="" && result.seat!=null)
                        {
                            var incIndex={};
                            incIndex[result.seat]=1;
                            db[SEAT_DB].update({activity:actID},
                                {
                                    $inc: incIndex
                                },function()
                                {
                                    //Nothing? Oui, ne rien.
                                });
                        }

                        fetchRemainTicket(actName,function()
                        {
                            db[ACTIVITY_DB].update({_id:actID},
                                {
                                    $inc: {remain_tickets:1}
                                },{multi:false},function()
                                {
                                    rem_cache[actName]++;
                                    tik_cache[actName].usrMap[stuID]=null;
                                    res.send(template.getPlainTextTemplate(msg,"退票成功。"));
                                    return;
                                });
                        });
                    });
            });
        }
        else if(tictype==="套票"){
            verifyPackActivities(actName,function()
            {
                res.send(template.getPlainTextTemplate(msg,"目前没有符合要求的套票活动处于退票期。"));
            },function(actID)
            {
                db[PACKAGE_TICKET_DB].findAndModify(
                    {
                        query: {stu_id:stuID,activity:actID,status:1},
                        update: {$set: {status:0}}
                    },function(err,result)
                    {
                        if (err || result==null)
                        {
                            res.send(template.getPlainTextTemplate(msg,
                                "未找到您的抢票记录或您的票已经支付，退套票失败。如为已支付票，请联系售票机构退还钱款后退票。"));
                            return;
                        }

                        fetchRemainTicket(actName,function()
                        {
                            db[PACKAGE_DB].update({_id:actID},
                                {
                                    $inc: {remain_tickets:1}
                                },{multi:false},function()
                                {
                                    rem_pack_cache[actName]++;
                                    pack_tik_cache[actName].usrMap[stuID]=null;
                                    res.send(template.getPlainTextTemplate(msg,"退票成功。"));
                                    return;
                                });
                        });
                    });
            });
        }
    });
}
//========================================
exports.check_list_ticket=function(msg)
{
    if (msg.MsgType[0]==="text")
        if (msg.Content[0]==="查票")
            return true;
    if (checker.checkMenuClick(msg)===basicInfo.WEIXIN_EVENT_KEYS['ticket_get'])
        return true;
    return false;
}
function renderTicketList(oneTicket,oneActivity,isSingle)
{
    var ret={};

    if (isSingle)
    {
        //Attentez: notify the user to select seat.
        ret[template.rich_attr.title]="抢票成功！";
        ret[template.rich_attr.description]=oneActivity.name;
    }
    else
        ret[template.rich_attr.title]=oneActivity.name;
    ret[template.rich_attr.url]=urls.ticketInfo+"?ticketid="+oneTicket.unique_id;
    ret[template.rich_attr.picture]=oneActivity.pic_url;

    return ret;
}
function renderPackTicketList(oneTicket,oneActivity,isSingle)
{
    var ret={};

    if (isSingle)
    {
        //Attentez: notify the user to select seat.
        ret[template.rich_attr.title]="抢票成功！";
        ret[template.rich_attr.description]=oneActivity.name;
    }
    else
        ret[template.rich_attr.title]=oneActivity.name;
    ret[template.rich_attr.url]=urls.packageticketInfo+"?ticketid="+oneTicket.unique_id;
    ret[template.rich_attr.picture]=oneActivity.pic_url;

    return ret;
}
exports.faire_list_ticket=function(msg,res)
{
    var openID;
    var isblack=0;
    var list2Render=[];
    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        db[TICKET_DB].find(
            {
                stu_id:stuID,
                $or:[{status:1},{status:2}]
            },function(err,docs)
            {
                if (err || docs.length==0)
                {
                    isblack = 1;
                    //res.send(template.getPlainTextTemplate(msg,"没有找到属于您的票哦，赶快去抢一张吧！"));
                    //return;
                }
                else{
                    var actList=[];
                    var actMap={};
                    for (var i=0;i<docs.length;i++)
                    {
                        actList.push({_id:docs[i].activity});
                    }
                    db[ACTIVITY_DB].find(
                        {
                            $or: actList
                        },function(err1,docs1)
                        {
                            if (err1 || docs1.length==0)
                            {
                                res.send(template.getPlainTextTemplate(msg,"出错了 T T，稍后再试。"));
                                return;
                            }
                            //WARNING: what if tickets>=WEIXIN_LIMIT?
                            for (var i=0;i<docs1.length;i++)
                            {
                                actMap[docs1[i]._id]=docs1[i];
                            }

                            var tmpEle;
                            tmpEle={};
                            tmpEle[template.rich_attr.title]="\n我的票夹\n";
                            tmpEle[template.rich_attr.description]=
                                "以下列表中是您抢到的票。(如果超过9个则可能有省略)";
                            var tmpEle2;
                            tmpEle2={};
                            tmpEle2[template.rich_attr.title]="\n普通票\n";

                            list2Render.push(tmpEle);
                            list2Render.push(tmpEle2);
                            for (var i=0;i<docs.length;i++)
                            {
                                list2Render.push(renderTicketList(docs[i],actMap[docs[i].activity],false));
                            }
                            //res.send(template.getRichTextTemplate(msg,list2Render));
                        });
                }
            });
        db[PACKAGE_TICKET_DB].find(
            {
                stu_id:stuID,
                $or:[{status:1},{status:2}]
            },function(err2,docs2)
            {
                if ((err2 || docs2.length==0)&&isblack)
                {
                   /* if(isblack==1){
                        res.send(template.getPlainTextTemplate(msg,"没有找到属于您的票哦，赶快去抢一张吧！"));
                        return;
                    }*/
                    res.send(template.getPlainTextTemplate(msg,"没有找到属于您的票哦，赶快去抢一张吧！"));
                    return;
                   /* else{
                        res.send(template.getRichTextTemplate(msg,list2Render));
                        return;
                    }*/
                }
                /*else if(err2 || docs2.length==0){
                    res.send(template.getRichTextTemplate(msg,list2Render));
                    return;
                }*/
                else{
                    var actList=[];
                    var actMap={};
                    for (var i=0;i<docs2.length;i++)
                    {
                        actList.push({_id:docs2[i].activity});
                    }
                    db[PACKAGE_DB].find(
                        {
                            $or: actList
                        },function(err3,docs3)
                        {
                            if (err3 || docs3.length==0)
                            {
                                if(isblack==1)
                                {
                                    res.send(template.getPlainTextTemplate(msg,"出错了 T T，请稍后再试。"));
                                    return;
                                }
                                else{
                                    res.send(template.getRichTextTemplate(msg,list2Render));
                                    return;
                                }
                                /*res.send(template.getPlainTextTemplate(msg,("出错了 T T，请稍后再试。"+isblack)));
                                return;*/
                            }
                            //WARNING: what if tickets>=WEIXIN_LIMIT?
                            for (var i=0;i<docs3.length;i++)
                            {
                                actMap[docs3[i]._id]=docs3[i];
                            }
                            if(isblack){
                                var tmpEle;
                                tmpEle={};
                                tmpEle[template.rich_attr.title]="\n我的票夹\n";
                                tmpEle[template.rich_attr.description]=
                                    "以下列表中是您抢到的票。(如果超过9个则可能有省略)";
                                list2Render.push(tmpEle);
                            }
                            var tmpEle2;
                            tmpEle2={};
                            tmpEle2[template.rich_attr.title]="\n套票\n";

                            list2Render.push(tmpEle2);
                            for (var i=0;i<docs2.length;i++)
                            {
                                list2Render.push(renderPackTicketList(docs2[i],actMap[docs2[i].activity],false));
                            }
                            res.send(template.getRichTextTemplate(msg,list2Render));
                        });
                }
            });
    });
    /*var openID;

    openID=msg.FromUserName[0];
    verifyStudent(openID,function()
    {
        //WARNING: may change to direct user to bind
        res.send(needValidateMsg(msg));
    },function(stuID)
    {
        db[TICKET_DB].find(
        {
            stu_id:stuID,
            $or:[{status:1},{status:2}]
        },function(err,docs)
        {
            if (err || docs.length==0)
            {
                db[PACKAGE_TICKET_DB].find(
                    {
                        stu_id:stuID,
                        $or:[{status:1},{status:2}]
                    },function(err2,docs2)
                    {
                        if (err2 || docs2.length==0)
                        {
                            res.send(template.getPlainTextTemplate(msg,"没有找到属于您的票哦，赶快去抢一张吧！"));
                            return;
                        }
                        var actList=[];
                        var actMap={};
                        var list2Render=[];
                        for (var i=0;i<docs2.length;i++)
                        {
                            actList.push({_id:docs2[i].activity});
                        }
                        db[PACKAGE_DB].find(
                            {
                                $or: actList
                            },function(err1,docs1)
                            {
                                if (err1 || docs1.length==0)
                                {
                                    res.send(template.getPlainTextTemplate(msg,"出错了 T T，稍后再试。"));
                                    return;
                                }
                                //WARNING: what if tickets>=WEIXIN_LIMIT?
                                for (var i=0;i<docs1.length;i++)
                                {
                                    actMap[docs1[i]._id]=docs1[i];
                                }

                                var tmpEle;
                                tmpEle={};
                                tmpEle[template.rich_attr.title]="\n我的票夹\n";
                                tmpEle[template.rich_attr.description]=
                                    "以下列表中是您抢到的票。(如果超过9个则可能有省略)";

                                list2Render.push(tmpEle);
                                for (var i=0;i<docs2.length;i++)
                                {
                                    list2Render.push(renderTicketList(docs2[i],actMap[docs2[i].activity],false));
                                }
                                res.send(template.getRichTextTemplate(msg,list2Render));
                            });
                    });
               // res.send(template.getPlainTextTemplate(msg,"没有找到属于您的票哦，赶快去抢一张吧！"));
               // return;
            }
            var actList=[];
            var actMap={};
            var list2Render=[];
            for (var i=0;i<docs.length;i++)
            {
                actList.push({_id:docs[i].activity});
            }
            db[ACTIVITY_DB].find(
            {
                $or: actList
            },function(err5,docs5)
            {
                if (err5 || docs5.length==0)
                {
                    res.send(template.getPlainTextTemplate(msg,"出错了 T T，稍后再试。"));
                    return;
                }
                //WARNING: what if tickets>=WEIXIN_LIMIT?
                for (var i=0;i<docs5.length;i++)
                {
                    actMap[docs5[i]._id]=docs5[i];
                }

                var tmpEle;
                tmpEle={};
                tmpEle[template.rich_attr.title]="\n我的票夹\n";
                tmpEle[template.rich_attr.description]=
                    "以下列表中是您抢到的票。(如果超过9个则可能有省略)";

                list2Render.push(tmpEle);
                for (var i=0;i<docs.length;i++)
                {
                    list2Render.push(renderTicketList(docs[i],actMap[docs[i].activity],false));
                }
                db[PACKAGE_TICKET_DB].find(
                    {
                        stu_id:stuID,
                        $or:[{status:1},{status:2}]
                    },function(err3,docs3)
                    {
                        if (err3 || docs3.length==0)
                        {
                            res.send(template.getRichTextTemplate(msg,list2Render));
                           // res.send(template.getPlainTextTemplate(msg,"没有找到属于您的票哦，赶快去抢一张吧！"));
                            return;
                        }
                        var actList2=[];
                        var actMap2={};
                        //var list2Render=[];
                        for (var i=0;i<docs3.length;i++)
                        {
                            actList2.push({_id:docs3[i].activity});
                        }
                        db[PACKAGE_DB].find(
                            {
                                $or: actList2
                            },function(err4,docs4)
                            {
                                if (err4 || docs4.length==0)
                                {
                                    res.send(template.getPlainTextTemplate(msg,"出错了 T T，稍后再试。"));
                                    return;
                                }
                                //WARNING: what if tickets>=WEIXIN_LIMIT?
                                for (var i=0;i<docs4.length;i++)
                                {
                                    actMap2[docs4[i]._id]=docs4[i];
                                }

                               /* var tmpEle;
                                tmpEle={};
                                tmpEle[template.rich_attr.title]="\n我的票夹\n";
                                tmpEle[template.rich_attr.description]=
                                    "以下列表中是您抢到的票。(如果超过9个则可能有省略)";

                                list2Render.push(tmpEle);*/
                              /*  for (var i=0;i<docs3.length;i++)
                                {
                                    list2Render.push(renderPackTicketList(docs3[i],actMap2[docs3[i].activity],false));
                                }
                                res.send(template.getRichTextTemplate(msg,list2Render));
                            });
                    });
               // res.send(template.getRichTextTemplate(msg,list2Render));
            });
        });
    });*/
}
