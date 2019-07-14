module.exports = function(roomId){
	if(roomId == null) return new RoomsManager();
	return new Room(roomId);
};

function Room(id){
	this.id = id;

	this.messages = [];
	this.users    = {};
}

Room.prototype = {

	addMessage: function(user, message, rid){
		if(message == "null" || message == null) return false;
		if(!this.userIsConnected()) this.addUser(user, rid);

		var md = {
			username: user,
			message: message,
			timestamp: Date.now()
		}

		this.messages.push(md);
		return md;
	},
	addUser: function(username, requestId){
		this.users[username] = {connectionId: requestId, connectTime: Date.now()};
	},

	getId: function(){
		return this.id;
	},
	getMessages: function(){
		return this.messages;
	},
	getRawMessages: function(){
		return JSON.stringify(this.getMessages());
	},
	getRawUsers: function(){
		return JSON.stringify(this.getUsers());
	},
	getUserById: function(rid){
		for(var i = 0; i < Object.keys(this.users).length; i++){
			var ku = Object.keys(this.users)[i];
			var vu = this.users[ku];

			if(vu.connectionId == rid) return ku;
		}

		return null;
	},
	getUsers: function(){
		return this.users;
	},

	removeUser: function(rid){
		for(var i = 0; i < Object.keys(this.users).length; i++){
			var ku = Object.keys(this.users)[i];
			var vu = this.users[ku];

			if(vu.connectionId == rid) delete this.users[ku];
		}
	},

	userIsConnected: function(username){
		return (Object.keys(this.getUsers()).indexOf(username) > -1);
	}

};



function RoomsManager(){
	this.rooms = [];
}

RoomsManager.prototype = {

	containsRoom: function(id){
		return (this.getRoom(id) != null);
	},

	getRoom: function(id){
		var room  = null;
		var rooms = this.getRooms();

		for(var i = 0; i < rooms.length; i++){
			if(rooms[i].getId() == id){
				room = rooms[i];
				break;
			}
		}

		return room;
	},
	getRoomByConnectionId: function(connectionId){
		for(var i = 0; i < this.getRooms().length; i++){
			var r = this.getRooms()[i];
			var u = r.users;

			for(var j = 0; j < Object.keys(u).length; j++){
				var k = Object.keys(u)[j];
				var v = u[k];

				if(v.connectionId == connectionId) return r;
			}
		}

		return null;
	},
	getRooms: function(){
		return this.rooms;
	},

	newRoom: function(id){
		if(this.containsRoom(id)) return false;
		var r = new Room(id);
		this.rooms.push(r);

		return r;
	}

};