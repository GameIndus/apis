var fs       = require("fs");
var zip      = new require('node-zip')();
var LZString = require("lz-string");

var dir = "projects/rpggamer/";


function lowCompression(dir, callback){
	// // // // // // // // // ///
	//						    //
	//  STOCK SCRIPTS & ASSETS  //
	// 						    //
	// // // // // // // // // ///

	var scripts  = fs.readdirSync(dir + "scripts/");
	var assets   = fs.readdirSync(dir + "assets/");

	var htmlFile = fs.readFileSync(dir + "index.php", "utf-8");
	var html     = htmlFile.substr(0, htmlFile.indexOf("<?php")) + htmlFile.substr(htmlFile.indexOf("?>") + 2);

	// // // // // // //
	//				  //
	//  GENERATE ZIP  //
	// 				  //
	// // // // // // //

	for(var i = 0; i < scripts.length; i++){
		var data = fs.readFileSync(dir + "scripts/" + scripts[i], "utf-8");

		if(scripts[i] == "app.js"){
			data = data.replace(/Config.assetsDir="(.*?)"/g, 'Config.assetsDir="assets/"');
		}

		zip.file("scripts/" + scripts[i], data);
	}
	for(var i = 0; i < assets.length; i++){
		zip.file("assets/" + assets[i], fs.readFileSync(dir + "assets/" + assets[i]));
	}

	html = html.replace(/<\/html>/, '</html>\n\n<!-- Ce jeu a été créé grâce à GameIndus. -->');

	zip.file("index.html", html);

	var data = zip.generate({ base64 : false, compression : 'DEFLATE' });
	fs.writeFileSync(dir + "zipped.zip", data, 'binary');

	if(typeof callback != "undefined") callback(dir + "zipped.zip");
}
function mediumCompression(dir, callback){
	// // // // // // // // // ///
	//						    //
	//  STOCK SCRIPTS & ASSETS  //
	// 						    //
	// // // // // // // // // ///

	var scripts  = fs.readdirSync(dir + "scripts/");
	var assets   = fs.readdirSync(dir + "assets/");

	var htmlFile = fs.readFileSync(dir + "index.php", "utf-8");
	var html     = htmlFile.substr(0, htmlFile.indexOf("<?php")) + htmlFile.substr(htmlFile.indexOf("?>") + 2);

	// // // // // // //
	//				  //
	//  GENERATE ZIP  //
	// 				  //
	// // // // // // //

	var jsData = "";

	for(var i = 0; i < scripts.length; i++){
		var data = fs.readFileSync(dir + "scripts/" + scripts[i], "utf-8");

		if(scripts[i] == "app.js"){
			data = data.replace(/Config.assetsDir="(.*?)"/g, 'Config.assetsDir="assets/"');
		}

		jsData += data;
	}
	for(var i = 0; i < assets.length; i++){
		zip.file("assets/" + assets[i], fs.readFileSync(dir + "assets/" + assets[i]));
	}

	jsData = jsData.replace(/var Game=new Game\(\);/g, "var Game=new window.Game();window.Game=Game;");
	html = html.replace(/<\/body>/, '<script type="text/javascript">document.addEventListener("DOMContentLoaded",function(){' + jsData + '});</script></body>');
	html = html.replace(/<\/html>/, '</html>\n\n<!-- Ce jeu a été créé grâce à GameIndus. -->');
	html = html.replace(/<script src="scripts\/(.*?)" type="text\/javascript" charset="utf\-8" defer><\/script>/g, "");

	zip.file("index.html", html);

	var data = zip.generate({ base64 : false, compression : 'DEFLATE' });
	fs.writeFileSync(dir + "zipped.zip", data, 'binary');

	if(typeof callback != "undefined") callback(dir + "zipped.zip");
}
function highCompression(dir, callback){
	// // // // // // // // // ///
	//						    //
	//  STOCK SCRIPTS & ASSETS  //
	// 						    //
	// // // // // // // // // ///

	var scripts  = fs.readdirSync(dir + "scripts/");
	var assets   = fs.readdirSync(dir + "assets/");

	var htmlFile = fs.readFileSync(dir + "index.php", "utf-8");
	var html     = htmlFile.substr(0, htmlFile.indexOf("<?php")) + htmlFile.substr(htmlFile.indexOf("?>") + 2);

	// // // // // // //
	//				  //
	//  GENERATE ZIP  //
	// 				  //
	// // // // // // //

	var jsData 	   = "";
	var assetsData = {};

	for(var i = 0; i < scripts.length; i++){
		var data = fs.readFileSync(dir + "scripts/" + scripts[i], "utf-8");

		if(scripts[i] == "app.js"){
			data = data.replace(/Config.assetsDir="(.*?)"/g, 'Config.assetsDir="assets/"');
		}

		jsData += data;
	}
	for(var i = 0; i < assets.length; i++){
		if(assets[i].indexOf("json") == -1){
			var buff = new Buffer(fs.readFileSync(dir + "assets/" + assets[i], "binary"), 'binary').toString('base64');
			assetsData[assets[i]] = "data:image/" + assets[i].split(".")[1] + ";base64," + buff;
		}else{
			assetsData[assets[i]] = fs.readFileSync(dir + "assets/" + assets[i], "utf-8");
		}
	}

	var grsText = "";

	for(var i = 0; i < Object.keys(assetsData).length; i++){
		var k = Object.keys(assetsData)[i];
		var v = assetsData[k];

		grsText += k + ":::" + v + "$$$$$$";
	}

	jsData = jsData.replace(/var Game=new Game\(\);/g, "var Game=new window.Game();window.Game=Game;");
	html = html.replace(/<\/body>/, '<script type="text/javascript">document.addEventListener("DOMContentLoaded",function(){' + jsData + '});</script></body>');
	html = html.replace(/<\/html>/, '</html>\n\n<!-- Ce jeu a été créé grâce à GameIndus. -->');
	html = html.replace(/<script src="scripts\/(.*?)" type="text\/javascript" charset="utf\-8" defer><\/script>/g, "");

	zip.file("assets.grs", LZString.compress(grsText));
	zip.file("index.html", html);

	var data = zip.generate({ base64 : false, compression : 'DEFLATE' });
	fs.writeFileSync(dir + "zipped.zip", data, 'binary');

	if(typeof callback != "undefined") callback(dir + "zipped.zip");
}



highCompression(dir, function(zip){
	console.log("Zip created at: " + zip);
});