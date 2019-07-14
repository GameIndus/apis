module.exports = function(){
	return new Storage();
};

function Storage(){
	this.projectsStorage = {};

	this.autosave();
}

Storage.prototype = {

	getProjectsStorage: function(){
		return this.projectsStorage;
	},
	getProjectStorage: function(projectId){
		if(this.getProjectsStorage()[projectId] == null)
			this.getProjectsStorage()[projectId] = new ProjectStorage(projectId);


		return this.getProjectsStorage()[projectId];
	},

	newFileModification: function(projectId, data){
		var type     = data.type;
		var filename = data.file;
		var method   = data.submethod;

		var projectStorage = this.getProjectStorage(projectId);
		if(!projectStorage.fileDataExists(type, filename)) return false;

		var fileData = projectStorage.getFileData(type, filename).getData();
		var LZString = require("../realtime/lzstring.js");
		var utils    = require("../utils.js");

		if(data.value === "null") data.value = null;
		else if(data.value === "false" || data.value === false) data.value = false;
		else if(data.value === "true" || data.value === true) data.value = true;
		else if(!isNaN(data.value)) data.value = parseFloat(data.value);
		else{
			try{objectVal=JSON.parse(data.value)}catch(e){objectVal=null}
			if(objectVal != null) data.value = objectVal;
		}
		if(typeof data.value === "string") data.value = LZString.compressToBase64(data.value);

		if(fileData == null || fileData == "") fileData = this.getDefaultFileData(projectStorage.getFileData(type, filename));

		switch(type){
			case "scene":
				var o = JSON.parse(fileData);

				switch(method){
					case "depositobject":
						var objectStr = data.ctype + "@" + LZString.compressToBase64(data.name) + '@false@position={"x":' + data.posx + ',"y":' + data.posy + "}";
						var create    = true;

						for(var objKey in o.objects){
							if(!o.objects.hasOwnProperty(objKey)) continue;
							var object = o.objects[objKey];
							var split  = object.split("@");
							
							if(LZString.decompressFromBase64(split[1]) == data.name){
								create = false;
								break;
							}
						}

						if(create){
							if(o.objects == null){
								fileData = this.getDefaultFileData(projectStorage.getFileData(type, filename));
								o = JSON.parse(fileData);
							}

							o.lastSave = Date.now();
							o.objects.push(objectStr);
						}
					break;
					case "renameobject":
						var newObjects = new Array();

						for(var objKey in o.objects){
							if(!o.objects.hasOwnProperty(objKey)) continue;
							var object = o.objects[objKey];
							var split  = object.split("@");
							
							if(LZString.decompressFromBase64(split[1]) == data.oname){
								object = object.replace(split[1], LZString.compressToBase64(data.newname));
							}

							newObjects.push(object);
						}

						o.lastSave = Date.now();
						o.objects = newObjects;
					break;
					case "removeobject":
						var newObjects = new Array();

						for(var objKey in o.objects){
							if(!o.objects.hasOwnProperty(objKey)) continue;
							var object = o.objects[objKey];
							var split  = object.split("@");

							if(LZString.decompressFromBase64(split[1]) == data.name)
								continue;

							newObjects.push(object);
						}

						o.lastSave = Date.now();
						o.objects = newObjects;
					break;
					case "changeobjectproperty":
						for(var objKey in o.objects){
							if(!o.objects.hasOwnProperty(objKey)) continue;
							var object = o.objects[objKey];
							var split  = object.split("@");

							if(LZString.decompressFromBase64(split[1]) != data.oname)
								continue;

							var search      = (data.behaviorname == undefined) ? data.property : "behaviors";
							var regex       = new RegExp(search + "=(.*?);", "g");
							var match       = object.match(regex);
							var toReplace   = "";
							var endOfString = false;

							// Check if data is at the end of the string
							if(!match){
								match = object.match(new RegExp(search + "=(.*)", "g"));
								endOfString = true;
							}

							if(match){
								match = match[0];
								var s = match.split(/=(.+)/);
								s.splice(-1, 1);

								var key = s[0];
								var cut = (endOfString) ? s[1].length : s[1].length - 1;
								var end = (endOfString) ? "" : ";";
								var val = s[1].substring(0, cut);

								if(data.subproperty){
									val = utils.parseJson(val);
									val[data.subproperty] = data.value;

									val = utils.objectToJson(val);
									toReplace = key + "=" + val + end;
								}else{
									var valueToAdd = data.value;

									if(data.behaviorname != undefined){
										val = utils.parseJson(val);

										if(val[data.behaviorname] == null) val[data.behaviorname] = {};
										val[data.behaviorname][data.property] = data.value;
										valueToAdd = utils.objectToJson(val);
									}

									toReplace = key + "=" + valueToAdd + end;
								}

								o.objects[objKey] = object.replace(match, toReplace);
							}else{
								var key = search;

								if(data.subproperty){
									var newObject = {};
									newObject[data.subproperty] = data.value;

									o.objects[objKey] += ";" + key + "=" + utils.objectToJson(newObject);
								}else{
									var valueToAdd = data.value;

									if(data.behaviorname != undefined){
										var newObject = {};

										newObject[data.behaviorname] = {};
										newObject[data.behaviorname][data.property] = data.value;
										valueToAdd = utils.objectToJson(newObject);
									}

									o.objects[objKey] += ";" + key + "=" + valueToAdd;
								}
							}
						}

						o.lastSave = Date.now();
					break;
					case "removeobjectbehavior":
						for(var objKey in o.objects){
							if(!o.objects.hasOwnProperty(objKey)) continue;
							var object = o.objects[objKey];
							var split  = object.split("@");

							if(LZString.decompressFromBase64(split[1]) != data.oname)
								continue;

							var regex       = new RegExp("behaviors=(.*?);", "g");
							var match       = object.match(regex);
							var toReplace   = "";
							var endOfString = false;

							// Check if data is at the end of the string
							if(!match){
								match = object.match(new RegExp("behaviors=(.*)", "g"));
								endOfString = true;
							}

							if(match){
								match = match[0];
								var s = match.split(/=(.+)/);
								s.splice(-1, 1);

								var key = s[0];
								var cut = (endOfString) ? s[1].length : s[1].length - 1;
								var end = (endOfString) ? "" : ";";
								var val = s[1].substring(0, cut);
								var valueToAdd = val + "";

								val = utils.parseJson(val);

								if(val[data.behaviorname] != null){
									delete val[data.behaviorname];

									if(Object.keys(val).length == 0){
										var first = !object.match(new RegExp(";behaviors=", "g"));
										o.objects[objKey] = object.replace(((first) ? "" : ";") + match, "");
										continue;
									}

									valueToAdd = utils.objectToJson(val);
								}

								toReplace = key + "=" + valueToAdd + end;
								o.objects[objKey] = object.replace(match, toReplace);
							}
						}

						o.lastSave = Date.now();
					break;
				}

				fileData = JSON.stringify(o);
			break;
			case "tilemap":
				var o = JSON.parse(fileData);

				switch(method){
					case "initressource":
						o.ressource = {
							name: data.srcname,
							path: data.srcpath,
							size: {w: parseInt(data.srcsizew), h: parseInt(data.srcsizeh)},
							cellSize: {w: -1, h: -1}
						};
					break;
					case "changeselectionsize":
						var ressourceSize = o.ressource.size;
						o.ressource.cellSize = {w: Math.round(ressourceSize.w / parseInt(data.sizew)), h: Math.round(ressourceSize.h / parseInt(data.sizeh))};
					break;
					case "changemapsize":
						o.size = {w: parseInt(data.sizew), h: parseInt(data.sizeh)};
					break;
					case "changetilesolidity":
						var tiles = o.tiles;

						for(var i in tiles){
							if(!tiles.hasOwnProperty(i)) continue;

							var tile = tiles[i];
							var parts = tile.split("$");

							if(parts[2] != parseInt(data.posx) || 
								parts[3] != parseInt(data.posy) || 
								parts[7] != parseInt(data.layer))
								continue;

							parts[6] = data.value;
							o.tiles[i] = parts.join("$");
						}
					break;
					case "replacetile":
						var tiles = o.tiles;

						for(var i in tiles){
							if(!tiles.hasOwnProperty(i)) continue;

							var tile = tiles[i];
							var parts = tile.split("$");

							if(parts[2] != parseInt(data.posx) || 
								parts[3] != parseInt(data.posy) || 
								parts[7] != parseInt(data.layer))
								continue;

							parts[4] = parseInt(data.texturex);
							parts[5] = parseInt(data.texturey);
							o.tiles[i] = parts.join("$");
						}
					break;
					case "newtile":
						var cellSize   = o.ressource.cellSize;
						var tileString = cellSize.w + "$" + cellSize.h + "$";

						tileString += parseInt(data.posx) + "$" + parseInt(data.posy) + "$";
						tileString += parseInt(data.texturex) + "$" + parseInt(data.texturey) + "$";
						tileString += "false$" + parseInt(data.layer);

						if(o.tiles.indexOf(tileString) == -1)
							o.tiles.push(tileString);
					break;
					case "removetile":
						var tiles    = o.tiles;
						var newTiles = new Array();

						for(var i in tiles){
							if(!tiles.hasOwnProperty(i)) continue;

							var tile = tiles[i];
							var parts = tile.split("$");

							if(parts[2] == parseInt(data.posx) &&
								parts[3] == parseInt(data.posy) && 
								parts[7] == parseInt(data.layer))
								continue;

							newTiles.push(tile);
						}

						o.tiles = newTiles;
					break;
				}

				fileData = JSON.stringify(o);
			break;
			case "sprite":
				var o = JSON.parse(fileData);

				switch(method){
					case "initressource":
						if(o.srcName) o.animations = {};
						delete o.src;delete o.srcName;
						delete o.size;delete o.cellSize;
						delete o.path;

						o.ressource = {
							name: data.srcname,
							path: data.srcpath,
							size: {w: parseInt(data.srcsizew), h: parseInt(data.srcsizeh)},
							cellSize: {w: 1, h: 1}
						};
					break;
					case "addanimation":
						o.animations[data.animname] = {begin: 0, finish: 0, speed: 1};
					break;
					case "removeanimation":
						delete o.animations[data.animname];
					break;
					case "changeanimname":
						var animation = o.animations[data.animname];

						if(animation != null){
							delete o.animations[data.animname];
							o.animations[data.newname] = animation;
						}
					break;
					case "changeanimframebegin":
						var animation = o.animations[data.animname];
						if(animation != null) animation.begin = parseInt(data.frame);
					break;
					case "changeanimframefinish":
						var animation = o.animations[data.animname];
						if(animation != null) animation.finish = parseInt(data.frame);
					break;
					case "changeanimspeed":
						var animation = o.animations[data.animname];
						if(animation != null) animation.speed = parseInt(data.speed);
					break;
					case "imageoptions":
						if(o.ressource != null){
							var ressourceSize = o.ressource.size;
							o.ressource.cellSize = {w: Math.round(ressourceSize.w / parseInt(data.gsw)), h: Math.round(ressourceSize.h / parseInt(data.gsh))}
						}
					break;
				}

				fileData = JSON.stringify(o);
			break;
			case "visualscript":
				var o = JSON.parse(fileData);

				var getModuleById = function(moduleId){
					var mod = null;

					function checkInArray(array){
						if(array == null || array.length == null) return false;
						for(var i = 0; i < array.length; i++){
							var value = array[i];
							if(value.id == moduleId){
								mod = value;
								break;
							}

							checkInArray(value.parts);
							checkInArray(value.childs);
						}
					}
					checkInArray(o);

					return mod;
				};
				var getParentOf = function(moduleId){
					var mod = null;

					function checkInArray(array){
						if(array == null || array.length == null) return false;
						for(var i = 0; i < array.length; i++){
							var value = array[i];
							
							if(value.parts != null){
								for(var j = 0; j < value.parts.length; j++){
									var valuePart = value.parts[j];
									if(valuePart.id == moduleId){
										mod = value;
										break;
									}
								}
							}
							if(value.childs != null){
								for(var k = 0; k < value.childs.length; k++){
									var valueChild = value.childs[k];
									if(valueChild.id == moduleId){
										mod = value;
										break;
									}
								}
							}

							checkInArray(value.parts);
							checkInArray(value.childs);
						}
					}
					checkInArray(o);

					if(mod == null){
						for(var i = 0; i < o.length; i++){
							var modC = o[i];
							if(modC.id == moduleId){
								mod = o;
								break;
							}
						}
					}

					return mod;			
				};
				var getAllPartsChildsOf = function(module){
					function getAllChilds(module){
						var r = new Array();
		
						function addChildsOf(module){
							if(module.childs == null) return false;

							for(var i = 0; i < module.childs.length; i++){
								var child = module.childs[i];
								r.push(child);
								addChildsOf(child);
							}
						}
						addChildsOf(module);

						return r;
					}
					function getAllParts(module){
						var r = new Array();
		
						function addPartsOf(module){
							if(module.parts == null) return false;

							for(var i = 0; i < module.parts.length; i++){
								var part = module.parts[i];
								r.push(part);
								addPartsOf(part);
							}
						}
						addPartsOf(module);

						return r;
					}

					var r      = new Array();
					var childs = getAllChilds(module);

					for(var i = 0; i < childs.length; i++){
						var child = childs[i];
						var parts = getAllParts(child);
						r.push(child);

						for(var j = 0; j < parts.length; j++){
							r.push(parts[j]);
						}
					}
					
					r = r.concat(getAllParts(module));
					return r;
				}
				var deleteModule = function(moduleId){
					var parent = getParentOf(moduleId);
						
					if(parent != null){
						if(parent.isArray()){
							for(var i = 0; i < parent.length; i++){
								var module = parent[i];
								if(module.id == moduleId){
									parent.splice(i, 1);
									break;
								}
							}
						}else{
							if(parent.parts != null){
								for(var i = 0; i < parent.parts.length; i++){
									var module = parent.parts[i];
									if(module.id == moduleId){
										parent.parts.splice(i, 1);
										break;
									}
								}
							}
							if(parent.childs != null){
								for(var i = 0; i < parent.childs.length; i++){
									var module = parent.childs[i];
									if(module.id == moduleId){
										parent.childs.splice(i, 1);
										break;
									}
								}
							}
						}
					}
				}

				switch(method){
					case "createmodule":
						if(!(typeof o === "array") && !(typeof o === "object")) o = new Array();
						o.push({
							id: data.moduleId,
							position: {x: parseFloat(data.x), y: parseFloat(data.y)},
							type: data.moduleType,
							subtype: data.moduleSubtype,
							childs: [],
							parts: []
						});
					break;
					case "movemodule":
						var module = getModuleById(data.moduleId);
						if(module != null) module.position = {x: parseFloat(data.newx), y: parseFloat(data.newy)};
					break;
					case "duplicatemodule":
						var module   = getModuleById(data.moduleId);
						var identity = LZString.decompressFromBase64(data.identity);

						if(module != null) o.push(module.clone());

						// Apply new identity of this module (& sub-modules)
						var parts = identity.split("/");
						module.id = parts[0];
						parts.shift();

						var partIndex = 0, childIndex = 0;
						var cp = getAllPartsChildsOf(module);

						function checkFor(identity, module, prefix, index){
							var parts = identity.split("/");
							parts.shift();

							for(var i = 0; i < parts.length; i++){
								var part = parts[i];
								var key  = part.split(":")[0];
								var id   = part.split(":")[1];

								if(key == prefix + index) module.id = id;
							}
						}

						for(var i = 0; i < cp.length; i++){
							var module = cp[i];
							
							if(module.type == "PART"){
								checkFor(identity, module, "p", partIndex);
								partIndex++;
							}else{
								checkFor(identity, module, "c", childIndex);
								childIndex++;
							}
						}
					break;
					case "updatemoduledata":
						var module = getModuleById(data.moduleId);
						if(module != null){
							if(module.data == null) module.data = {};
							module.data[data.datakey] = LZString.decompress(data.datavalue);
						}
					break;
					case "deletemodule":
						deleteModule(data.moduleId);
					break;

					case "moduleaddpart":
						var module   = getModuleById(data.moduleId).clone();
						var toModule = getModuleById(data.toModuleId);

						deleteModule(data.moduleId);

						if(module != null && toModule != null){
							if(toModule.parts == null) toModule.parts = [];

							module.index = parseInt(data.partIndex);
							toModule.parts.push(module);
						}
					break;
					case "moduleaddchild":
						var module   = getModuleById(data.moduleId).clone();
						var toModule = getModuleById(data.toModuleId);

						deleteModule(data.moduleId);

						if(module != null && toModule != null){
							if(toModule.childs == null) toModule.childs = [];

							toModule.childs.push(module);
						}
					break;
					case "modulermpart":
						var module     = getModuleById(data.moduleId).clone();
						var fromModule = getModuleById(data.toModuleId);

						deleteModule(data.moduleId);

						if(module != null && fromModule != null){
							delete module.index;
							o.push(module);
						}
					break;
					case "modulermchild":
						var module     = getModuleById(data.moduleId).clone();
						var fromModule = getModuleById(data.toModuleId);

						deleteModule(data.moduleId);

						if(module != null && fromModule != null) o.push(module);
					break;
				}


				fileData = JSON.stringify(o);
			break;
			case "script":
				switch(method){
					case "change":
						var currentText = LZString.decompressFromBase64(data.draftText);
						fileData = currentText;
					break;
					case "saveDraft":
						projectStorage.getFileData(type, filename).manualSave();
					break;
				}
			break;
		}


		projectStorage.saveFileData(type, filename, fileData);
	},
	getDefaultFileData: function(fileData){
		var utils = require("../utils.js");

		switch(fileData.getType()){
			case "scene":
				return JSON.stringify({
					objects: [],
					saveVersion: utils.getServerVersion(),
					name: fileData.getFilename()
				});
			break;
			case "tilemap":
				return JSON.stringify({
					size: {w: -1, h: -1},
					tiles: [],
					ressource: null,
					saveVersion: utils.getServerVersion(),
					name: fileData.getFilename()
				});
			break;
			case "sprite":
				return JSON.stringify({
					animations: {},
					ressource: null,
					saveVersion: utils.getServerVersion(),
					name: fileData.getFilename()
				});
			break;
			case "visualscript":
				return "[]";
			break;
			case "script":
				return "// Ecrivez votre script ici.";
			break;
		}

		return "{}";
	},

	renameFileDataCache: function(projectId, type, filename, newName){
		var projectStorage = this.getProjectStorage(projectId);
		if(!projectStorage.fileDataExists(type, filename)) return false;

		var fileData = projectStorage.getFileData(type, filename);
		if(fileData == null) return false;

		fileData.filename = newName;
	},
	removeFileFromCache: function(projectId, type, filename){
		var projectStorage = this.getProjectStorage(projectId);
		if(!projectStorage.fileDataExists(type, filename)) return false;

		var fileData = projectStorage.getFileData(type, filename);
		if(fileData == null) return false;

		projectStorage.filesData.splice(projectStorage.filesData.indexOf(fileData), 1);
	},


	autosave: function(){
		for(var key in this.getProjectsStorage()){
			if(!this.getProjectsStorage().hasOwnProperty(key)) continue;
			var projectStorage = this.getProjectsStorage()[key];

			projectStorage.getFilesData().forEach(function(fileData){
				var diskSavedData = fileData.diskSavedData;

				if(fileData.hasManualSaving() && !fileData.canSave) return false;
				else if(fileData.hasManualSaving() && fileData.canSave) fileData.canSave = false;

				if(diskSavedData == null || diskSavedData != fileData.getData())
					projectStorage.saveFileDataToDisk(fileData);
			});
		}

		setTimeout(this.autosave.bind(this), 1000);
	},

};


