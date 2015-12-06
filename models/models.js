var mongojs = require('mongojs');
var tickets = "ticket";
var activities = "activity";
var students = "student";
var admins = "manager";
var seats = "seat"
var votes = "vote"
var uservote = "uservote"
var package_activity = "package_activity";
var package_tickets = "package_ticket";
var package_activities = "package_activity";
var packages = "package_ticket";

exports.tickets = tickets;
exports.activities = activities;
exports.students = students;
exports.admins = admins;
exports.seats = seats;
exports.package_activities = package_activities;
exports.packages = packages;
exports.package_activity = package_activity;
exports.package_tickets = package_tickets;

exports.db = mongojs('mongodb://localhost/ticket', [tickets, activities, students, admins, seats, package_activity, package_tickets, package_activities, packages]);

exports.getIDClass=function(idValue)
{
    idValue=""+idValue;
    return mongojs.ObjectId(idValue);
}

exports.authIP = "127.0.0.1";
exports.authPort = 9003;
exports.authPrefix = "/v1";
