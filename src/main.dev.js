var https = require('https');
var fs    = require('fs');
var sq    = require('querystring');
var es    = require('esprima');
var util  = require('util');

var auth  = require("./auth/AuthClient.js");

var utils = require("./utils.js");

var port = 30001;
var BASE = "../projects/";

var log_file = fs.createWriteStream(__dirname + '/logs/main.dev.log', {flags : 'w'});
var log_stdout = process.stdout;
console.log=function(a){log_file.write(util.format(a)+"\n"),log_stdout.write(util.format(a)+"\n")};

// Chargement du serveur nodejs
var server = https.createServer(auth.getSSLCredentials(), function(req, res) {
    if(res.socket.remoteAddress != '::ffff:127.0.0.1'){
        res.writeHead(404, {"Content-Type": "text/html"});
        res.end("<h1>404 Error, file not found.</h1><hr><p>This page is the property of GameIndus&copy. Please leave this page and go to the homepage, <a href='https://gameindus.fr/'>here</a>.</p>");
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

            if(post.action != null &&  post.action == "delete"){
                var deleteFolderRecursive = function(path) {
                    if(fs.existsSync(path)){
                        fs.readdirSync(path).forEach(function(file,index){
                            var curPath = path + "/" + file;
                            if(fs.lstatSync(curPath).isDirectory()) { // recurse
                                deleteFolderRecursive(curPath);
                            } else { // delete file
                                fs.unlinkSync(curPath);
                            }
                        });
                        fs.rmdirSync(path);
                    }
                };

                deleteFolderRecursive("../projects/"+post.PID);
                res.end("");
                return false;
            }
            res.end("");
        });
    }
});

// Chargement de socket.io
var io = require('socket.io').listen(server);
var clients    = {};

