/*这个文件是对从后台传来的信息的进一步处理*/

var activity_extra_info=[{t:'活动时间',c:activity_time},{t:'活动地点',c:activity_place}];
if (activity_ticket_status==0)
{
    activity_extra_info.push({t:'活动票数',c:activity_remain_ticket+" 套"});
}
else if (activity_ticket_status==1)
{
    activity_extra_info.push({t:'剩余票数',c:"<span style='color:#dd001e'>"+activity_remain_ticket+"</span> 套"});
}

/********************************/
var activity_detail_title_2="抢票方式";
var get_ticket_method_title="抢票方式:";
/*
 var get_ticket_method_content=
 ' 线上抢票，先到先得！<br><div style="height:1px"></div>'+
 '· 在微信中直接回复<i style="color:#d0dd1e">"抢票　'+activity_key+'"</i><br>'+
 '· 或者，点击"抢票"菜单下的<i style="color:#d0dd1e">"'+activity_key+'"</i>按钮<br>';
 var activity_content_2 = '<b>'+activity_book_ticket_time+'</b>' + get_ticket_method_content + (!activity_seat_type?'':(activity_seat_type==1?'该活动分区域选座，抢到票后可进入查票界面进行选座。<br>':'抢到票后可进入查票界面进行选座。<br>'));
 get_ticket_method_content = '' + activity_book_ticket_time + get_ticket_method_content;*/
activity_extra_info.push({t:'套票类型',c:activity_type+" 人套票"});
/*var tmp = activity_area+64;
console.log(tmp);
var act_area = String.fromCharCode(tmp);
console.log(act_area);*/
var act_area;
if(activity_area==1){
    act_area = "A区";
}
else if(activity_area==2){
    act_area = "B区";
}
else if(activity_area==3){
    act_area = "C区";
}
else if(activity_area==4){
    act_area = "D区";
}
else if(activity_area==5){
    act_area = "E区";
}
if(activity_need_seat!=0){
    activity_extra_info.push({t:'套票区域',c:act_area});
}

var get_ticket_method_content=
    ' 线上抢票，先到先得！<br><div style="height:1px"></div>'+
    '· 在微信中直接回复<i style="color:#d0dd1e">"套票　'+activity_key+'"</i><br>'+
    '· 或者，点击"抢票"菜单下的<i style="color:#d0dd1e">"'+activity_key+'"</i>按钮<br>';


var activity_content_2='<b>'+activity_book_ticket_time+'</b>' + get_ticket_method_content + (activity_area==0?'':('该活动套票区域为'+act_area+'。<br>'));
get_ticket_method_content = '' + activity_book_ticket_time + get_ticket_method_content;
    /*'<b>'+activity_book_ticket_time+'</b>'+
    '， "清华大学紫荆之声"线上抢票，数量有限，先到先得。<br><div style="height:8px"></div>您可以:<br>'+
    '· 在微信中回复<i style="color:#dd881e">"套票　'+activity_key+'"</i>进行套票抢票;<br>'+
    '· 点击"抢票"下设二级菜单<i style="color:#dd881e">"'+activity_key+'"</i>按钮抢票。<br>'+
    (activity_area==''?'':('该活动套票区域为'+activity_area+'。<br>'));*/

var ticket_status=[
    "<b id='ticket_getting' style='color:#dd001e;'></b>",
    "<b id='ticket_getting' style='color:#dd001e;'></b>",
    "抢票已结束",
    "抢票成功",
    "已领票"
];

var get_ticket_show=true;
