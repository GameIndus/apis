var https = require('https');
var fs    = require('fs');
var url   = require('url');
var ugj   = require('uglify-js');

var auth  = require("./auth/AuthClient.js");
var utils = require("./utils.js");

var port    = 30000;
var baseDir = "../engines/";
 
var server = https.createServer(auth.getSSLCredentials(), function(req, res){

   	if(req.method == "GET"){
   		var params = url.parse(req.url,true).query;
   		var method = Object.keys(params)[0];

   		if(method == null){
   			res.writeHead(404, {"Content-Type": "text/html"});
	        res.end("<h1>404 Error, file not found.</h1><hr><p>This page is the property of GameIndus&copy. Please leave this page and go to the homepage, <a href='http://gameindus.fr/'>here</a>.</p>");

	        return false;
   		}

   		if(typeof er["f" + method] === 'function')
   			er["f" + method](req, res);
   		else{
   			res.writeHead(404, {"Content-Type": "text/html"});
	        res.end("<h1>404 Error, file not found.</h1><hr><p>This page is the property of GameIndus&copy. Please leave this page and go to the homepage, <a href='http://gameindus.fr/'>here</a>.</p>");
   		}

   		return false;
   	}
    
});

var last2dEngine = "";


function enginesRenderer(){}
enginesRenderer.prototype = {

	f2d: function(req, res){
		res.writeHead(200, {"Content-Type": "text/javascript"});

		if(last2dEngine != ""){
			res.end(last2dEngine);
			return false;
		}else{
			res.end("");
			return false;
		}
		
	},

	f3d: function(req, res){

	},


	regenerate: function(){
		var that = this;

		this.r2d(function(){
			utils.log("Code des moteurs re-généré.");
		});
		// this.r3d();
		
		setTimeout(function(){
			that.regenerate();
		}, 1000 * 60 * 10);
	},
	r2d: function(callback){
		utils.loadFile(baseDir + "2d.map", function(files){
			var result;

			result = ugj.minify(files, {
				warnings: false,
				mangle: true,
				compress: {},
				output: {
					beautify: false
				}
			});
			
			last2dEngine = result.code;
			callback();
			return false;
		});
	}

};
var er = new enginesRenderer();


server.listen(port);

utils.log(" ");
utils.log("Server started on port :"+port+".");

er.regenerate();