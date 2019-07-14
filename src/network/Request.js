module.exports = function(server, connection){
	return new Request(server, connection);
}

function Request(server, connection){
	this.server      = server;
	this.connection  = connection;

	this.method = "";
	this.datas  = {};

	this.credentials = {token: -1, projectId: -1};
	this.req = -1;

	this.replied = false;

	// Temp
	this.pattern = "{method}///{reqId}///{token:projectId}///{key:value}///{key2:value2}/// [...]";
}

Request.prototype = {

	fromString: function(str){
		var parts = str.split("///");
		if(parts.length < 4) return null;

		this.method = parts[0];
		parts.splice(0, 1);

		// Save request ID
		this.req = parts[0];
		parts.splice(0, 1);

		// Save credentials
		this.credentials.token     = parts[0].split(":")[0];
		this.credentials.projectId = parts[0].split(":")[1];
		parts.splice(0, 1);

		// Setup connection
		this.connection.projectId = this.credentials.projectId;
		this.connection.id        = this.req;
		this.connection.request   = this;

		for(var i = 0; i < parts.length; i++){
			var part = parts[i];
			var subParts = part.split(":");

			var value = subParts[1];
			if(value == 'true') value = true;
			else if(value == 'false') value = false;

			this.datas[subParts[0]] = value;
		}

		return this;
	},

	getCredentials: function(){
		return this.credentials;
	},
	getDatas: function(){
		return this.datas;
	},
	getMethod: function(){
		return this.method;
	},

	reply: function(data, allMode, method){
		// if(this.replied) return false;
		if(method === undefined) method = this.getMethod();

		var str = method + "///" + this.req + "///";

		if(data == null) data = {nothing: true};

		for(var i = 0; i < Object.keys(data).length; i++){
			var key = Object.keys(data)[i];
			var val = data[key];

			str += key + ":" + val + "///";
		}

		if(str.substring(str.length - 3, str.length) == "///") str = str.substring(0, str.length - 3);

		this.connection.sendText(str);
		if(!allMode) this.replied = true;
	},
	replyToAll: function(data, broadcast){
		if(this.replied) return false;

		var that = this;

		this.server.connections.forEach(function (connection) {
			if(broadcast !== undefined && that.connection.id == connection.id) return false;
			that.reply(connection, data);
		});

		this.replied = true;
	},
	replyToSameProject: function(data, broadcast){
		var that = this;

		this.server.connections.forEach(function (connection) {
			if(broadcast){
				var d = JSON.parse(JSON.stringify(data));

				if(connection.projectId != that.credentials.projectId) return false;
				if(that.connection.id == connection.id){
					d = {"sended" : true};	
				} 

				connection.request.reply(d, true, that.getMethod());
			}else{
				connection.request.reply(data, true, that.getMethod());
			}
		});

		this.replied = true;
	}

};
