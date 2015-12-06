var express = require('express');
var router = express.Router();

var i=0;

/* GET home page. render起渲染作用*/
router.get('/', function(req, res) {
    res.render('index', { title: 'Express', tester: i++ }/*大括号里面是网页中要用到的参数*/);
});

module.exports = router;
