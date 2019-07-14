var utils = require("./utils.js");
var auth  = require("./auth/AuthServer.js");

var fs    = require("fs");
var util  = require("util");

auth.runServer();

utils.log(" ");
utils.log("Auth server started.");