// Quand on client se connecte, on le note dans la console
io.sockets.on('connection', function (socket) {
    var origin = socket.handshake.headers.origin; // Je préfère Steam
    if(origin != "http://dev.gameindus.fr"){
        socket.disconnect(true);
        return false;
    }

    // TODO --> Check if user is connected with two windows
    var clientIP = socket.request.connection.remoteAddress;

    var id       = socket.id;
    clients[id]  = clientIP;

    socket.reply = function(d, res){
        d.response = res || {};
        this.emit("request", d);
    };

    socket.on('getSocketID', function(){
        socket.emit('getSocketID', {id: id});
    });
    socket.on('disconnect', function(){
        if(Object.keys(clients).indexOf(id) > -1)
            clients[id] = undefined;
    });

    /**
    **  Request section
    **/
    socket.on('request', function(d){
        d.project = d.credentials.projectId;
        d.pid     = d.projectId = formatName(d.credentials.projectId);

        auth.verify(socket, d.credentials, function(){
            switch(d.method){
                case "getBuildNumber" :
                    var projectNumber = d.pid;
                    var file = "../projects/builds.json";

                    fs.exists(file, function(ex){
                        if(ex){
                            fs .readFile(file, "utf-8", function(err, ctn){
                                var json = utils.parseJson(ctn);
                                var bn   = 0;

                                if(json[projectNumber] != null) bn = parseInt(json[projectNumber]);
                                socket.reply(d, {build: bn});
                            });
                        }else{
                            socket.reply(d, {build: 0});
                        }
                    });
                break;

                /**
                **  Script section 
                **/
                case "loadScript":
                    var projectNumber = d.projectId;
                    var path     = "../projects/" + projectNumber + "/scripts/";
                    var filename = path+d.data.filename;

                    var readFile = function (filename, socket){
                        fs.readFile(filename, function(err, data) {
                            if(err) return utils.log(err, "ERROR");
                            socket.reply(d, {code: data.toString('utf-8', 0, data.length)});
                        }); 
                    };

                    fs.exists(filename, function(res){
                        if(!res){
                            fs.writeFile(filename, '', 'utf-8', function(err){
                                if(err) return utils.log(err, "ERROR");
                                readFile(filename, socket);
                            });
                        }else{
                            readFile(filename, socket);
                        }
                    })
                break;
                case "checkForScript":
                    var code = d.data.code;

                    try{
                        var syntax = es.parse(code, { tolerant: true, loc: true });
                        var errors = syntax.errors;

                        if(errors.length > 0){
                            socket.reply(d, {code: code, errors: errors});
                            return false;
                        }
                    } catch(e) {
                        socket.reply(d, {code: code, error: e});
                        return false;
                    }

                    socket.reply(d, {code: code, error: null});
                break;
                case "saveScript":
                    var projectNumber = d.projectId;
                    var code     = d.data.code;
                    var path     = "../projects/"+projectNumber+"/scripts/";
                    var filename = path+d.data.filename;

                    if(d.data.filename==".js"){
                        utils.log("Script name for project "+projectNumber+" is empty.", "ERROR");
                        return false;
                    }

                    var task = function(){
                        fs.writeFile(filename, code, function(err) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            utils.log("[#"+projectNumber+"] File "+d.data.filename+" saved.");
                        });
                    };

                    fs.exists(path, function(exi){
                        if(exi){
                            task();
                        }else{
                            fs.mkdir(path, function(err){
                                if(err){utils.log(err, "ERROR");return false;}
                                task();
                            })
                        }
                    });
                break;

                /**
                **  Sprite section 
                **/
                case "loadSprite":
                    var projectNumber = d.projectId;
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"spr_"+d.data.filename+".json";

                    var readSpriteFile = function (filename, socket){
                        fs.readFile(filename, function(err, data) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            var dataString = data.toString('utf-8', 0, data.length);

                            if(dataString!="")
                                socket.reply(d, {sprite: utils.parseJson(dataString)});
                            else
                                socket.reply(d, {sprite: null, error: "sprite_unknown"});
                        }); 
                    };

                    fs.exists(filename, function(res){
                        if(!res){
                            fs.writeFile(filename, '', 'utf-8', function(err){
                                if(err) return utils.log(err, "ERROR");
                                readSpriteFile(filename, socket);
                            });
                        }else{
                            readSpriteFile(filename, socket);
                        }
                    })
                break;
                case "saveSprite":
                    var projectNumber = d.projectId;
                    var file     = d.data.file; 
                    d.data.file  = undefined;
                    var json     = JSON.stringify(d.data);
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"spr_"+file+".json";

                    var writeFile = function(filename, socket){
                        fs.writeFile(filename, json, function(err) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            utils.log("[#" + projectNumber + "] Sprite '" + d.data.path + file + "' saved.");
                        }); 
                    }

                    fs.exists(path, function(res){
                        if(!res){
                            fs.mkdir(path, function(err){
                                if(err) return utils.log(err, "ERROR");
                                writeFile(filename, socket);
                            });
                        }else{
                            writeFile(filename, socket);
                        }
                    });
                break;

                /**
                **  Tilemap section
                **/
                case "loadTilemap":
                    var projectNumber = d.projectId;
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"tlm_"+d.data.filename+".json";

                    var readSpriteFile = function (filename, socket){
                        fs.readFile(filename, function(err, data) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            var dataString = data.toString('utf-8', 0, data.length);

                            if(dataString!="")
                                socket.reply(d, {tilemap: utils.parseJson(dataString)});
                            else
                                socket.reply(d, {error: true, tilemap: null});
                        }); 
                    };

                    fs.exists(filename, function(res){
                        if(!res){
                            fs.writeFile(filename, '', 'utf-8', function(err){
                                if(err) return utils.log(err, "ERROR");
                                readSpriteFile(filename, socket);
                            });
                        }else{
                            readSpriteFile(filename, socket);
                        }
                    })
                break;
                case "saveTilemap":
                    var projectNumber = d.projectId;
                    var file     = d.data.file; 
                    d.data.file  = undefined;
                    var json     = JSON.stringify(d.data);
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"tlm_"+file+".json";

                    var writeFile = function(filename, socket){
                        fs.writeFile(filename, json, function(err) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            utils.log("[#"+projectNumber+"] Tilemap "+file+" saved.");
                        }); 
                    }

                    fs.exists(path, function(res){
                        if(!res){
                            fs.mkdir(path, function(err){
                                if(err) return utils.log(err, "ERROR");
                                writeFile(filename, socket);
                            });
                        }else{
                            writeFile(filename, socket);
                        }
                    });
                break;

                /**
                **  visualScript section
                **/
                case "loadVisualScript":
                    var projectNumber = d.projectId;
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"vsf_"+d.data.filename+".json";

                    var readVisualScriptFile = function (filename, socket){
                        fs.readFile(filename, function(err, data) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            var dataString = data.toString('utf-8', 0, data.length);

                            if(dataString != "")
                                socket.reply(d, {visualScript: dataString});
                        }); 
                    };

                    fs.exists(filename, function(res){
                        if(!res){
                            fs.writeFile(filename, '', 'utf-8', function(err){
                                if(err) return utils.log(err, "ERROR");
                                readVisualScriptFile(filename, socket);
                            });
                        }else{
                            readVisualScriptFile(filename, socket);
                        }
                    })
                break;
                case "saveVisualScript":
                    var projectNumber = d.projectId;
                    var file          = d.data.filename; 
                    var json          = d.data.work;
                    var path          = "../projects/" + projectNumber + "/tmp/";
                    var filename      = path+"vsf_" + file + ".json";

                    d.data.filename  = undefined;

                    var writeFile = function(filename, socket){
                        fs.writeFile(filename, json, function(err) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            utils.log("[#" + projectNumber + "] VisualScript '" + file + "' saved.");
                        }); 
                    }

                    fs.exists(path, function(res){
                        if(!res){
                            fs.mkdir(path, function(err){
                                if(err) return utils.log(err, "ERROR");
                                writeFile(filename, socket);
                            });
                        }else{
                            writeFile(filename, socket);
                        }
                    });
                break;

                /**
                **  Ressources section
                **/
                case "saveRessource":
                    var projectNumber = d.projectId;
                    var srcName  = d.data.name;
                    var srcPath  = d.data.src;

                    var json     = {};
                    var path     = "../projects/"+projectNumber+"/assets/";
                    var filename = path+"ressources.json";

                    var writeFile = function(json, filename, socket){
                        json[srcName] = {
                            type: "img",
                            src : srcPath
                        };

                        fs.writeFile(filename, JSON.stringify(json), function(err) {
                            if(err) return utils.log(err, "ERROR");

                            socket.reply(d, {src: srcName});
                            utils.log("[#"+projectNumber+"] Ressource '"+srcName+"' saved.");
                        }); 
                    }


                    fs.exists(filename, function(res){
                        if(res){
                            fs.readFile(filename, "utf-8", function(err, res){
                                if(err) return utils.log(err, "ERROR");

                                if(res == "") res = "{}";

                                writeFile(utils.parseJson(res), filename, socket);
                            });
                        }else{
                            writeFile(json, filename, socket);
                        }
                    });
                break;
                case "removeRessource":
                    var projectNumber = d.projectId;
                    var srcName  = d.data.name;
                    var srcPath  = d.data.src;

                    var json     = {};
                    var path     = "../projects/" + projectNumber + "/assets/";
                    var filename = path + "ressources.json";

                    var removeRessourceFile = function(json, filename, socket){
                        if(json[srcName] != null) delete json[srcName];

                        fs.writeFile(filename, JSON.stringify(json), function(err) {
                            if(err) return utils.log(err, "ERROR");

                            fs.unlink(path + srcPath, function(err){
                                if(err) return utils.log(err, "ERROR");

                                socket.reply(d, {removed: true});
                                utils.log("[#"+projectNumber+"] Ressource '"+srcName+"' removed.");
                            });
                        }); 
                    }


                    fs.exists(filename, function(res){
                        if(res){
                            fs.readFile(filename, "utf-8", function(err, res){
                                if(err) return utils.log(err, "ERROR");

                                if(res == "") res = "{}";
                                removeRessourceFile(utils.parseJson(res), filename, socket);
                            });
                        }else{
                            socket.reply(d, {removed: false});
                        }
                    });
                break;
                case "renameRessource":
                    var projectNumber = d.projectId;
                    var oldname  = d.data.oldname;
                    var oldfile  = d.data.oldfile;
                    var newname  = d.data.newname;

                    var json     = {};
                    var path     = "../projects/" + projectNumber + "/assets/";
                    var filename = path + "ressources.json";

                    var renameRessourceFile = function(json, filename, socket){
                        var oldsrc = "";
                        var newsrc = "";

                        var jsonKey = null;

                        for(var i = 0; i < Object.keys(json).length; i++){
                            var key = Object.keys(json)[i];
                            var val = json[key];

                            if(val.src == oldfile) jsonKey = key;
                            // console.log(val);
                        }

                        // console.log(oldfile, jsonKey);

                        if(jsonKey != null){
                            var obj = json[jsonKey];
                            delete json[jsonKey];

                            oldsrc = obj.src;
                            newsrc = formatFilename(newname + "." + oldsrc.split(".")[oldsrc.split(".").length-1]);

                            obj.src = newsrc;
                            json[newname] = obj;
                        }

                        if(oldsrc == "" || newsrc == ""){socket.reply(d, {oldname: oldname, newname: null});return false;}

                        fs.writeFile(filename, JSON.stringify(json), function(err) {
                            if(err) return utils.log(err, "ERROR");

                            fs.rename(path + oldsrc, path + newsrc, function(err){
                                if(err) return utils.log(err, "ERROR");

                                socket.reply(d, {oldname: oldname, newname: newname});
                                utils.log("[#"+projectNumber+"] Ressource '" + oldname + "' renamed to '"+newname+"' (#" + projectNumber + ").");
                            });
                        }); 
                    }


                    fs.exists(filename, function(res){
                        if(res){
                            fs.readFile(filename, "utf-8", function(err, res){
                                if(err) return utils.log(err, "ERROR");

                                if(res == "") res = "{}";
                                renameRessourceFile(utils.parseJson(res), filename, socket);
                            });
                        }else{
                            socket.reply(d, {oldname: oldname, newname: null});
                        }
                    });
                break;


                /**
                **  Scene section
                **/
                case "loadScene":
                    var projectNumber = d.projectId;
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"scene_"+d.data.filename+".json";

                    var readSpriteFile = function (filename, socket){
                        fs.readFile(filename, function(err, data) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            var dataString = data.toString('utf-8', 0, data.length);

                            if(dataString != "")
                                socket.reply(d, {scene: utils.parseJson(dataString)});
                            else
                                socket.reply(d, {scene: {objs: [], tilemap: null}});
                        }); 
                    };

                    fs.exists(filename, function(res){
                        if(!res){
                            fs.writeFile(filename, '', 'utf-8', function(err){
                                if(err) return utils.log(err, "ERROR");
                                readSpriteFile(filename, socket);
                            });
                        }else{
                            readSpriteFile(filename, socket);
                        }
                    })
                break;
                case "saveScene":
                    var projectNumber = d.projectId;
                    var file     = d.data.file; 
                    var name     = d.data.name;
                    d.data.file  = undefined;
                    var json     = JSON.stringify(d.data);
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"scene_"+file+".json";

                    var writeFile = function(filename, socket){
                        fs.writeFile(filename, json, function(err) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            utils.log("[#"+projectNumber+"] Scene "+name+" saved.");
                        }); 
                    }

                    fs.exists(path, function(res){
                        if(!res){
                            fs.mkdir(path, function(err){
                                if(err) return utils.log(err, "ERROR");
                                writeFile(filename, socket);
                            });
                        }else{
                            writeFile(filename, socket);
                        }
                    });
                break;

                /**
                 **  Config section
                 **/
                case "loadConfig":
                    var projectNumber = d.projectId;
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"config.json";

                    var readFile = function (filename, socket){
                        fs.readFile(filename, function(err, data) {
                            if(err) return utils.log(err, "ERROR");
                            socket.reply(d, {config: utils.parseJson(data.toString('utf-8', 0, data.length))});
                        });
                    };

                    fs.exists(filename, function(res){
                        if(!res){
                            fs.writeFile(filename, '{"dynamicfps":true}', 'utf-8', function(err){
                                if(err) return utils.log(err, "ERROR");
                                readFile(filename, socket);
                            });
                        }else{
                            readFile(filename, socket);
                        }
                    })
                    break;
                case "saveConfig":
                    var projectNumber = d.projectId;
                    var config     = d.data.config;
                    var path     = "../projects/"+projectNumber+"/tmp/";
                    var filename = path+"config.json";

                    var task = function(){
                        fs.writeFile(filename, JSON.stringify(config), function(err) {
                            if(err) {
                                return utils.log(err, "ERROR");
                            }

                            utils.log("[#"+projectNumber+"] File config.json saved.");
                            socket.reply(d);
                        });
                    };

                    fs.exists(path, function(exi){
                        if(exi){
                            task();
                        }else{
                            fs.mkdir(path, function(err){
                                if(err){utils.log(err, "ERROR");return false;}
                                task();
                            })
                        }
                    });
                    break;

                /**
                 *  Sounds section
                 */
                case "saveSoundRessource":
                    var projectNumber = d.projectId;
                    var path          = "../projects/"+projectNumber+"/assets/";

                    var src     = d.data.src;
                    var name    = d.data.name;

                    var task = function(){
                        fs.readFile(path + "sounds.json", "utf-8", function(err, res){
                            if(err) console.utils.log(err, "ERROR");

                            var json = utils.parseJson(res);
                            json[name] = src;

                            fs.writeFile(path + "sounds.json", JSON.stringify(json), "utf-8", function(err){
                                if(err) console.utils.log(err, "ERROR");
                            });
                        });
                    };

                    fs.exists(path + "sounds.json", function(ex){
                        if(ex){
                            task();
                        }else{
                            fs.writeFile(path + "sounds.json", "{}", "utf-8", function(err){
                                if(err) console.utils.log(err, "ERROR");

                                task();
                            });
                        }
                    });
                break;

                case "saveSound":
                    var projectNumber = d.projectId;
                    var path          = "../projects/"+projectNumber+"/tmp/";

                    var src  = d.data.src;
                    var name = d.data.name;
                    var tmpFile = "snd_" + name.toString().replaceAll(' ', '-').toLowerCase() + ".json";

                    var task = function(){
                        fs.readFile(path + tmpFile, "utf-8", function(err, res){
                            if(err) console.utils.log(err, "ERROR");

                            var json = utils.parseJson(res);
                            
                            json["name"] = name;
                            json["src"]  = src;

                            fs.writeFile(path + tmpFile, JSON.stringify(json), "utf-8", function(err){
                                if(err) console.utils.log(err, "ERROR");
                            });
                        });
                    };

                    fs.exists(path + tmpFile, function(ex){
                        if(ex){
                            task();
                        }else{
                            fs.writeFile(path + tmpFile, "{}", "utf-8", function(err){
                                if(err) console.utils.log(err, "ERROR");

                                task();
                            });
                        }
                    });
                break;

                case "loadSound":
                    var projectNumber = d.projectId;
                    var path          = "../projects/"+projectNumber+"/tmp/";

                    var name = d.data.name;
                    var tmpFile = "snd_" + name.toString().replaceAll(' ', '-').toLowerCase() + ".json";

                    var task = function(){
                        fs.readFile(path + tmpFile, "utf-8", function(err, res){
                            if(err) console.utils.log(err, "ERROR");

                            utils.log("[#"+d.projectId+"] Sound file '" + name + "' loaded.");
                            socket.reply(d, {sound: utils.parseJson(res.toString('utf-8', 0, res.length))});
                        });
                    };

                    fs.exists(path + tmpFile, function(ex){
                        if(ex){
                            task();
                        }
                    });
                break;

                /**
                 **  Files/Folder section
                 **/
                case "getFiles":
                    var base = "../projects/" + d.pid + "/";
                    var file = base + "tmp/files.json";

                    var getFilesTask = function(){
                        fs.readFile(file, "utf-8", function(err, res){
                            if(err) utils.log(err, "ERROR");
                            socket.reply(d, utils.parseJson(res));
                        });
                    };

                    var task = function(){
                        fs.exists(file, function(exist){
                            if(!exist){
                                fs.writeFile(file, "{}", "utf-8", function(err){
                                    if(err) utils.log(err, "ERROR");
                                    getFilesTask();
                                });
                            }else{
                                getFilesTask();
                            }
                        });
                    };

                    fs.exists(base, function(exist){
                        if(!exist){
                            fs.mkdir(base, function(err){
                                if(err) utils.log(err, "ERROR");
                                fs.mkdir(base+"tmp/", function(err){
                                    if(err) utils.log(err, "ERROR");
                                    task();
                                });
                                fs.mkdir(base+"assets/", function(err){
                                    if(err) utils.log(err, "ERROR");

                                    fs.writeFile(base + "assets/ressources.json", "{}", function(err) {
                                        if(err) utils.log(err, "ERROR");

                                        var exec = require('child_process').exec;
                                        var cmd = 'chown -R www-data:gameindus /home/gameindus/system/projects/' + d.pid + "/";

                                        exec(cmd, function(err, stdout, stderr) {
                                            if(err) utils.log(err, "ERROR");
                                        });
                                    });

                                    
                                });
                            });
                        }else{
                            task();
                        }
                    });
                break;

                case "createFolder":
                    createFolder(d.projectId, d.data.name, d.data.path, function(path, name){
                        utils.log("[#" + d.projectId + "] Folder '" + path + name + "/' created.");
                        socket.reply(d, {name: name, path: path});
                    });
                break;
                case "renameFolder":
                    renameFolder(d.projectId, d.data.path, d.data.oldName, d.data.newName, function(path){
                        utils.log("[#" + d.projectId + "] Folder '" + path + d.data.oldName + "/' renamed to '" + path + d.data.newName + "/'.");
                        socket.reply(d, {path: path, oldName: d.data.oldName, newName: d.data.newName});
                    });
                break;
                case "moveFolder":
                    moveFolder(d.projectId, d.data.name, d.data.path, d.data.newPath, function(path){
                        utils.log("[#" + d.projectId + "] Folder '" + d.data.path + "' moved to '" + path + "'.");
                        socket.reply(d, {path: path, oldPath: d.data.path, newPath: path});
                    });
                break;
                case "removeFolder":
                    removeFolder(d.projectId, d.data.path, function(path){
                        utils.log("[#" + d.projectId + "] Folder '" + path + "' removed.");
                        socket.reply(d, {path: path});
                    });
                break;
            
                case "createFile":
                    createFile(d.projectId, d.data.name, d.data.type, d.data.path, function(path, name, type){
                        utils.log("[#" + d.projectId + "] File '" + path + name + "' created.");
                        socket.reply(d, {name: name, type: type, path: path});
                    });
                break;
                case "renameFile":
                    renameFile(d.projectId, d.data.path, d.data.oldName, d.data.newName, function(path){
                        utils.log("[#" + d.projectId + "] File '" + path + d.data.oldName + "' renamed to '" + path + d.data.newName + "'.");
                        socket.reply(d, {path: path, oldName: d.data.oldName, newName: d.data.newName});
                    });
                break;
                case "removeFile":
                    removeFile(d.projectId, d.data.path, function(path){
                        utils.log("[#" + d.projectId + "] File '" + path + "' removed.");
                        socket.reply(d, {path: path});
                    });
                break;



                case "moveMarketAsset":
                    var base = "../projects/" + d.pid + "/";

                    var filename  = d.data.filename;
                    var assetsDir = base + "assets/";


                    fs.readFile("/home/gameindus/system/assets/" + filename, function(err, res){
                        if(err){utils.log(err, "error");return false;}

                        if(filename[filename.length-1] == ".") filename = filename.substring(0, filename.length - 1) + ".png";

                        fs.writeFile(assetsDir + filename, res, function(err){
                            if(err){utils.log(err, "error");return false;}

                            socket.reply(d, {success: true, newFilename: filename});
                        })
                    });
                break;
            
            }
        });
    });

    

    /**
     **  Files section
     **/

    socket.on("saveFile", function(d){
        auth.verify(socket, d.credentials, function(){
            d.project = formatName(d.project);
            var base = "../projects/"+d.project+"/";
            var file = base+"tmp/files.json";

            fs.readFile(file, "utf-8", function(err, res){
                if(err) utils.log(err, "ERROR");
                var data = utils.parseJson(res);
                if(!(typeof d.type === "string")) return false;

                if(d.type=="folder"){
                    data[d.name] = {};
                }else{
                    if(d.folder==undefined||d.folder==null||d.folder=="")
                        data[d.name] = d.type;
                    else
                        data[d.folder][d.name] = d.type;
                }

                fs.writeFile(file, JSON.stringify(data), "utf-8", function(err){
                    if(err) utils.log(err, "ERROR");
                })
            });
        });
    });

    /**
     **   Market Section
     **/
    socket.on("getAssetsFromMarket", function(d){
        var q = d.search;
        var c = utils.getMysql();

        c.query("SELECT * FROM assets WHERE `name` LIKE ?", "%" + [q] + "%", function(err, rows, fields){
            if(err){utils.log(err, "error");}

            socket.emit("getAssetsFromMarket", {success: true, assets: rows});
        });

        c.end();
    });
});


