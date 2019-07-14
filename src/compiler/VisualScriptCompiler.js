var fs = require("fs");

module.exports = function(path){
	return new VisualScriptCompiler(path);
}
RegExp.quote = function(str) {
	return str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
};


function VisualScriptCompiler(path){
	this.path  = path;
	this.final = "";

	this.onFinishEvent = null;
}

VisualScriptCompiler.prototype = {

	run: function(){
		var that = this;

		this.getFiles(function(files){
			var strF = "";

			for(var i = 0; i < files.length; i++){
				var file = files[i];
				strF += that.compile(file);
			}

			that.final = strF;
			that.onFinishEvent(that.final);
		});
	},
	compile: function(file){
		var ctn              = fs.readFileSync(this.path + "tmp/" + file, "utf-8");
		var generatedNumbers = [];
		var r                = "";

		function generateRandomNumber(precision){
		    if (precision <= 20) {
		        var randomNum = Math.round(Math.random().toFixed(precision) * Math.pow(10, precision));
		        if (generatedNumbers.indexOf(randomNum) > -1) {
		            if (generatedNumbers.length == Math.pow(10, precision))
		                return "Generated all values with this precision";
		                return generateRandomNumber(precision);
		        } else {
		            generatedNumbers.push(randomNum);
		            return randomNum;
		        }
		    } else
		       return "Number Precision shoould not exceed 20";
		}
		
		var compileModule = function(module, parentModule){
			delete module.position;
			var type    = module.type,
				subtype = module.subtype;

			var textChilds = "";
			var textParts  = "";

			var to = visualTextMap[type][subtype];
			if(to == null) to = "";

			if(module.childs != null){
				if(to.indexOf("[childs]") > -1)
					for(var i = 0; i < module.childs.length; i++)
						textChilds += compileModule(module.childs[i], module);

				for(var i = 0; i < module.childs.length; i++)
					to = to.replace(new RegExp(RegExp.quote("[child" + i + "]"), "g"), compileModule(module.childs[i], module));
			}
			if(module.parts != null){
				if(to.indexOf("[parts]") > -1)
					for(var i = 0; i < module.parts.length; i++)
						textParts += compileModule(module.parts[i], module);
				
				for(var i = 0; i < module.parts.length; i++)
					to = to.replace(new RegExp(RegExp.quote("[part" + i + "]"), "g"), compileModule(module.parts[i], module));
			}

			to = to.replace(/\[parts\]/g, textParts);
			to = to.replace(/\[childs\]/g, textChilds);

			if(to.indexOf("[random]") > -1){
				var rn = generateRandomNumber(10);
				to = to.replace(/\[random\]/g, rn);
			}

			if(parentModule != null){
				if(parentModule.blocked) return "";
			}

			if(to.indexOf("[after]") > -1 && parentModule != null){
				var index     = parentModule.childs.indexOf(module) + 1;
				var afterText = "";

				for(var i = index; i <= parentModule.childs.length - index; i++){
					var afterModule = parentModule.childs[i];
					
					afterText += compileModule(afterModule);
				}

				parentModule.blocked = true;
				to = to.replace("[after]", afterText);
				return to;
			}

			// Replace with data
			var dataRegex = to.match(/\[data\:(.*?)\]/gi);
			if(dataRegex){
				for(var i = 0; i < dataRegex.length; i++){
					var dr  = dataRegex[i];
					var key = dr.substring(0, dr.length - 1).split(":")[1];

					if(key == "key") module.data[key] = keyCodeMap[parseInt(module.data[key])];
					if(module.data == null || module.data[key] == null){
						module.data = {};
						module.data[key] = "";
					}

					to = to.replace(dr, module.data[key]);
				}
			}

			return to;
		}

		var jo = JSON.parse(ctn);
		for(var i = 0; i < jo.length; i++)
			r += compileModule(jo[i]);

		return r;
	},

	getFiles: function(callback){
		var that = this;

		fs.readdir(this.getPath() + "tmp/", function(err, files){
			var validFiles = [];

			if(files == undefined){
				that.onFinishEvent(null);
				return false;
			}

			for(var i = 0; i < files.length; i++){
				var file = files[i];
				if(file.indexOf("vsf_") == -1) continue ;
				validFiles.push(file);
			}

			callback(validFiles, validFiles[0], 0);
		});
	},
	getPath: function(){
		return this.path;
	},

	onFinish: function(callback){
		this.onFinishEvent = callback;
	}

};

