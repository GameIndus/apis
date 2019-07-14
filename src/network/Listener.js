module.exports = function(method, func){
	return new Listener(method, func);
}

function Listener(method, func){
	this.method = method;
	this.func   = func;

	this.callback = null;
}

Listener.prototype = {

	getMethod: function(){
		return this.method;
	},
	getFunction: function(){
		return this.func;
	},

	run: function(request){
		var call = this.callback || function(){};

		if(this.func != null){
			call.req = request;
			this.func(request.getDatas(), call);
		}
	},
	onActionFinished: function(callback){
		this.callback = callback;
	}

};