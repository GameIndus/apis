var port = 20004;

var ws    = require("nodejs-websocket");
var utils = require("./utils.js");

var manager  = require("./network/ListenersManager.js");
var auth     = require("./auth/AuthClient.js");

var fs    = require("fs");
var util  = require("util");

var rooms   = require("./realtime/Room.js")();
var Storage = require("./realtime/Storage.js")();
var users   = {};

var LZstring = require("./realtime/lzstring.js");

// Websocket server
var server = ws.createServer({secure: true, key: auth.getSSLCredentials().key, cert: auth.getSSLCredentials().cert}, function (conn) {
    var origin = (conn.headers.origin != null) ? conn.headers.origin : null;

    if(!origin || origin.indexOf("gameindus.fr") == -1){
        conn.close(401, "Access denied!");
        return false;
    }

    conn.on("text", function (str) {
        if(str == "getUsers"){
            conn.send(Object.keys(users).length + "");
            return false;
        }else if(str == "ping"){
            conn.send("pong");
            return false;
        }

        if(this.request != null){
            manager.endRequest(this.request);
            this.request = null;
        }

        var req = new require("./network/Request.js")(server, conn).fromString(str);

        auth.verify(null, req.getCredentials(), function(){
            manager.newRequest(req, conn);
        });
    });

    conn.on("close", function (code, reason) {
        // Remove user from users array
        for(var i = 0; i < Object.keys(users).length; i++){
            var username  = Object.keys(users)[i];
            var requestId = users[username].connection.key;

            if(requestId == conn.key) delete users[username];
        }

        // Close user connection tchat
        var r = rooms.getRoomByConnectionId(conn.key);
        if(r != null) r.removeUser(conn.key);

    });
}).listen(port);

// Catch errors
server.on('error', function(error){ 
    utils.log(error, "ERROR");
});
process.on('uncaughtException', function(error) {
    utils.log(error, "ERROR");
})


utils.log(" ");
utils.log("Realtime server started on port: " + port + ".");

// Define all listeners
manager.on("connect", function(data, reply){
    var username = data.username;

    if(users[username] != null){
        var userConnected = users[username];
        userConnected.reply({error: true}, false, "user_connect_error");
    }

    data = {connected: true};
    users[username] = reply.req;
    reply(data, reply.req);
});
manager.on("updatefiles", function(data, reply){
    reply(data, reply.req, true);
});
manager.on("spriteeditor", function(data, reply){
    reply(data, reply.req, true);
    setTimeout(function(){ Storage.newFileModification(parseInt(reply.req.getCredentials().projectId), data); }, 0);
});
manager.on("tilemapeditor", function(data, reply){
    reply(data, reply.req, true);
    setTimeout(function(){ Storage.newFileModification(parseInt(reply.req.getCredentials().projectId), data); }, 0);
});
manager.on("sceneeditor", function(data, reply){
    reply(data, reply.req, true);
    setTimeout(function(){ Storage.newFileModification(parseInt(reply.req.getCredentials().projectId), data); }, 0);
});
manager.on("vseditor", function(data, reply){
    reply(data, reply.req, true);
    setTimeout(function(){ Storage.newFileModification(parseInt(reply.req.getCredentials().projectId), data); }, 0);
});
manager.on("scripteditor", function(data, reply){
    reply(data, reply.req, true);
    setTimeout(function(){ Storage.newFileModification(parseInt(reply.req.getCredentials().projectId), data); }, 0);
});
manager.on("configeditor", function(data, reply){
    reply(data, reply.req, true);
});

// -- Tchat --
manager.on("getLastestMessages", function(data, reply){
    var pid  = parseInt(reply.req.getCredentials().projectId);
    var rid  = reply.req.connection.key;
    var room = null;

    if(!rooms.containsRoom(pid)) room = rooms.newRoom(pid);
    else room = rooms.getRoom(pid);

    // Connect user
    if(!room.userIsConnected(data.username)) room.addUser(data.username, rid);

    data = {
        messages: LZstring.compressToEncodedURIComponent(room.getRawMessages()), 
        roomId: room.getId()
    }

    reply(data, reply.req);
});
manager.on("getConnectedUsers", function(data, reply){
    var pid  = parseInt(reply.req.getCredentials().projectId);
    var rid  = reply.req.connection.key;
    var room = null;

    if(!rooms.containsRoom(pid)) room = rooms.newRoom(pid);
    else room = rooms.getRoom(pid);

    // Connect user
    if(!room.userIsConnected(data.username)) room.addUser(data.username, rid);

    data = {
        roomId: room.getId(),
        users: LZstring.compressToEncodedURIComponent(room.getRawUsers()),
    }

    reply(data, reply.req);
});
manager.on("sendTchatMessage", function(data, reply){
    var pid  = parseInt(reply.req.getCredentials().projectId);
    var rid  = reply.req.connection.key;
    var room = rooms.getRoom(pid);

    if(room == null){
        reply({error: "usernotinroom"}, reply.req);
        return false;
    }

    var user = room.getUserById(rid);

    // Connect user
    if(user == null){
        reply({error: "usernotinroom"}, reply.req);
        return false;
    }

    data.message = LZstring.decompress(data.message);
    var ma = room.addMessage(user, data.message, rid);

    reply({message: LZstring.compress(ma.message), username: user, timestamp: ma.timestamp}, reply.req, true);
    reply({sender: true, message: LZstring.compress(ma.message), timestamp: ma.timestamp}, reply.req);
});

// -- Loading-saving system --
manager.on("loadFileData", function(data, reply){
    var pid     = parseInt(reply.req.getCredentials().projectId);
    var storage = Storage.getProjectStorage(pid);

    var type     = data.type;
    var filename = data.filename;

    if(storage.fileDataExists(type, filename)){
        reply({data: LZstring.compressToBase64(storage.getFileData(type, filename).getData())}, reply.req);
        return true;
    }else{
        storage.getFileDataFromDisk(type, filename, function(fileData){
            reply({data: LZstring.compressToBase64(fileData.getData())}, reply.req);
        });

        return true;
    }
});
manager.on("renameFileData", function(data, reply){
    var pid     = parseInt(reply.req.getCredentials().projectId);
    var storage = Storage.getProjectStorage(pid);

    var type     = data.type;
    var filename = data.filename;

    storage.removeFileFromCache(pid, type, filename, LZstring.decompressFromBase64(data.newname));
});
manager.on("removeFileData", function(data, reply){
    var pid     = parseInt(reply.req.getCredentials().projectId);
    var storage = Storage.getProjectStorage(pid);

    var type     = data.type;
    var filename = data.filename;

    storage.removeFileFromCache(pid, type, filename);
});