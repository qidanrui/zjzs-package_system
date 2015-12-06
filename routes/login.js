//大约是渲染一类的……不用管默认就好……
var express = require('express');
var router = express.Router();

//连接数据库
var model = require('../models/models');
//lock是啥具体还没看懂。。。
var lock = require('../models/lock');
//初始化url。。address_configure里面的
var urls = require("../address_configure");

//加载数据库管理员和数据库中的数据，初始化
var ADMIN_DB = model.admins;
var db = model.db;

//截取Get请求方式的url中含有/的请求，作用是当一个用户请求登录时候的动作
router.get("/", function(req, res, next)
{
    //有用户正在线上，不渲染login界面，跳到users界面
    if (req.session.user!=null)
        //redirect——跳转到某处
        res.redirect("/users");
    else
        //没有用户正在线上，渲染login界面
        res.render("login", {});
});

//截取post请求方式的url中含有/的请求，通过匹配用户名和密码判断登录是否成功
router.post("/", function(req, res)
{
    var resData={};
    db[ADMIN_DB].find({user:req.body.username},function(err,docs)
    {
        //登录失败：error或未注册
        if (err || docs.length==0)
        {
            resData.message="failed";
            resData.error="none";
        }
        else
        //登录成功
        {
            if (docs[0].password===req.body.password)
            {
                resData.message="success";
                resData.next=urls.userPage;
                req.session.user=req.body.username;
            }
            else
                //用户名密码不匹配
            {
                resData.message="failed";
                resData.error="wrong";
            }
        }
        //从JSON中解析出用户信息
        res.send(JSON.stringify(resData));
        return;
    });
});

module.exports = router;