function ProjectStorage(projectId){
	this.projectId = projectId;
	this.filesData = new Array();
}

ProjectStorage.prototype = {

	fileDataExists: function(type, filename){
		return (this.getFileData(type, filename) != null);
	},
	getFileData: function(type, filename){
		var r = null;
		this.getFilesData().forEach(function(fileData){
			if(fileData.type == type && fileData.filename == filename)
				r = fileData;
		});

		return r;
	},
	getFileDataFromDisk: function(type, filename, callback){
		function formatFilename(type, filename){
			switch(type){
				case "script"  : return filename + ".js";
				case "scene"   : return "scene_" + filename + ".json";
				case "tilemap" : return "tlm_" + filename + ".json";
				case "sprite"  : return "spr_" + filename + ".json";
				case "visualscript"  : return "vsf_" + filename + ".json";
				case "sound"   : return "snd_" + filename + ".json";
			}
		}

		var self     = this;
		var utils    = require("../utils.js");
		var path     = "../projects/" + utils.leftPad(this.getProjectId(), 4) + ((type == "script") ? "/scripts/" : "/tmp/");
		var diskFile = path + formatFilename(type, filename);
		var fs       = require("fs");

        var readFile = function (diskFile){
            fs.readFile(diskFile, function(err, data) {
                if(err) return utils.log(err, "ERROR");

        		var fileData = self.saveFileData(type, filename, data.toString('utf-8', 0, data.length));
                callback(fileData);
            });
        };

        fs.exists(diskFile, function(res){
            if(!res){
                fs.writeFile(diskFile, '', 'utf-8', function(err){
                    if(err) return utils.log(err, "ERROR");
                    readFile(diskFile);
                });
            }else{
                readFile(diskFile);
            }
        });
	},
	getFilesData: function(){
		return this.filesData;
	},

	getProjectId: function(){
		return this.projectId;
	},

	newFileData: function(type, filename){
		var o = {
			type: type,
			filename: filename,
			data: null,
			diskSavedData: null,

			getData: function(){
				return this.data;
			},
			getType: function(){
				return this.type;
			},
			getFilename: function(){
				return this.filename;
			},

			hasManualSaving(){
				return (this.getType() == "script");
			},
			manualSave: function(){
				this.canSave = true;
			}
		};

		this.filesData.push(o);
		return o;
	},
	saveFileData: function(type, filename, data){
		var fileData = this.getFileData(type, filename) || this.newFileData(type, filename);

		if(fileData.diskSavedData == null)
			fileData.diskSavedData = data + "";

		fileData.data = data;

		return fileData;
	},
	saveFileDataToDisk: function(fileData){
		if(fileData.diskSavedData == null) return false;

		function formatFilename(type, filename){
			switch(type){
				case "script"  : return filename + ".js";
				case "scene"   : return "scene_" + filename + ".json";
				case "tilemap" : return "tlm_" + filename + ".json";
				case "sprite"  : return "spr_" + filename + ".json";
				case "visualscript"  : return "vsf_" + filename + ".json";
				case "sound"   : return "snd_" + filename + ".json";
			}
		}

		var type = fileData.getType(), filename = fileData.getFilename();

		var fs       = require("fs");
		var utils    = require("../utils.js");
		var path     = "../projects/" + utils.leftPad(this.getProjectId(), 4) + ((type == "script") ? "/scripts/" : "/tmp/");
		var diskFile = path + formatFilename(type, filename);

		fs.writeFile(diskFile, fileData.getData(), 'utf-8', function(err){
            if(err) return utils.log(err, "ERROR");
			fileData.diskSavedData = fileData.getData() + "";
        });
	}

};