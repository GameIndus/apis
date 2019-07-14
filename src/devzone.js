var port = 30100;

var ws         = require("nodejs-websocket");
var utils      = require("./utils.js");
var util       = require('util');
var fs         = require("fs");
var path       = require("path");
// var PushBullet = require('pushbullet');

var manager  = require("./network/ListenersManager.js");
var auth     = require("./auth/AuthClient.js");
var config   = require('../config');

// var pusher = new PushBullet(config.pushbullet.token);

var log_folder = path.join(__dirname, '../', config.log_folder, '/');

if (!fs.existsSync(log_folder)) {
	fs.mkdirSync(log_folder);
}

var log_file = fs.createWriteStream(log_folder + 'devzone.log', {flags : 'w'});
var log_stdout = process.stdout;
console.log=function(a){log_file.write(util.format(a)+"\n"),log_stdout.write(util.format(a)+"\n")};

// Websocket server
var server = ws.createServer(function (conn) {
    conn.on("text", function (str) {
        if(this.request != null){
            manager.endRequest(this.request);
            this.request = null;
        }

        var req = new require("./network/Request.js")(server, conn).fromString(str);
        manager.newRequest(req, conn);
    });

    conn.on("close", function (code, reason) {

    });
}).listen(port);

utils.log(" ");
utils.log("Devzone server started on port :" + port + ".");

// Auto message screens
var services        = {};
var servicesToCheck = ["realtime", "main", "compiler", "dev_main", "dev_compiler", "auth"];
function checkServices(){
    for(var i = 0; i < servicesToCheck.length; i++){
        checkService(servicesToCheck[i]);
    }
    
    setTimeout(function(){
        checkServices();
    }, 6 * 1000);
}
function checkService(service){
     if(service.indexOf(".dev") > -1){
        service = service.replace(".dev", "");
        service = "dev_" + service;
    }

    var exec = require('child_process').exec;
    var cmd = 'sv status gi-' + service;

    exec(cmd, function(err, stdout, stderr) {
        var status = stdout.split(':')[0];
        var online = (status == "run");

        if(services[service] != null && services[service] == true && !online){
            // pusher.note("", "GameIndus: erreur sur le serveur " + service, "Le serveur " + service + " a crashé sans aucune raison. Merci d'intervenir", function(error, response) {});
        }

        services[service] = online;
    });
}
checkServices();

// Define all listeners
manager.on("connect", function(data, reply){
    reply(data, reply.req);
});
manager.on("getServerDetails", function(data, reply){
    var service = data.screen;
    
     if(service.indexOf(".dev") > -1){
        service = service.replace(".dev", "");
        service = "dev_" + service;
    }

    data.online = (Object.keys(services).indexOf(service) > -1) ? services[service] : false;
    reply(data, reply.req);
});
manager.on("getServerLog", function(data, reply){
    var service = data.screen;

    var linesToReturn = 50;

    var exec = require('child_process').exec;
    var cmd  = 'tail -n ' + linesToReturn + ' /var/log/gi-' + service + "/current";

    exec(cmd, function(err, stdout, stderr) {
        var lines = stdout.split("\n");
        for(var index in lines){
            if(!lines.hasOwnProperty(index)) continue;
            var line = lines[index];

            lines[index] = line.substring(26, line.length);
        }

        var linesR = lines.join("\n");
        linesR = linesR.replace(/\:/g, "µ");
        data.lines = linesR;

        reply(data, reply.req);
    });

    // var file  = fs.readFileSync("/home/gameindus/system/servers/logs/" + screen + ".log");
    // var lines = file.toString().split("\n");

    // var linesR = "";
    // for(var i = 0; i < linesToReturn; i++){
    //     var line = lines[lines.length - linesToReturn + i];
    //     if(line == null) continue;

    //     linesR += line + "\n";
    // }

    // linesR = linesR.replace(/\:/g, "µ");

    // data.lines = linesR;
    // reply(data, reply.req);
});
manager.on("startServer", function(data, reply){
    var service = data.screen;

    if(service.indexOf(".dev") > -1){
        service = service.replace(".dev", "");
        service = "dev_" + service;
    }
    service = "gi-" + service;

    var exec        = require('child_process').exec;
    var cmd         = 'sv start ' + service;
    var cmdResetLog = 'echo -n > /var/log/' + service + '/current';

    exec(cmdResetLog, function(err, stdout, stderr) {
        exec(cmd, function(err, stdout, stderr) {
            reply(data, reply.req);
        });
    });
});
manager.on("stopServer", function(data, reply){
    var service = data.screen;

    if(service.indexOf(".dev") > -1){
        service = service.replace(".dev", "");
        service = "dev_" + service;
    }
    service = "gi-" + service;

    var exec = require('child_process').exec;
    var cmd = 'sv stop ' + service;

    exec(cmd, function(err, stdout, stderr) {
        reply(data, reply.req);
    });
});
manager.on("restartServer", function(data, reply){
    var service = data.screen;

    if(service.indexOf(".dev") > -1){
        service = service.replace(".dev", "");
        service = "dev_" + service;
    }
    service = "gi-" + service;

    var exec        = require('child_process').exec;
    var cmdStop     = 'sv stop ' + service;
    var cmdStart    = 'sv start ' + service;
    var cmdResetLog = 'echo -n > /var/log/' + service + '/current';

    exec(cmdStop, function(err, stdout, stderr) {
        setTimeout(function(){
            exec(cmdResetLog, function(err, stdout, stderr) {
                exec(cmdStart, function(err, stdout, stderr) {
                    reply(data, reply.req);
                });
            });
        }, 1000);
    });
});

