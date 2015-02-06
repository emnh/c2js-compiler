"use strict";
function _getSaveLine() {
    var lineNumber = 0;
    return function(line) {
        var tmp = lineNumber;
        lineNumber = line;
        return tmp;
    };
}
function _fillArray(size, value) {
    return Array.apply(null, new Array(size)).map(Number.prototype.valueOf, value);
}
var _l = _getSaveLine();

// Returns a string of a function to be evaled in the right context
var _r = function(varName) { 
return "\
new (function() { \
    var i; \
    this.v = \"" + varName + "\"; \
    this.__defineGetter__(\"x\", function() { \
        if (i !== undefined) return " + varName + "[i]; \
        return " + varName + "; \
    }); \
    this.__defineSetter__(\"x\", function(val) { \
        if (i !== undefined) return " + varName + "[i] = val; \
        return " + varName + " = val; \
    }); \
    this.p = function(val) { \
        this.index += val; \
        return this; \
    }; \
    this.eq = function(o) { \
        return o." + varName + " == this." + varName + ";\
    } \
})()";
};

// Test code
/*
var p = eval(_r("_l"));
console.log(p);
console.log(p.x(2))
console.log(p.x(3))
console.log(p.x(4))
*/