// All functions
function createFile(pId, name, type, path, callback){
    var base = BASE + pId + "/";

    fs.readFile(base + "tmp/files.json", "utf-8", function(err, res){
        if(err) utils.log(err, "ERROR");
        var files = JSON.parse(res);

        var sf = path.split("/");
        sf.splice(sf.length - 1, 1);
        if(sf[0] == '') sf.splice(0, 1);

        if(sf.length == 0){
            if(files[name] == undefined) files[name] = type;
        }else{
            var buildObject = function(arr){
                var c = {};

                var l = arr.length;
                
                for(var i = 0; i < arr.length; i++){
                    var v = arr[i];

                    arr.splice(0, 1);
                    c[v] = buildObject(arr);

                    if(i == l - 1){
                        c[v][name] = type;
                    }
                }

                return c;
            };

            files = utils.extend(true, files, buildObject(sf));
        }

        var r = JSON.stringify(files);

        fs.writeFile(base + "tmp/files.json", r, "utf-8", function(err){
            if(err) utils.log(err, "ERROR");
            callback(path, name, type);
        });
    });
}
function renameFile(pId, path, oldName, newName, callback){
    var base = BASE + pId + "/";

    fs.readFile(base + "tmp/files.json", "utf-8", function(err, res){
        if(err) utils.log(err, "ERROR");
        var files = JSON.parse(res);
        var name  = oldName;
        var type  = null;
        var sf    = path.split("/");

       
        sf.splice(sf.length - 1, 1);
        if(sf[0] == '') sf.splice(0, 1);

        var renameInObject = function(o, oldName, newName){
            var k  = Object.keys(o);
            var ks = k.clone();
            var ds = {};

            for(var i = 0; i < k.length; i++){
                var ki = k[i];
                ds[ki] = o[ki];
                delete o[ki];
            }

            for(var i = 0; i < ks.length; i++){
                var ki = ks[i];

                if(ki != oldName){
                    o[ki] = ds[ki];
                }else{
                    o[newName] = ds[ki];
                }
            }
        };

        if(sf.length == 0){
            type = files[name];
            if(files[name] != undefined){
                renameInObject(files, oldName, newName);
            }
        }else{
            var getObjectWithPath = function(arr, base){
                if(arr.length > 0){
                    var v = base[arr[0]];
                    arr.splice(0, 1);

                    return getObjectWithPath(arr, v);
                }else{
                    type = base[oldName];
                    return base;
                }
            };

            renameInObject(getObjectWithPath(sf.clone(), files), oldName, newName);
        }

        var r = JSON.stringify(files);

        fs.writeFile(base + "tmp/files.json", r, "utf-8", function(err){
            if(err) utils.log(err, "ERROR");
            
            renameFileOnDisk(oldName, newName, type, function(){
                callback(path);
            });
        });
    });
    
    var renameFileOnDisk = function(oldName, newName, type, callback){
        var filename    = oldName.toString().replaceAll(" ", "-").replaceAll('è', '').toLowerCase();
        var newFilename = newName.toString().replaceAll(" ", "-").replaceAll('è', '').toLowerCase();
        var path     = null;
        var newPath  = null;

        if(type == "script"){
            path = "scripts/" + filename + ".js";
            newPath = "scripts/" + newFilename + ".js";
        }else{
            var pre = null;

            switch(type){
                case "sprite": pre = "spr"; break;
                case "tilemap": pre = "tlm"; break;
                case "scene": pre = "scene"; break;
                case "sound": pre = "snd"; break;
                case "visualscript": pre = "vsf"; break;
            }

            if(pre == null){
                callback();
                return false;
            }

            path = "tmp/" + pre + "_" + filename + ".json";
            newPath = "tmp/" + pre + "_" + newFilename + ".json";
        }

        fs.exists(base + path, function(ex){
            if(ex){
                fs.rename(base + path, base + newPath, function(err){
                    if(err) utils.log(err, "ERROR");

                    fs.exists(base + path, function(ex){
                        if(ex) fs.unlinkSync(base + path);
                    });

                    if(pre == "spr"){
                        fs.readFile(base + newPath, "utf-8", function(err, ctn){
                            if(err) utils.log(err, "ERROR");
                            ctn = JSON.parse(ctn);
                            ctn.name = newFilename;
                            ctn = JSON.stringify(ctn);

                            fs.writeFile(base + newPath, ctn, "utf-8", function(err){
                                if(err) utils.log(err, "ERROR");

                                callback();
                            });
                        });
                    }else{
                        callback();
                    }
                });


            }else{
                callback();
            }
        });
    };
}
function removeFile(pId, path, callback){
    var base = BASE + pId + "/";

    fs.readFile(base + "tmp/files.json", "utf-8", function(err, res){
        if(err) utils.log(err, "ERROR");
        var files = JSON.parse(res);

        path += "/";

        var sf = path.split("/");
        sf.splice(sf.length - 1, 1);

        var name = sf[sf.length - 1];
        var type = null;


        sf.splice(sf.length - 1, 1);
        if(sf[0] == '') sf.splice(0, 1);

        if(sf.length == 0){
            type = files[name];
            if(files[name] != undefined) delete files[name];
        }else{
            var getObjectWithPath = function(arr, base){
                if(arr.length > 0){
                    var v = base[arr[0]];
                    arr.splice(0, 1);

                    return getObjectWithPath(arr, v);
                }else{
                    return base;
                }
            };

            type = getObjectWithPath(sf.clone(), files)[name];
            delete getObjectWithPath(sf.clone(), files)[name];
        }

        var r = JSON.stringify(files);

        fs.writeFile(base + "tmp/files.json", r, "utf-8", function(err){
            if(err) utils.log(err, "ERROR");
            
            removeFileOnDisk(name, type, function(){
                callback(name, type);
            });
        });
    });
    
    var removeFileOnDisk = function(name, type, callback){
        var filename = name.toString().replaceAll(" ", "-").replaceAll('è', '').toLowerCase();
        var path     = null;

        if(type == "script"){
            path = "scripts/" + filename + ".js";
        }else{
            var pre = null;

            switch(type){
                case "sprite": pre = "spr"; break;
                case "tilemap": pre = "tlm"; break;
                case "scene": pre = "scene"; break;
                case "sound": pre = "snd"; break;
                case "visualscript": pre = "vsf"; break;
            }

            if(pre == null){
                callback();
                return false;
            }

            path = "tmp/" + pre + "_" + filename + ".json";
        }

        fs.exists(base + path, function(ex){
            if(ex){
                fs.unlink(base + path, function(err){
                    if(err) utils.log(err, "ERROR");
                    callback();
                })
            }else{
                callback();
            }
        });
    };
}

