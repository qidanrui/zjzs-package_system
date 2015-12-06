var width;
var status;
var max_width;
var ticketIdTransferd;

window.onload = function(){
    status = ticket.status;
    width=$(".cz_order").width();
    max_width=$(window).height();
    if(width > max_width)
        width = max_width;

    transferTicketId();
    initETicket();

    if(isIE()){
        $("#isIE").css("display", "");
    }
}

function isIE(){
    var a1 = navigator.userAgent;
    var yesIE = a1.search(/Trident/i);
    if(yesIE > 0){
        return true;
    }
    else{
        return false;
    }

}

function transferTicketId(){
    var str = ticket.id.substring(0,12);
    ticketIdTransferd = 0;
    var i = 0;
    for(i=0; i<str.length; i++){
        ticketIdTransferd = ticketIdTransferd * 10 + str[i].charCodeAt() % 10;
    }
    ticketIdTransferd = ticket.time.substring(0,4) + ticketIdTransferd;
}

function initETicket(){
    setValue();
    if(ticket.seat != ""){
        $("#ticket_seat").css("display", "");
    }
    //如果是新清演出票的话
    if(ticket.status == 1){
        alertInfo("请关注紫荆之声票务信息，及时换票");
        $("#ticketPayInfo").css("display", "");
    }

  /*  //仅在综体区有座位引导
    if(ticket.status > 1){
        $("#eTicket").css("width", "50%");
        $("#mapGuide").css("display", "");
        $("#blockNotify").css("display", "");
    }*/


    $("#qrcodeWrap").width(width*0.65)
    $('#qrcode').qrcode({
        width: width*0.65,
        height: width*0.65,
        text: ticket.id
    });
}

function setValue(){
    var id = ticket.id;
    var seat = ticket.seat;
    /*if(ticket.status == 1){
        seat = "等待选座";
    }
    else{*/
        var w = seat.substring(0,1);
        if(w <= 'E' && w >= 'A'){
            $("#blockNotify").html(w);
            $("#block_" + w).children("[id^=area]").css("background-color", "#f0ee2d");
        }
    //}

    var statusList = ["", "等待领取", "已领取"];
    var status = ticket.status;
    if(status > 2 || status < 1)
        status = 0;

   /* if(ticket.needseat == 2 && ticket.status == 2 && !ticket.isPaid){
        $("#ticket_status").html("等待支付");
    }
    else if(ticket.needseat == 2 && ticket.status >= 2 && ticket.isPaid){
        $("#ticket_status").html("已支付");
    }
    else{*/
        $("#ticket_status").html(statusList[status]);
   // }

    $("#ticket_time").html("日期："+ticket.time);
    $("#ticket_title").html(ticket.title);
    $("#ticket_seat").html("座位："+seat);
    $("#ticket_place").html("场馆："+ticket.place);
    $("#ticket_type").html("套票类型："+ticket.type+" 人套票");

    $("#ticket_cancel").html("退票方式：回复 '退票 "+ "套票 "  + ticket.name + "'");
    $("#ticket_order").html("票号："+ ticketIdTransferd);
    if(ticket.status === 1){
        //$("#ticketPrice").html("票价："+ticket.price+"元");
        $("#bookHall").html("请到活动指定地点领票");
    }
}

function alertInfo(info){
    $("#alertInfo").html(info);
    $("#alertFrame").css("display", "inherit");
    $("#alertFrame").animate({
        top: '50%',
        opacity: '.9',
    }, 1000, function(){
        setTimeout(function(){
            $("#alertFrame").animate({
                top: '20%',
                opacity: '0',
            }, 600, function(){
                $("#alertFrame").css("display", "none");
            })
        }, 1000);
    });
}