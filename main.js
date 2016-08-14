define(function (require, exports, module) {
	'use strict';

	var LanguageManager = brackets.getModule("language/LanguageManager");

	CodeMirror.defineMode("glsl", function (config, parserConfig) {
		var indentUnit = config.indentUnit,
			keywords = parserConfig.keywords || {},
			builtins = parserConfig.builtins || {},
			blockKeywords = parserConfig.blockKeywords || {},
			atoms = parserConfig.atoms || {},
			hooks = parserConfig.hooks || {},
			multiLineStrings = parserConfig.multiLineStrings;
		var isOperatorChar = /[+\-*&%=<>!?|\/]/;

		var curPunc;

		function tokenBase(stream, state) {
			var ch = stream.next();
			if (hooks[ch]) {
				var result = hooks[ch](stream, state);
				if (result !== false) return result;
			}
			if (ch == '"' || ch == "'") {
				state.tokenize = tokenString(ch);
				return state.tokenize(stream, state);
			}
			if (/[\[\]{}\(\),;\:\.]/.test(ch)) {
				curPunc = ch;
				return "bracket";
			}
			if (/\d/.test(ch)) {
				stream.eatWhile(/[\w\.]/);
				return "number";
			}
			if (ch == "/") {
				if (stream.eat("*")) {
					state.tokenize = tokenComment;
					return tokenComment(stream, state);
				}
				if (stream.eat("/")) {
					stream.skipToEnd();
					return "comment";
				}
			}
			if (isOperatorChar.test(ch)) {
				stream.eatWhile(isOperatorChar);
				return "operator";
			}
			stream.eatWhile(/[\w\$_]/);
			var cur = stream.current();
			if (keywords.propertyIsEnumerable(cur)) {
				if (blockKeywords.propertyIsEnumerable(cur)) curPunc = "newstatement";
				return "keyword";
			}
			if (builtins.propertyIsEnumerable(cur)) {
				return "builtin";
			}
			if (atoms.propertyIsEnumerable(cur)) return "atom";
			return "word";
		}

		function tokenString(quote) {
			return function (stream, state) {
				var escaped = false,
					next, end = false;
				while ((next = stream.next()) != null) {
					if (next == quote && !escaped) {
						end = true;
						break;
					}
					escaped = !escaped && next == "\\";
				}
				if (end || !(escaped || multiLineStrings))
					state.tokenize = tokenBase;
				return "string";
			};
		}

		function tokenComment(stream, state) {
			var maybeEnd = false,
				ch;
			while (ch = stream.next()) {
				if (ch == "/" && maybeEnd) {
					state.tokenize = tokenBase;
					break;
				}
				maybeEnd = (ch == "*");
			}
			return "comment";
		}

		function Context(indented, column, type, align, prev) {
			this.indented = indented;
			this.column = column;
			this.type = type;
			this.align = align;
			this.prev = prev;
		}

		function pushContext(state, col, type) {
			return state.context = new Context(state.indented, col, type, null, state.context);
		}

		function popContext(state) {
			var t = state.context.type;
			if (t == ")" || t == "]" || t == "}")
				state.indented = state.context.indented;
			return state.context = state.context.prev;
		}

		// Interface

		return {
			startState: function (basecolumn) {
				return {
					tokenize: null,
					context: new Context((basecolumn || 0) - indentUnit, 0, "top", false),
					indented: 0,
					startOfLine: true
				};
			},

			token: function (stream, state) {
				var ctx = state.context;
				if (stream.sol()) {
					if (ctx.align == null) ctx.align = false;
					state.indented = stream.indentation();
					state.startOfLine = true;
				}
				if (stream.eatSpace()) return null;
				curPunc = null;
				var style = (state.tokenize || tokenBase)(stream, state);
				if (style == "comment" || style == "meta") return style;
				if (ctx.align == null) ctx.align = true;

				if ((curPunc == ";" || curPunc == ":") && ctx.type == "statement") popContext(state);
				else if (curPunc == "{") pushContext(state, stream.column(), "}");
				else if (curPunc == "[") pushContext(state, stream.column(), "]");
				else if (curPunc == "(") pushContext(state, stream.column(), ")");
				else if (curPunc == "}") {
					while (ctx.type == "statement") ctx = popContext(state);
					if (ctx.type == "}") ctx = popContext(state);
					while (ctx.type == "statement") ctx = popContext(state);
				} else if (curPunc == ctx.type) popContext(state);
				else if (ctx.type == "}" || ctx.type == "top" || (ctx.type == "statement" && curPunc == "newstatement"))
					pushContext(state, stream.column(), "statement");
				state.startOfLine = false;
				return style;
			},

			indent: function (state, textAfter) {
				if (state.tokenize != tokenBase && state.tokenize != null) return 0;
				var firstChar = textAfter && textAfter.charAt(0),
					ctx = state.context,
					closing = firstChar == ctx.type;
				if (ctx.type == "statement") return ctx.indented + (firstChar == "{" ? 0 : indentUnit);
				else if (ctx.align) return ctx.column + (closing ? 0 : 1);
				else return ctx.indented + (closing ? 0 : indentUnit);
			},

			electricChars: "{}"
		};
	});

	function words(str) {
		var obj = {},
			words = str.split(" ");
		for (var i = 0; i < words.length; ++i) obj[words[i]] = true;
		return obj;
	}

	function cppHook(stream, state) {
		if (!state.startOfLine) return false;
		stream.skipToEnd();
		return "meta";
	}

	var _keywords = "attribute const uniform varying break continue " +
		"void bool int uint float double struct " +
		"vec2 vec3 vec4 dvec2 dvec3 dvec4 bvec2 bvec3 bvec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 " +
		"mat2 mat3 mat4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 " +
		"dmat2 dmat3 dmat4 dmat2x2 dmat2x3 dmat2x4 dmat3x2 dmat3x3 dmat3x4 dmat4x2 dmat4x3 dmat4x4 " +
		"sampler1D sampler2D sampler3D samplerCube sampler2DRect sampler1DShadow sampler2DRectShadow " +
		"sampler1DArray sampler2DArray sampler1DArrayShadow sampler2DArrayShadow samplerBuffer sampler2DMS sampler2DMSArray " +
		"samplerCubeShadow samplerCubeArray samplerCubeArrayShadow " +
		"isampler1D isampler2D isampler3D isamplerCube isampler2DRect " +
		"isampler1DArray  isampler2DArray isamplerBuffer isampler2DMS isampler2DMSArray isamplerCubeArray " +
		"usampler1D usampler2D usampler3D usamplerCube usampler2DRect " +
		"usampler1DArray  usampler2DArray usamplerBuffer usampler2DMS usampler2DMSArray usamplerCubeArray " +
		"do for while if else in out inout true false " +
		"lowp mediump highp precision invariant discard return " +
		"gl_FragCoord gl_FrontFacing gl_ClipDistance gl_PointCoord gl_PrimitiveID gl_SampleID gl_SamplePosition gl_FragColor gl_FragData gl_FragDepth gl_SampleMask";

	var _builtins = "radians degrees sin cos tan asin acos atan pow " +
		"exp log exp2 log2 sqrt inversesqrt abs sign floor ceil fract mod " +
		"min max clamp mix step smoothstep length distance dot cross " +
		"normalize faceforward reflect refract matrixCompMult lessThan " +
		"lessThanEqual greaterThan greaterThanEqual equal notEqual any all " +
		"not dFdx dFdy fwidth texture2D texture2DProj texture2DLod " +
		"texture2DProjLod textureCube textureCubeLod";

	CodeMirror.defineMIME("text/x-glsl", {
		name: "glsl",
		keywords: words(_keywords),
		builtins: words(_builtins),
		blockKeywords: words("case do else for if switch while struct"),
		atoms: words("null"),
		hooks: {
			"#": cppHook
		}
	});

	LanguageManager.defineLanguage("glsl", {
		name: "GLSL",
		mode: ["glsl", "text/x-glsl"],
		fileExtensions: ["glsl"],
		blockComment: ["/*", "*/"],
		lineComment: ["//", "//"]
	});
});