var visualTextMap = {
	EVENT: {
		"START"    : "Game.getEventsManager().on('loaded',function(){[childs]});",
		"UPDATE"   : "Game.getEventsManager().on('gameUpdated',function(){[childs]});",
		"INTERVAL" : "Game.getEventsManager().on('loaded',function(){setInterval(function(){[childs]}, [parts] * 1000);});",
		"KEY_DOWN" : "Input.keyDown('[parts]', function(){[childs]}, true);",
		"CLICK"    : "Input.click('[parts]', function(){[childs]}, true);",

		"REPEAT"   			  : "for(var i=0;i<[parts];i++){[childs]}",
		"REPEAT_INDEFINITELY" : "setInterval(function(){[childs]}, 60);",
		"REPEAT_UNTIL"        : "window['iv'+[random]]=setInterval(function(){if([parts]){clearInterval(window['iv'+[random]]);return false;}[childs]}, 60);",

		"OBJECTS_COLLIDE"    : "Game.getEventsManager().on('loaded',function(){Game.getCurrentScene()[part0].physicEngine.onCollides(function(go,collidesWith){if(collidesWith.getID()==Game.getCurrentScene()[part1].getID()){[childs]}})});"
	},

	LOGIC: {
		"IF" : "if([parts]){[childs]}",
		"ELSEIF" : "else if([parts]){[childs]}",
		"ELSE" : "else{[childs]}",
		"WHILE" : "while([parts]){[childs}"
	},

	ACTION: {
		"CREATE_GAMEOBJECT"         : "Game.getCurrentScene().registerGameObject([part0],new GameObject([part1]));",
		"MOVE_GAMEOBJECT"           : "Game.getCurrentScene()[part0].setPosition([part1]);",
		"MOVE_GAMEOBJECT_LERP"      : "Game.getCurrentScene()[part0].getPosition().lerpTo(new Position([part1]), [part2]);",
		"MOVE_GAMEOBJECT_ADD"       : "Game.getCurrentScene()[part0].getPosition().add(new Position([part1]));",
		"ROTATE_GAMEOBJECT"         : "Game.getCurrentScene()[part0].rotate([part1]);",
		"CHANGE_GAMEOBJECT_SIZE"    : "Game.getCurrentScene()[part0].setSize([part1]);",
		"CHANGE_GAMEOBJECT_LAYER"   : "Game.getCurrentScene()[part0].setLayer([part1]);",
		"CHANGE_GAMEOBJECT_OPACITY" : "Game.getCurrentScene()[part0].setOpacity([part1]);",
		"CHANGE_GAMEOBJECT_ANIM"    : "Game.getCurrentScene()[part0].setAnimation([part1]);",
		"CHANGE_GAMEOBJECT_TEXTURE" : "Game.getCurrentScene()[part0].getRenderer().name=[part1];",
		"CHANGE_GAMEOBJECT_COLOR"   : "if(Game.getCurrentScene()[part0] != null && Game.getCurrentScene()[part0].getRenderer().color != null){Game.getCurrentScene()[part0].getRenderer().color = [part1];}",
		"CHANGE_SCENE"              : "Game.setCurrentScene([part0]);",

		"REMOVE_GAMEOBJECT" : "Game.getCurrentScene().removeGameObject(Game.getCurrentScene()[part0]);",

		"ALERT" : "alert([part0]);",
		"LOG" : "console.log([part0]);",
		"APPLY_VALUE_VARIABLE" : "[part1]=[part0];",
		"WAIT" : "setTimeout(function(){[after]}, [parts] * 1000);"
	},

	PART: {
		"KEY"        : "[data:key]",
		"MOUSE"      : "[data:select-0]",
		"SCENE"      : "Game.getScene('[data:select-0]')",
		"POSITION"   : "[data:input-0], [data:input-1]",
		"SIZE"       : "[data:input-0], [data:input-1]",
		"GAMEOBJECT" : ".getGameObject('[data:input-0]')",
		"ANIMATION"  : "'[data:input-0]'",
		"COLOR"      : "'[data:input-0]'",
		"TEXTURE"    : "'[data:select-0]'",

		"INTEGER"  : "[data:input-0]",
		"STRING"   : "'[data:input-0]'",
		"VARIABLE" : "window.[data:input-0]",

		"COND_EQUAL"           : "[part0] == [part1]",
		"COND_NOT_EQUAL"       : "[part0] != [part1]",
		"COND_CURRENT_SCENE"   : "Game.getCurrentScene() == [parts]",
		"COND_MOUSE_POSITION"  : "Input.getLastCursorPosition() == new Position([parts])",
		"COND_MOUSE_ON_OBJECT" : "Game.getCurrentScene()[parts] != null && Game.getCurrentScene()[parts].getBordersRectangle().inside(Input.getLastCursorPosition())",
		"COND_OBJECT_ANIM_IS"  : "Game.getCurrentScene()[part0] != null && Game.getCurrentScene()[part0].animation.name == [part1]",

		"MATHS_ADDITION" 	   : "([part0]+[part1])",
		"MATHS_SUBTRACTION"    : "([part0]-[part1])",
		"MATHS_MULTIPLICATION" : "([part0]*[part1])",
		"MATHS_DIVISION" 	   : "([part0]/[part1])",

		"MATHS_SQUARE" 		: "[part0]*[part0]",
		"MATHS_SQUARE_ROOT" : "Math.sqrt([part0])",
		"MATHS_RANDOM"      : "Math.floor(Math.random()*([part1]-[part0]+1)+[part0])",
	}
};
var keyCodeMap = {
    8:"backspace", 9:"tab", 13:"return", 16:"shift", 17:"ctrl", 18:"alt", 19:"pausebreak", 20:"capslock", 27:"escape", 32:"space", 33:"pageup",
    34:"pagedown", 35:"end", 36:"home", 37:"left", 38:"up", 39:"right", 40:"down", 43:"+", 44:"printscreen", 45:"insert", 46:"delete",
    48:"0", 49:"1", 50:"2", 51:"3", 52:"4", 53:"5", 54:"6", 55:"7", 56:"8", 57:"9", 59:";",
    61:"=", 65:"a", 66:"b", 67:"c", 68:"d", 69:"e", 70:"f", 71:"g", 72:"h", 73:"i", 74:"j", 75:"k", 76:"l",
    77:"m", 78:"n", 79:"o", 80:"p", 81:"q", 82:"r", 83:"s", 84:"t", 85:"u", 86:"v", 87:"w", 88:"x", 89:"y", 90:"z",
    96:"0", 97:"1", 98:"2", 99:"3", 100:"4", 101:"5", 102:"6", 103:"7", 104:"8", 105:"9",
    106: "*", 107:"+", 109:"-", 110:".", 111: "/",
    112:"f1", 113:"f2", 114:"f3", 115:"f4", 116:"f5", 117:"f6", 118:"f7", 119:"f8", 120:"f9", 121:"f10", 122:"f11", 123:"f12",
    144:"numlock", 145:"scrolllock", 186:";", 187:"=", 188:",", 189:"-", 190:".", 191:"/", 192:"`", 219:"[", 220:"\\", 221:"]", 222:"'"
};