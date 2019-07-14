var https  = require('https');
var fs     = require('fs');
var sq     = require('querystring');
var util   = require('util');
var zip    = new require("node-zip")();
var LZ     = require("./realtime/lzstring.js");
var crypto = require("crypto");

var utils = require("./utils.js");
var auth  = require("./auth/AuthClient.js");

var port   = 30003;
var baseDir = "../projects/";


var compilations = {};

var log_file = fs.createWriteStream(__dirname + '/logs/compiler.dev.log', {flags : 'w'});
var log_stdout = process.stdout;
console.log=function(a){log_file.write(util.format(a)+"\n"),log_stdout.write(util.format(a)+"\n")};

var server = https.createServer(auth.getSSLCredentials(), function(req, res){
	if(res.socket.remoteAddress != '::ffff:127.0.0.1'){
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end("<h1>404 Error, file not found.</h1><hr><p>This page is the property of GameIndus&copy. Please leave this page and go to the homepage, <a href='http://gameindus.fr/'>here</a>.</p>");

        return false;
    }
});
var io = require('socket.io').listen(server);
server.listen(port);

io.sockets.on('connection', function (socket){

	var config         = null;
	var spritesVars    = {};
	var compiledScenes = {};

	socket.on('sendProject', function(data){
		if(typeof compilations[socket.id] !== 'undefined') return false;

		auth.verify(socket, data.credentials, function(){
			utils.log("Project '"+data.name+"' compilation started. Waiting...", "COMPILE");
			compilations[socket.id] = data;

			// Format project ID
			compilations[socket.id].id = formatName(compilations[socket.id].id);

			socket.emit('sendProject', {exportation: (data.exportation)});
		});
	});

	socket.on('compileTilemaps', function(d){
		if(typeof compilations[socket.id] === 'undefined') return false;

		var project    = compilations[socket.id];
		var pathAssets = baseDir+project.id+"/assets/";
		var path       = baseDir+project.id+"/";

		var task = function(project, file, socket, tilemap, callback){
			var formatTiles = function(arr){
				var r = {};

				arr.forEach(function(string){
					var params = string.split("$");
					var key    = params[2] + "-" + params[3] + "/" + params[7];
					var value  = [parseInt(params[4]), parseInt(params[5])];

					if(params[6] === "true") key += "/s";
					r[key] = value;
				});

				return r;
			};

			if(tilemap == null || tilemap.ressource == null){
				callback();
				return false;
			}

			var finalTilemap = {
				tile : {
					src : tilemap.ressource.name,
					size: [tilemap.ressource.cellSize.w, tilemap.ressource.cellSize.h],
					tiles: formatTiles(tilemap.tiles)
				}
			};

			fs.writeFile(pathAssets + file.replace("tlm_", ""), JSON.stringify(finalTilemap), 'utf-8', function(err){
				if (err) utils.log(err);
				callback();
			});
		};

		var task2 = function(files, file, index){
			if(file==null){
				utils.log("CompileTilemaps task for '"+project.name+"' project finished.", "COMPILE");
				socket.emit('compileTilemaps');
				return false;
			}

			fs.readFile(path+"tmp/"+file, "utf-8", function(err, res){
				if (err) utils.log(err);
				if(res==""||res==null){
					index++;
					task2(files, files[index], index);
					return false;
				}

				task(project, file, socket, JSONParse(res), function(){
					index++;

					task2(files, files[index], index);
				});
			});
		};

		// Read tmp folder to get all files with the prefix "tlm_"
		fs.readdir(path+"tmp/", function(err, files){
			var validFiles = [];

			if(files == undefined){
				utils.log("[COMPILE] CompileTilemaps task for '"+project.name+"' project finished.");
				socket.emit('compileTilemaps');
				return false;
			}

			for(var i=0;i<files.length;i++){
				var file = files[i];
				if(file.indexOf("tlm_") == -1) continue ;
				validFiles.push(file);
			}

			task2(validFiles, validFiles[0], 0);
		});
		
	});

	socket.on('compileVisualScripts', function(d){
		if(typeof compilations[socket.id] === 'undefined') return false;

		var project    = compilations[socket.id];
		var path       = baseDir + project.id + "/";

		var compiler = require("./compiler/VisualScriptCompiler.js")(path);
		compiler.onFinish(function(data){
			if(data == null){
				utils.log("CompileVisualScripts task for '" + project.name + "' project finished.", "COMPILE");
				socket.emit('compileVisualScripts');
			}else{
				// Save into app.js file
				fs.readFile(path + "scripts/app.js", "utf-8", function(err, ctn){
					if(err) log(err, "error");
					ctn += data;

					fs.writeFile(path + "scripts/app.js", ctn, "utf-8", function(err){
						if(err) log(err, "error");

						utils.log("CompileVisualScripts task for '" + project.name + "' project finished.", "COMPILE");
						socket.emit('compileVisualScripts');
					});
				});
			}
		});

		compiler.run();
	});

	socket.on('compileScripts', function(d){
		if(typeof compilations[socket.id] === 'undefined') return false;

		var project = compilations[socket.id];
		var path    = baseDir+project.id+"/";

		var task = function(project, socket){
			var sizeW = (config!=null&&config.size!=null&&config.size.w!=null) ? '"'+config.size.w+'"' : '"100%"';
			var sizeH = (config!=null&&config.size!=null&&config.size.h!=null) ? '"'+config.size.h+'"' : '"100%"';

			// Setter of dynamic fps
			var dynamicFpsStr = "";
			if(config!=null&&!config.dynamicfps) dynamicFpsStr = "Game.setMaxFPS("+config.fps+");";

			// Create main "app.js" to run the game
			var configPrefix  = "";
			if(config!=null&&config.developper_mode) configPrefix += "Config.debugMode=true;";
			else configPrefix += "Config.debugMode=false;";

			var dataMainFile  = configPrefix+'var Game=new Game();Game.load();'+dynamicFpsStr+'Game.setCanvasSize('+sizeW+','+sizeH+');Game.init();Config.assetsDir="https://gameindus.fr/project/'+project.id+'/asset?-=";';
			var scriptsString = "";
			var baseScripts   = "";

			if(config.imagesmoothing != null) dataMainFile += "Game.getContext().imageSmoothingEnabled=" + config.imagesmoothing + ";";
			if(config.displaymode != null && config.displaymode == "center"){
				dataMainFile += "window.addEventListener('load',function(){var cvs=document.getElementById('canvas');cvs.style.position='absolute';cvs.style.left=(window.innerWidth/2-cvs.width/2)+'px';cvs.style.top=(window.innerHeight/2-cvs.height/2)+'px';});";
			}

			fs.writeFile(path+"scripts/app.js", dataMainFile, 'utf-8', function(err){
				if (err) utils.log(err);
			});


			// Read all files in scripts folder to detect custom scripts
			fs.readdir(path+"scripts/", function(err, files){
				if(err){utils.log(err);return false;}
				for(var i=0;i<files.length;i++){
					var file = files[i];
					var randomStr = new Date().getTime();


					if(file!="app.js"&&file!="engine.js") // This is a custom script
						scriptsString += '<script src="scripts/'+file+'?v='+randomStr+'" type="text/javascript" charset="utf-8" defer></script>';
				}
				
				baseScripts += '<script src="https://gameindus.fr:30000/?2d&v='+new Date().getTime()+'" type="text/javascript" defer></script><script src="scripts/app.js?v='+new Date().getTime()+'" type="text/javascript" charset="utf-8" defer></script>';
			});

			// Move base index.html
			fs.readFile(baseDir + "baseIndex.php", 'utf-8', function(err, data){
				data = data.replace('{project_name}', project.name);
				data = data.replace('{project_scripts}', scriptsString);
				data = data.replace('{base_scripts}', baseScripts);

				fs.writeFile(path+"index.php", data, 'utf-8', function(err){
					if (err) utils.log(err);
					
					utils.log("CompileScripts task for '"+project.name+"' project finished.", "COMPILE");
					socket.emit('compileScripts');
				});
			});
		};

		// Check for folders
		fs.exists(path, function(res){
			if(!res){
				fs.mkdir(path, function(err){
					if (err) utils.log(err);
					fs.exists(path+"scripts/", function(res){
						if(!res){
							fs.mkdir(path+"scripts/", function(err){
								if (err) utils.log(err);
								task(project, socket);
							});
						}else{
							task(project, socket);
						}
					});
				});
			}else{
				fs.exists(path+"scripts/", function(res){
					if(!res){
						fs.mkdir(path+"scripts/", function(err){
							if (err) utils.log(err);
							task(project, socket);
						});
					}else{
						task(project, socket);
					}
				});
			}


		});
		
	});

	socket.on('compileSprites', function(d){
		if(typeof compilations[socket.id] === 'undefined') return false;
		
		var project   = compilations[socket.id];
		var path      = baseDir+project.id+"/";

		var task = function(sprite, project, socket, callback){
			fs.readFile(path+"scripts/app.js", "utf-8", function(err, res){
				if (err) utils.log(err);
				var data = res;

				var srcSize  = sprite.size;
				var cellSize = sprite.cellSize;

				spritesVars[sprite.name] = {
					cellSize: cellSize,
					srcSize: srcSize,
					srcName: sprite.srcName,
					animations: sprite.animations,
				};

				callback();
			});
		};

		var task2 = function(files, file, index){
			if(file==null){
				utils.log("compileSprites task for '"+project.name+"' project finished.", "COMPILE");
				socket.emit('compileSprites');
				return false;
			}

			fs.readFile(path+"tmp/"+file, "utf-8", function(err, res){
				if (err) utils.log(err);
				if(res=="" || res==null){
					index++;
					task2(files, files[index], index);
					return false;
				}

				task(JSONParse(res), project, socket, function(){
					index++;

					task2(files, files[index], index);
				});
			});
		};

		// Read tmp folder to get all files with the prefix "spr_"
		fs.readdir(path+"tmp/", function(err, files){
			var validFiles = [];
			for(var i=0;i<files.length;i++){
				var file = files[i];
				if(file.indexOf("spr_") == -1) continue ;
				validFiles.push(file);
			}

			// Sort files by their names
			validFiles.sort();

			task2(validFiles, validFiles[0], 0);
		});

	});

	socket.on('compileScenes', function(d){
		if(typeof compilations[socket.id] === 'undefined') return false;
		
		var project = compilations[socket.id];
		var path    = baseDir+project.id+"/";

		var task = function(file, data, project, socket, callback){
			// Read all scenes files in tmp folder
			fs.exists(path+"scripts/app.js", function(ex){
				if(ex){
					fs.readFile(path+"scripts/app.js", "utf-8", function(err, newText){
						if (err) utils.log(err);
						var sceneName = formatVariable(file.split("_")[1].split(".")[0]) + Object.keys(compiledScenes).length;
						var fullName  = data.name || file.split("_")[1].split(".")[0].replaceAll('-', ' ');

						compiledScenes[file] = sceneName;

						// Create a scene
						newText += 'var scene'+sceneName+'=new Scene();';

						// Add tilemap if exist (with his name)
						if(data.tilemap != null)
							newText += 'scene'+sceneName+'.setTileMap("'+data.tilemap.tilemap.replaceAll('-', ' ').toLowerCase()+'");';


						// Define this scene to the current scene
						newText += 'Game.addScene("' + fullName + '", scene'+sceneName+');';
						if(config == null || config.default_scene == null) newText += 'Game.setCurrentScene(scene' + sceneName + ');';


						// Save app.js with scenes
						fs.writeFile(path+"scripts/app.js", newText, 'utf-8', function(err){
							if (err) utils.log(err);
							callback();
						});
					});
				}else{
					utils.log("app.js file doesn't exist in project '"+project.id+"'.", "ERROR");
				}
			});
		};
		var task2 = function(files, file, index){
			if(file == null){
				// Send default scene
				if(config != null && config.default_scene != null){
					fs.readFile(path+"scripts/app.js", "utf-8", function(err, newText){
						if (err) utils.log(err);
						newText += 'Game.setCurrentScene("' + config.default_scene + '");';
						fs.writeFile(path+"scripts/app.js", newText, 'utf-8', function(err){
							if (err) utils.log(err);
							utils.log("compileScenes task for '"+project.name+"' project finished.", "COMPILE");
							socket.emit('compileScenes');
							return false;
						});
					});
				}else{
					utils.log("compileScenes task for '"+project.name+"' project finished.", "COMPILE");
					socket.emit('compileScenes');
					return false;
				}

				return false;
			}

			fs.readFile(path+"tmp/"+file, "utf-8", function(err, res){
				if (err) utils.log(err);
				if(res==""||res==null){
					index++;
					task2(files, files[index], index);
					return false;
				}

				task(file, JSONParse(res), project, socket, function(){
					index++;

					task2(files, files[index], index);
				});
			});
		};

		// Read tmp folder to get all files with the prefix "scene_"
		fs.readdir(path+"tmp/", function(err, files){
			var validFiles = [];
			for(var i=0;i<files.length;i++){
				var file = files[i];
				if(file.indexOf("scene_") == -1) continue ;
				validFiles.push(file);
			}

			// Sort files by their names
			validFiles.sort();

			task2(validFiles, validFiles[0], 0);
		});

	});

	socket.on('compileObjectsScenes', function(d){
		if(typeof compilations[socket.id] === 'undefined') return false;
		
		var project = compilations[socket.id];
		var path    = baseDir+project.id+"/";

		var task = function(file, data, project, socket, callback){
			fs.exists(path + "scripts/app.js", function(ex){
				if(!ex){callback();return false;}

				fs.readFile(path+"scripts/app.js", "utf-8", function(err, newText){
					if (err) utils.log(err);
					var sceneName = compiledScenes[file];
					if(sceneName == null) sceneName = formatVariable(file.split("_")[1].split(".")[0]);

					var bgId  = 0;
					var sprId = 0;

					if(data.saveVersion == null){
						callback();
						return false;
					}
					
					if(data.objects == null) data.objects = [];

					for(var i = 0; i < data.objects.length; i++) {
						var objectString = data.objects[i];
						if(objectString == null || objectString == "") continue;

						var object          = objectString.split("@");
						var type            = object[0];
						var name            = LZ.decompressFromBase64(object[1]);
						var propertiesArray = object[3].split(";");
						var properties      = {};

						for(var j = 0; j < propertiesArray.length; j++){
							var property = propertiesArray[j];
							var spl      = property.split("=", 2);

							if(spl[1] == "null") spl[1] = null;

							properties[spl[0]] = spl[1];
						}

						var varName = "o" + crypto.createHash("md5").update(sceneName + name, "utf8").digest('hex');

						switch(type){
							case "sprite":
								var size       = JSON.parse(properties.size);
								var position   = JSON.parse(properties.position);
								var spriteFile = LZ.decompressFromBase64(properties.spritefile);
								var spriteName = spriteFile.substring(spriteFile.lastIndexOf("/") + 1);
								var info = spritesVars[spriteName];

								if(info == null) continue;

								newText += 'var ' + varName + ' = new GameObject([' + size.w + ',' + size.h + ']);';
								newText += varName + '.setRenderer(new SpriteRenderer({name: "' + info.srcName + '"}));';
								newText += varName + '.setPosition(' + position.x + ',' + position.y + ');';

								if(properties.layer != "0") newText += varName + '.setLayer(' + properties.layer + ');';
								if(properties.opacity != "1") newText += varName + '.setOpacity(' + properties.opacity + ');';

								for(var l = 0; l < Object.keys(info.animations).length; l++){
									var animName = Object.keys(info.animations)[l];
									var anim = info.animations[animName];

									if(anim == null) continue;
									
									var frames = '[';
									for(var j = anim.begin; j <= anim.finish; j++)
										frames += j + ',';

									frames = frames.substring(0, frames.length - 1) + ']';

									newText += varName + '.defineAnimation("' + animName + '", ' + anim.speed + ', [0, 0], ' + frames + ');';
								}

								if(properties.animation != null)
									newText += varName + '.setAnimation("' + properties.animation + '");';

								newText += 'scene' + sceneName + '.registerGameObject("' + name + '", ' + varName + ');';
							break;
							case "background":
								var size     = JSON.parse(properties.size);
								var position = JSON.parse(properties.position);

								newText += 'var ' + varName + '=new Background({color: "' + LZ.decompressFromBase64(properties.color) + '"});';
								newText += varName + '.setPosition(' + position.x + ',' + position.y + ');';
								newText += varName + '.setSize(' + size.w + ',' + size.h + ');';


								newText += 'scene' + sceneName + '.addBackground(' + varName + ');';
							break;
							case "text":
								var position = JSON.parse(properties.position);
								var font     = LZ.decompressFromBase64(properties.font);

								newText += 'var ' + varName + '=new Text("' + LZ.decompressFromBase64(properties.text) + '");';
								newText += varName + '.setPosition(' + position.x + ',' + position.y + ');';
								if(font != null) newText += varName + '.setFont("' + font + '");';
								newText += varName + '.setFontSize(' + properties.fontSize + ');';
								newText += varName + '.setColor("#' + LZ.decompressFromBase64(properties.color) + '");';

								newText += 'scene' + sceneName + '.addText(' + varName + ');';
							break;
							case "geometricobject":
								var size     = JSON.parse(properties.size);
								var position = JSON.parse(properties.position);
								var shape    = LZ.decompressFromBase64(properties.shape);

								newText += 'var ' + varName + '=new GameObject([' + size.w + ',' + size.h + ']);';
								newText += varName + '.setPosition(' + position.x + ',' + position.y + ');';
								newText += varName + '.setRenderer(new GeometricRenderer({color:"#' + LZ.decompressFromBase64(properties.color) + '"}));';

								if(properties.layer != "0") newText += varName + '.setLayer(' + properties.layer + ');';
								if(properties.opacity != "1") newText += varName + '.setOpacity(' + properties.opacity + ');';
								if(properties.angle != "0") newText += varName + '.getRenderer().angle=' + properties.angle + ';';

								if(shape != "rectangle") newText += varName + '.getRenderer().type="' + shape + '";';

								newText += 'scene' + sceneName + '.registerGameObject("' + name + '", ' + varName + ');';
							break;
							case "tilemap":
								var position    = JSON.parse(properties.position);
								var tilemapFile = LZ.decompressFromBase64(properties.tilemapfile);
								var tilemapName = tilemapFile.substring(tilemapFile.lastIndexOf("/") + 1);

								newText += 'scene' + sceneName + '.setTileMap("' + tilemapName + '");';
								newText += 'scene' + sceneName + '.getTileMap().setPosition(' + position.x + ',' + position.y + ');';
							break;
						}

						if(properties.behaviors){
							var behaviors = JSON.parse(properties.behaviors);

							for(var j = 0; j < Object.keys(behaviors).length; j++){
								var name   = Object.keys(behaviors)[j];
								var params = behaviors[name];

								switch(name){
									case "b_rotate":
										var interval = params.interval || 1;
										var step     = params.step || 1;
										newText += varName + ".addBehavior(new RotateBehavior({step:" + step + ",interval:" + interval + "}));";
									break;
									case "b_button":
										var cible = params.cible;
										if(cible == null || !cible) continue;
										var trigger          = params.trigger || "left";
										var activeAfterClick = params.activeAfterClick || false;

										newText += varName + ".addBehavior(new ButtonBehavior({cible:'" + cible + "',trigger:'" + trigger + "',activeAfterClick:" + activeAfterClick + "}));";
									break;
									case "b_anchor":
										newText += varName + ".addBehavior(new AnchorBehavior());";
									break;
									case "b_boundary":
										newText += varName + ".addBehavior(new BoundaryBehavior());";
									break;
									case "b_sine":
										var mode      = params.mode || "vertical";
										var magnitude = params.magnitude || 20;
										var period    = params.period || 4;

										newText += varName + ".addBehavior(new SineBehavior({mode:'" + mode + "',magnitude:" + magnitude + ",period:" + period + "}));";
									break;
									case "b_solid":
										var mass = params.mass || 0;

										newText += varName + ".setPhysicEngine(new Box2DPhysicEngine({mass: " + mass + "}));";
									break;
								}
							}
						}
					}
					
					// Save app.js with scenes
					fs.exists(path+"scripts/app.js", function(is){
						if(is){
							fs.writeFile(path+"scripts/app.js", newText, 'utf-8', function(err){
								if (err) utils.log(err);
								callback();
							});
						}
					});
				});
			});
		};

		var task2 = function(files, file, index){
			if(file==null){
				utils.log("compileObjectsScenes task for '"+project.name+"' project finished.", "COMPILE");
				socket.emit('compileObjectsScenes');
				return false;
			}

			fs.readFile(path+"tmp/"+file, "utf-8", function(err, res){
				if (err) utils.log(err);
				if(res==""||res==null){
					index++;
					task2(files, files[index], index);
					return false;
				}

				task(file, JSONParse(res), project, socket, function(){
					index++;

					task2(files, files[index], index);
				});
			});
		};

		// Read tmp folder to get all files with the prefix "scene_"
		fs.readdir(path+"tmp/", function(err, files){
			var validFiles = [];
			for(var i=0;i<files.length;i++){
				var file = files[i];
				if(file.indexOf("scene_") == -1) continue ;
				validFiles.push(file);
			}

			// Sort files by their names
			validFiles.sort();
			task2(validFiles, validFiles[0], 0);
		});

	});

	socket.on('compileOptions', function(d){
		if(typeof compilations[socket.id] === 'undefined') return false;
		
		var project = compilations[socket.id];
		var path    = baseDir+project.id+"/";

		var task = function(project, socket){
			// Create ressources JSON
			fs.exists(path+"assets/ressources.json", function(is){
				if(!is){
					fs.writeFile(path+"assets/ressources.json", '{}', 'utf-8', function(err){
						if (err) utils.log(err);
					});
				}
			});

			// Apply configs on game
			fs.exists(path+"tmp/config.json", function(is){
				if(is){
					fs.readFile(path+"tmp/config.json", 'utf-8', function(err, res){
						if (err) utils.log(err);
						var conf = JSONParse(res);

						config = conf;

						utils.log("compileOptions task for '"+project.name+"' project finished.", "COMPILE");
						socket.emit('compileOptions');
					});
				}else{
					if(config != null){
						config["size"]            = {w: "100%", h: "100%"};
						config["developper_mode"] = false;
						config["dynamicfps"]      = true;
					}

					utils.log("compileOptions task for '"+project.name+"' project finished.", "COMPILE");
					socket.emit('compileOptions');
				}
			});

			// Create sounds JSON IF NOT EXISTS
			fs.exists(path+"assets/sounds.json", function(is){
				if(!is){
					fs.writeFile(path+"assets/sounds.json", '{}', 'utf-8', function(err){
						if (err) utils.log(err);
					});
				}
			});
		};

		// Check for folders
		fs.exists(path+"assets/", function(res){
			if(!res){
				fs.mkdir(path+"assets/", function(err){
					if (err) utils.log(err);
					task(project, socket);
				}); 
			}else{
				task(project, socket);
			}
		});

	});


	socket.on("exportGame", function(d){
		var projectId = d.projectId;
		var path      = baseDir + projectId + "/";

		auth.verify(socket, d.credentials, function(){
			var type 		= d.type;
			var compression = d.compression;

			function lowCompression(dir, callback){
				var scripts  = fs.readdirSync(dir + "scripts/");
				var assets   = fs.readdirSync(dir + "assets/");

				var htmlFile = fs.readFileSync(dir + "index.php", "utf-8");
				var html     = htmlFile.substr(0, htmlFile.indexOf("<?php")) + htmlFile.substr(htmlFile.indexOf("?>") + 2);

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
				fs.writeFileSync(dir + "export.zip", data, 'binary');

				if(typeof callback != "undefined") callback(dir + "export.zip");
			}
			function mediumCompression(dir, callback){
				var scripts  = fs.readdirSync(dir + "scripts/");
				var assets   = fs.readdirSync(dir + "assets/");

				var htmlFile = fs.readFileSync(dir + "index.php", "utf-8");
				var html     = htmlFile.substr(0, htmlFile.indexOf("<?php")) + htmlFile.substr(htmlFile.indexOf("?>") + 2);

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
				fs.writeFileSync(dir + "export.zip", data, 'binary');

				if(typeof callback != "undefined") callback(dir + "export.zip");
			}

			switch(type){
				case "web":
					switch(compression){
						case "nothing":
							lowCompression(path, function(path){
								socket.emit("exportGame", {path: path});
							});
						break;
						case "structured":
							mediumCompression(path, function(path){
								socket.emit("exportGame", {path: path});
							});
						break;
						case "optimised":
							mediumCompression(path, function(path){
								socket.emit("exportGame", {path: path});
							});
						break;
					}
				break;
			}
		});
	});


	socket.on('disconnect', function(){
		if(typeof compilations[socket.id] !== 'undefined'){
			var PID  = compilations[socket.id].id;
			var name = compilations[socket.id].name;

			// Save project build in JSON
			var file = baseDir + "builds.json";
			var saveBuildNum = function(PID, json){
				var nb 		= 1;
				var newJSON = json || JSONParse("{}");

				if(json != null && json[PID] != null) nb = parseInt(json[PID]) + 1;

				newJSON[PID] = nb;

				fs.writeFile(file, JSON.stringify(newJSON), "UTF-8", function(err){
					if(err) utils.log("Build saving error..", "error");

					utils.log("Project '"+name+"' compilation finished.", "COMPILE");
					utils.log(" ");
				});
			};

			fs.exists(file, function(ex){
				if(ex){
					fs.readFile(file, "utf-8", function(err, ctn){
						saveBuildNum(PID, JSONParse(ctn));
					});
				}else{
					fs.writeFile(file, "{}", "UTF-8", function(err){
						saveBuildNum(PID);
					});
				}
			});

			delete compilations[socket.id];
		}
	});

});

utils.log(" ");
utils.log("Compiler (Dev) server started !");

function formatVariable(variable){
	return variable.toString().replaceAll("à", "a").replaceAll("é", "e").replaceAll("è", "e").replaceAll("-", "");
}
function formatName(a){return utils.leftPad(parseInt(a),4)}
function isFloat(a){return a===Number(a)&&a%1!==0}

String.prototype.isEmpty = function() {
    return (this.length === 0 || !this.trim());
};
String.prototype.replaceAll = function(target, replacement) {
	return this.split(target).join(replacement);
};
RegExp.prototype.execAll=function(a){for(var b=null,c=new Array;b=this.exec(a);){var d=[];for(i in b)parseInt(i)==i&&d.push(b[i]);c.push(d)}return c};

function JSONParse(json){
    try{
        return JSON.parse(json);
    } catch(e){
        console.utils.log(e);
        return {};
    }
}