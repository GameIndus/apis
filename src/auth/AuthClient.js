var fs = require("fs");
var config = require('../../config');

module.exports = {

	port : 41000,

	token     : null,
	projectId : null,

	secure  : config.ssl.enable,
	sslKey  : config.ssl.key ? fs.readFileSync(config.ssl.key) : null,
	sslCert : config.ssl.certificate ? fs.readFileSync(config.ssl.certificate) : null,

	auths : {},

	getSSLCredentials: function(){
		return {key: this.sslKey, cert: this.sslCert};
	},
	setCredentials: function(credentials){
		this.token = credentials.token;
		this.projectId = credentials.projectId;
	},

	checkAuth: function(callback){
		if(this.token == null || this.projectId == null) return false;
		var that = this;

		if(this.auths[this.token + "-" + this.projectId] != null) {
			callback(this.auths[this.token + "-" + this.projectId]);
			return false;
		}

		// Check from the Auth server
		var ws         = require("nodejs-websocket");
		var connection = ws.connect("wss://gameindus.fr:" + this.port + "/", {
			secure: this.secure,
			key: this.sslKey,
			cert: this.sslCert
		});

		connection.on("connect", function(){
			connection.sendText(that.token + ":" + that.projectId);

			connection.on("text", function (str){
				that.auths[that.token + "-" + that.projectId] = (str == "authentificated");

				if(str == "authentificated") callback(true);
				else callback(false);
			});
		});
	},
	verify: function(socket, credentials, callback){
		this.setCredentials(credentials);
		this.checkAuth(function(good){
			if(good) callback();
			else{
				if(socket != null) socket.emit("sys-error", "bad_authentification");
			}
		});
	}


};