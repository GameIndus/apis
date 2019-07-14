var fs    = require('fs');
var mysql = require('mysql');
var config = require('../config');

var logCooldown    = 2000;
var logs           = {};
var SERVER_VERSION = 0.20;

exports.log = function(message, type){
	if(message == " "){console.log(message);return false;}
    if(type == undefined) type = "info";

    if(logs[message] != null){
        var time = logs[message];
        if(Date.now() - time < logCooldown) return false;
        else delete logs[message];
    }

    var date = new Date();
    var prefix = "[" + exports.leftPad(date.getHours(), 2) + ":" + exports.leftPad(date.getMinutes(), 2) + ":" + ("0" + date.getSeconds()).slice(-2) + " " + type.toUpperCase() + "]"; 

    if(type == "error"){
        var err = new Error(prefix + " " + message);
        console.log(prefix + " " + message);
        console.log(err.stack);
    }
    else console.log(prefix + " " + message);
    logs[message] = Date.now();
}
exports.leftPad = function(a,b){for(var c=a+"";c.length<b;)c="0"+c;return c}
exports.getServerVersion = function(){return SERVER_VERSION;}

exports.loadFile = function(path, success, error){
    fs.readFile(path, 'utf8', function (err,data) {
	  if (err) {
	    error(err);
	  }else{
	  	success(JSON.parse(data));
	  }
	});
}
exports.parseJson = function(json){
    try{
        return JSON.parse(json);
    } catch(e){
        exports.log(e, "ERROR");
        exports.stackTrace();
        return {};
    }
}
exports.objectToJson = function(string){
    try{
        return JSON.stringify(string);
    } catch(e){
        exports.log(e, "ERROR");
        exports.stackTrace();
        return {};
    }
}
exports.extend = function(){
    // Variables
    var extended = {};
    var deep = false;
    var i = 0;
    var length = arguments.length;

    // Check if a deep merge
    if ( Object.prototype.toString.call( arguments[0] ) === '[object Boolean]' ) {
        deep = arguments[0];
        i++;
    }

    // Merge the object into the extended object
    var merge = function (obj) {
        for ( var prop in obj ) {
            if ( Object.prototype.hasOwnProperty.call( obj, prop ) ) {
                // If deep merge and property is an object, merge properties
                if ( deep && Object.prototype.toString.call(obj[prop]) === '[object Object]' ) {
                    extended[prop] = exports.extend( true, extended[prop], obj[prop] );
                } else {
                    extended[prop] = obj[prop];
                }
            }
        }
    };

    // Loop through each object and conduct a merge
    for ( ; i < length; i++ ) {
        var obj = arguments[i];
        merge(obj);
    }

    return extended;
}
exports.renameKey = function(obj, oldKey, newKey){
    var res = {};

    for(var key in obj){
        if(obj.hasOwnProperty(key)){
            var val = obj[key];

            if(typeof(val) === 'object'){
                res[key] = renameKey(val, oldKey, newKey);
            }else{
                if(key != oldKey)
                    res[key] = val;
                else
                    res[newKey] = val;
            }
        }
    }
    return res;
}
exports.removeKey = function(obj, keyToRemove){
    var res = {};

    for(var key in obj){
        if(obj.hasOwnProperty(key)){
            var val = obj[key];

            if(typeof(val) === 'object'){
                res[key] = removeKey(val, keyToRemove);
            }else{
                if(key != keyToRemove)
                    res[key] = val;
            }
        }
    }

    return res;
}
exports.getMysql = function(){
	var connection = mysql.createConnection(config.mysql);
    connection.connect();
    return connection;
}
exports.stackTrace = function() {
    var err = new Error();
    console.log(err.stack);
}


String.prototype.replaceAll=function(a,b){return this.split(a).join(b)};
Object.prototype.clone=function(){return JSON.parse(JSON.stringify(this))}
Array.prototype.clone=function(){return JSON.parse(JSON.stringify(this))}
Object.prototype.isArray=function(){return void 0!==this.length}