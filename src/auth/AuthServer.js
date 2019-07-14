module.exports = {

	httpServer : null,
	httpPort   : 40000,
	wsServer : null,
	wsPort   : 41000,

	key        : "2hB2kZM67TkeoyWb5QH63G47jD5c5jII", // From the PHP Config
	passphrase : "859FC7A51942F58R", // From the PHP Config

	tokens : {},
	logs   : new Array(),


	authentificate: function(token, projectId){
		this.tokens[token] = projectId;
		return true;
	},
	checkAuthentification: function(token, projectId){
		// token -> crypted with aes 256 cbc from the php
		
		var key        = this.key;
		var passphrase = this.passphrase;
		var decipher = require("crypto").createDecipheriv('aes-256-cbc', key, passphrase);
 
		decipher.setAutoPadding(false);
		var cipherHexText256 = token;
		 
		var dec = decipher.update(token, 'hex', 'utf8');
		dec += decipher.final('utf8');
		var decryptedPassword = dec.substring(0, dec.length - 3);

		for(var i = 0; i < Object.keys(this.tokens).length; i++){
			var tokenC     = Object.keys(this.tokens)[i];
			var projectIdC = this.tokens[tokenC];

			if(tokenC == decryptedPassword && projectIdC == projectId) return true;
		}

		return false;
	},

	runServer: function(){
		var that = this;

		var auth = require("./AuthClient.js");

		this.wsServer = require("nodejs-websocket").createServer({secure: true, key: auth.getSSLCredentials().key, cert: auth.getSSLCredentials().cert}, function (conn) {
		    conn.on("text", function (str) {
				var parts      = str.split(":");
				if(parts.length != 2) return false;

				var token     = parts[0];
				var projectId = parts[1];

				var authentificated = that.checkAuthentification(token, projectId);
				
				if(authentificated){
					that.log("User with token '" + token +"' from #" + projectId + " authentificated.");
				}

				if(authentificated)
					conn.sendText("authentificated");
				else
					conn.sendText("error");

				conn.close(200, "good");
		    });
		}).listen(this.wsPort);

		this.httpServer = require("https").createServer(auth.getSSLCredentials(), function(req, res){
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
		            var post = require('querystring').parse(body);
		            if(that.authentificate(post.token, post.projectId))
		            	res.end("ok");
		            else
		            	res.end("authentification_failed");
		        });
		    }
		}).listen(this.httpPort);
	},

	log: function(message, type){
		if(message == " "){console.log(message);return false;}
	    if(type == undefined) type = "info";

	    if(this.logs.indexOf(type + "-" + message)) return false;
	    else this.logs.push(type + "-" + message);

	    var date = new Date();
	    var prefix = "[" + this.leftPad(date.getHours(), 2) + ":" + this.leftPad(date.getMinutes(), 2) + ":" + ("0" + date.getSeconds()).slice(-2) + " " + type.toUpperCase() + "]"; 

	    console.log(prefix + " " + message);
	},
	leftPad: function(a,b){for(var c=a+"";c.length<b;)c="0"+c;return c}

};