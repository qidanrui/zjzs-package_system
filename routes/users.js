//*********下面几个未加注释的函数并不太懂。。。

var express = require('express');
var router = express.Router();

//加载，初始化
var model = require('../models/models');
var lock = require('../models/lock');
var urls = require("../address_configure");

//加载router中关于user的其他三个文件
var manageRoute = require("./user_manage");
var purchaseRoute = require("./user_purchase");
var uploadRoute = require("./user_upload_pic");
var package_manageRoute = require("./package_user_manage");

//初始化数据库
var ADMIN_DB = model.admins;
var db = model.db;

/* GET users listing. */
 //通过express应用的use，将router路径上的login页面绑定：
router.use("/", function(req, res, next)
{
    if (req.session.user==null)
        res.redirect("/login");
    else
        next();
});

//get现在正在登陆状态的用户信息，或者说用户发出要查看自己信息的请求，中间代码还需细看
router.get("/", function(req, res)
{
    db[ADMIN_DB].find({user:req.session.user},function(err,docs)
    {
        if (err || docs.length==0)
        {
            req.session.user=null;
            res.redirect("/login");
            return;
        }
        if (docs[0].manager===true)
        {
            res.redirect("/users/manage");
            return;
        }
        if (docs[0].cashier===true)
        {
            res.redirect("/users/purchase");
            return;
        }
        req.session.user=null;
        res.redirect("/login");
        return;
    });
});

//通过express应用的use，将router路径上的login页面绑定：
router.use("/manage", function(req, res, next)
{
    db[ADMIN_DB].find({user:req.session.user,manager:true},function(err,docs)
    {
        if (err || docs.length==0)
        {
            req.session.user=null;
            res.redirect("/login");
            return;
        }
        next();
    });
});
router.use("/manage",manageRoute);
router.use("/package_manage", package_manageRoute);
router.use("/purchase", function(req, res, next)
{
    db[ADMIN_DB].find({user:req.session.user,cashier:true},function(err,docs)
    {
        if (err || docs.length==0)
        {
            req.session.user=null;
            res.redirect("/login");
            return;
        }
        next();
    });
});
router.use("/purchase",purchaseRoute);

router.use("/upload",uploadRoute);

module.exports = router;