var LZString=function(){function o(o,r){if(!t[o]){t[o]={};for(var n=0;n<o.length;n++)t[o][o.charAt(n)]=n}return t[o][r]}var r=String.fromCharCode,n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",t={},i={compressToBase64:function(o){if(null==o)return"";var r=i._compress(o,6,function(o){return n.charAt(o)});switch(r.length%4){default:case 0:return r;case 1:return r+"===";case 2:return r+"==";case 3:return r+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(e){return o(n,r.charAt(e))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(o){return null==o?"":""==o?null:i._decompress(o.length,16384,function(r){return o.charCodeAt(r)-32})},compressToUint8Array:function(o){for(var r=i.compress(o),n=new Uint8Array(2*r.length),e=0,t=r.length;t>e;e++){var s=r.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null===o||void 0===o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;t>e;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(o){return null==o?"":i._compress(o,6,function(o){return e.charAt(o)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(n){return o(e,r.charAt(n))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(o,r,n){if(null==o)return"";var e,t,i,s={},p={},u="",c="",a="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<o.length;i+=1)if(u=o.charAt(i),Object.prototype.hasOwnProperty.call(s,u)||(s[u]=f++,p[u]=!0),c=a+u,Object.prototype.hasOwnProperty.call(s,c))a=c;else{if(Object.prototype.hasOwnProperty.call(p,a)){if(a.charCodeAt(0)<256){for(e=0;h>e;e++)m<<=1,v==r-1?(v=0,d.push(n(m)),m=0):v++;for(t=a.charCodeAt(0),e=0;8>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;h>e;e++)m=m<<1|t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=a.charCodeAt(0),e=0;16>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}l--,0==l&&(l=Math.pow(2,h),h++),delete p[a]}else for(t=s[a],e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;l--,0==l&&(l=Math.pow(2,h),h++),s[c]=f++,a=String(u)}if(""!==a){if(Object.prototype.hasOwnProperty.call(p,a)){if(a.charCodeAt(0)<256){for(e=0;h>e;e++)m<<=1,v==r-1?(v=0,d.push(n(m)),m=0):v++;for(t=a.charCodeAt(0),e=0;8>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;h>e;e++)m=m<<1|t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=a.charCodeAt(0),e=0;16>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}l--,0==l&&(l=Math.pow(2,h),h++),delete p[a]}else for(t=s[a],e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;l--,0==l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;h>e;e++)m=m<<1|1&t,v==r-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==r-1){d.push(n(m));break}v++}return d.join("")},decompress:function(o){return null==o?"":""==o?null:i._decompress(o.length,32768,function(r){return o.charCodeAt(r)})},_decompress:function(o,n,e){var t,i,s,p,u,c,a,l,f=[],h=4,d=4,m=3,v="",w=[],A={val:e(0),position:n,index:1};for(i=0;3>i;i+=1)f[i]=i;for(p=0,c=Math.pow(2,2),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;switch(t=p){case 0:for(p=0,c=Math.pow(2,8),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;l=r(p);break;case 1:for(p=0,c=Math.pow(2,16),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;l=r(p);break;case 2:return""}for(f[3]=l,s=l,w.push(l);;){if(A.index>o)return"";for(p=0,c=Math.pow(2,m),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;switch(l=p){case 0:for(p=0,c=Math.pow(2,8),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;f[d++]=r(p),l=d-1,h--;break;case 1:for(p=0,c=Math.pow(2,16),a=1;a!=c;)u=A.val&A.position,A.position>>=1,0==A.position&&(A.position=n,A.val=e(A.index++)),p|=(u>0?1:0)*a,a<<=1;f[d++]=r(p),l=d-1,h--;break;case 2:return w.join("")}if(0==h&&(h=Math.pow(2,m),m++),f[l])v=f[l];else{if(l!==d)return null;v=s+s.charAt(0)}w.push(v),f[d++]=s+v.charAt(0),h--,s=v,0==h&&(h=Math.pow(2,m),m++)}}};return i}();"function"==typeof define&&define.amd?define(function(){return LZString}):"undefined"!=typeof module&&null!=module&&(module.exports=LZString);