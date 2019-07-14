module.exports = {
	requests  : [],
	listeners : [],


	on: function(method, func){
		var listener = new require("./Listener.js")(method, func);
		this.listeners.push(listener);

		listener.onActionFinished(function(data, request, broadcast){
			if(!broadcast) request.reply(data);
			else request.replyToSameProject(data, true);
		});
	},

	newRequest: function(request, conn){
		this.requests.push(request);

		this.checkForListener(request);
	},
	checkForListener: function(request){
		for(var i = 0; i < this.listeners.length; i++){
			var listener = this.listeners[i];

			if(listener.getMethod() == request.getMethod())
				listener.run(request);
		}
	},
	endRequest: function(request){
		this.requests.splice(this.requests.indexOf(request), 1);
	}
};