function createFolder(pId, name, path, callback){
    var base = BASE + pId + "/";

    fs.readFile(base + "tmp/files.json", "utf-8", function(err, res){
        if(err) utils.log(err, "ERROR");
        var files = JSON.parse(res);

        var sf = path.split("/");
        sf.splice(sf.length - 1, 1);
        if(sf[0] == '') sf.splice(0, 1);

        if(sf.length == 0){
            if(files[name] == undefined) files[name] = {};
        }else{
            var buildObject = function(arr){
                var c = {};
                
                for(var i = 0; i < arr.length; i++){
                    var v = arr[i];

                    arr.splice(0, 1);
                    c[v] = buildObject(arr);
                }

                return c;
            };
            sf.push(name);

            files = utils.extend(true, files, buildObject(sf));
        }

        var r = JSON.stringify(files);

        fs.writeFile(base + "tmp/files.json", r, "utf-8", function(err){
            if(err) utils.log(err, "ERROR");
            callback(path, name);
        });
    });
}
function renameFolder(pId, path, oldName, newName, callback){
    var base = BASE + pId + "/";

    fs.readFile(base + "tmp/files.json", "utf-8", function(err, res){
        if(err) utils.log(err, "ERROR");
        var files = JSON.parse(res);
        var name  = oldName;
        var sf    = path.split("/");

       
        sf.splice(sf.length - 1, 1);
        if(sf[0] == '') sf.splice(0, 1);

        var renameInObject = function(o, oldName, newName){
            var k  = Object.keys(o);
            var ks = k.clone();
            var ds = {};

            for(var i = 0; i < k.length; i++){
                var ki = k[i];
                ds[ki] = o[ki];
                delete o[ki];
            }

            for(var i = 0; i < ks.length; i++){
                var ki = ks[i];

                if(ki != oldName){
                    o[ki] = ds[ki];
                }else{
                    o[newName] = ds[ki];
                }
            }
        };

        if(sf.length == 0){
            if(files[name] != undefined){
                renameInObject(files, oldName, newName);
            }
        }else{
            var getObjectWithPath = function(arr, base){
                if(arr.length > 0){
                    var v = base[arr[0]];
                    arr.splice(0, 1);

                    return getObjectWithPath(arr, v);
                }else{
                    return base;
                }
            };

             renameInObject(getObjectWithPath(sf.clone(), files), oldName, newName);
        }

        var r = JSON.stringify(files);

        fs.writeFile(base + "tmp/files.json", r, "utf-8", function(err){
            if(err) utils.log(err, "ERROR");
            callback(path);
        });
    });
}
function moveFolder(pId, name, oldPath, newPath, callback){
    var base = BASE + pId + "/";

    fs.readFile(base + "tmp/files.json", "utf-8", function(err, res){
        if(err) utils.log(err, "ERROR");
        var files = JSON.parse(res);

        var sf = oldPath.split("/");
        sf.splice(sf.length - 1, 1);
        sf.splice(sf.length - 1, 1);
        if(sf[0] == '') sf.splice(0, 1);

        // Remove folder & stock it in ram
        var o = {};
        if(sf.length == 0){
            o = files[name].clone();
            delete files[name];
        }else{
            var getObjectWithPath = function(arr, base){
                if(arr.length > 0){
                    var v = base[arr[0]];
                    arr.splice(0, 1);

                    return getObjectWithPath(arr, v);
                }else{
                    return base;
                }
            };

            o = getObjectWithPath(sf.clone(), files)[name].clone();
            delete getObjectWithPath(sf.clone(), files)[name];
        }

        // Re-create folder & fill it
        var sf2 = newPath.split("/");
        sf2.splice(sf2.length - 1, 1);
        if(sf2[0] == '') sf2.splice(0, 1);

        if(sf2.length == 0){
            if(files[name] == undefined) files[name] = o;
        }else{
            var buildObject = function(arr, name, objToFill){
                var c = {};

                if(arr.length == 0) c = objToFill;
                
                for(var i = 0; i < arr.length; i++){
                    var v = arr[i];

                    arr.splice(0, 1);
                    c[v] = buildObject(arr, name, objToFill);
                }

                return c;
            };
            sf2.push(name);

            files = utils.extend(true, files, buildObject(sf2, name, o));
        }

        var r = JSON.stringify(files);

        fs.writeFile(base + "tmp/files.json", r, "utf-8", function(err){
            if(err) utils.log(err, "ERROR");
            callback(newPath + name + "/");
        });
    });
}
function removeFolder(pId, path, callback){
    var base = BASE + pId + "/";

    fs.readFile(base + "tmp/files.json", "utf-8", function(err, res){
        if(err) utils.log(err, "ERROR");
        var files = JSON.parse(res);

        var sf = path.split("/");
        sf.splice(sf.length - 1, 1);

        var name = sf[sf.length - 1];

        sf.splice(sf.length - 1, 1);
        if(sf[0] == '') sf.splice(0, 1);

        if(sf.length == 0){
            if(files[name] != undefined) delete files[name];
        }else{
            var getObjectWithPath = function(arr, base){
                if(arr.length > 0){
                    var v = base[arr[0]];
                    arr.splice(0, 1);

                    return getObjectWithPath(arr, v);
                }else{
                    return base;
                }
            };

            delete getObjectWithPath(sf, files)[name];
        }

        var r = JSON.stringify(files);

        fs.writeFile(base + "tmp/files.json", r, "utf-8", function(err){
            if(err) utils.log(err, "ERROR");
            callback(path);
        });
    });
}


server.listen(port);
utils.log(" ");
utils.log("Main (Dev) server started on port "+port+".");

function formatName(a){return utils.leftPad(parseInt(a),4)}
function formatFilename(a){return null==a?"":a.toString().replaceAll(" ","-").toLowerCase()}