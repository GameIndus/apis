var http = require('http');
var sq   = require('querystring');
var port = 20002;

var usernames = {};
var messages  = {};
var projectsIds  = {};

var server = http.createServer(function(req, res){
	if(res.socket.remoteAddress != '::ffff:127.0.0.1'){
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end("<h1>404 Error, file not found.</h1><hr><p>This page is the property of GameIndus&copy. Please leave this page and go to the homepage, <a href='http://gameindus.fr/'>here</a>.</p>");

        return false;
    }

    if(req.method == 'POST'){
        var body = '';
        req.on('data', function (data) {
            body += data;

            if (body.length > 1e6)
                req.connection.destroy();
        });
        req.on('end', function(){
            var post = sq.parse(body);

            projectsIds[post.ID] = post.PID;

            res.end("");
        });
    }
});
var io     = require('socket.io').listen(server);


io.sockets.on('connection', function (socket){

	socket.on('user_connect', function(data){
		if(!checkProject(socket, data)) return false;

		var username = data.username;
		var PID      = data.projectId;

		if(username==null||username.isEmpty()) return false;
		if(typeof usernames[socket.id] != 'undefined') return false;
		
		usernames[socket.id] = username;
		log('[USER] '+username+' join the tchat in room #'+PID+' !');

		// Join the socket.io room (with PID)
		socket.join(PID);
	});

	socket.on('user_post_message', function(data){
		if(!checkProject(socket, data)) return false;
		
		if(data.username.isEmpty()) return false;
		if(data.message.isEmpty()) return false;

		// Strip message tags
		data.message = data.message.replace(/(<([^>]+)>)/ig,"");

		var PID = data.projectId; // Project ID

		data.timestamp = Math.floor(Date.now() / 1000);

		if(Object.keys(messages).indexOf(PID) == -1) messages[PID] = [];

		messages[PID].push(data);

		// Send only the message on connected project with the same projectId
		socket.broadcast.to(PID).emit('user_post_message', data);
		socket.emit('user_post_message', data);
	});

	socket.on('get_users_connected', function(data){
		if(!checkProject(socket, data)) return false;

		var usernamesR = [];

		for(var i=0;i<Object.keys(usernames).length;i++){
			var username = usernames[Object.keys(usernames)[i]];
			usernamesR.push(username);
		}

		socket.emit('get_users_connected', usernamesR);
	});

	socket.on('get_lastest_messages', function(data){
		if(!checkProject(socket, data)) return false;
		var PID = data.project;

		if(Object.keys(messages).indexOf(PID) > -1)
			socket.emit('get_lastest_messages', messages[PID]);
		else
			socket.emit('get_lastest_messages', {});
	});

	socket.on('disconnect', function(){
		if(typeof usernames[socket.id] != 'undefined'){
			log('[USER] '+usernames[socket.id]+' left the tchat !');
			delete usernames[socket.id];
		}
	});
});

server.listen(port);

log(" ");
log("[INFO] Server started on port :"+port+".");


String.prototype.isEmpty = function() {
    return (this.length === 0 || !this.trim());
};

function log(message){

    if(message == " "){console.log(message);return false;}

    var date = new Date();
    var prefix = "[" + date.getHours() + ":" + date.getMinutes() + ":" + ("0" + date.getSeconds()).slice(-2) + "]"; 

    console.log(prefix + " " + message);
}

function checkProject(socket, req){
    var ID        = req.ID;
    var projectID = req.project;

    if(Object.keys(projectsIds).indexOf(ID) > -1){
        if(projectsIds[ID] == projectID){
            return true;
        }else{
            socket.emit('errorMessage', "Tu as essayé de hacher le système ! Petit malin. Dommage :D !");
            return false;
        }
    }else{
        socket.emit('errorMessage', "Tu as essayé de hacher le système ! Petit malin. Dommage :D !");
        return false;
    }
}