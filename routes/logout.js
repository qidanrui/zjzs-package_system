var express = require('express');
var router = express.Router();

//得到logout请求，回应动作
router.get("/", function(req, res, next)
{
    req.session.user=null;
    //登出后跳转到login界面
    res.redirect("/login");
});

module.exports = router;
