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

// Function for creating references to variables.
// Returns a string of a function to be evaled in the right context
var _r1 = function R1(varName) { 
return "\
new (function() { \
    this.i = undefined; \
    this.v = \"" + varName + "\"; \
    this.__defineGetter__(\"x\", function() { \
        var val = " + varName + ";\
        if (this.i !== undefined) return val[this.i]; \
        return val; \
    }); \
    this.__defineSetter__(\"x\", function(val) { \
        if (this.i !== undefined) return val[this.i] = val; \
        return " + varName + " = val; \
    }); \
    this.p = function(val) { \
        this.i += val; \
        return this; \
    }; \
    this.eq = function(o) { \
      if (o == 0) { return false; } \
      return o." + varName + " == this." + varName + " && \
        o.i  ;\
    }; \
})()";
};
var _r2 = function(data) { 
return new (function() {
  this.i = 0;
  this.data = data;
  this.__defineGetter__("x", function() {
    return this.data[this.i]; 
  });
  this.__defineSetter__("x", function(val) {
    return this.data[this.i] = val;
  });
  // +/-
  this.p = function(val) {
    var newr = _r2(data);
    newr.i = this.i + val;
    return newr;
  };
  // prefix ++
  this.pp = function(val) {
    this.i += val;
    return this;
  };
  // postfix ++
  this.pa = function(val) {
    var newr = _r2(data);
    this.i += val;
    return newr;
  };
  this.neg = function() {
    var newr = _r2(data);
    newr.i = -this.i;
    return newr;
  }
  this.eq = function(o) {
    return this.data === o.data;
  }
  // subscript operation
  this.s = function(i) {
    return this.data[this.i + i]; 
  }
})();
};

// convert string to array
var _r3 = function(str) {
  var stringArray = _r2(str.split(''));
  stringArray.string = true;
  return stringArray;
}

// Null pointer
var _n = new function() {
    this.eq = function(o) {
        return 0 == o; 
    }
};

function derefArray(arg) {
  if (arg !== null && arg !== undefined && typeof(arg) == 'object')  {
    var tp = Object.prototype.toString.call(arg);
    if (arg.hasOwnProperty('data')) {
      if (arg.hasOwnProperty('string')) {
        arg = arg.data.join('');
      } else {
        arg = arg.data;
      }
    }
  }
  return arg;
}

function _printf(format) {
  var newargs = [];
  for (var i = 0; i < arguments.length; i++) {
    var arg = derefArray(arguments[i]);
    newargs.push(arg);
  }
  console.log(exports.sprintf.apply(null, newargs));
}

function _puts(str) {
  var newargs = [];
  for (var i = 0; i < arguments.length; i++) {
    var arg = derefArray(arguments[i]);
    newargs.push(arg);
  }
  console.log.apply(null, newargs);
}

// Test code
/*
var p = eval(_r("_l"));
console.log(p);
console.log(p.x(2))
console.log(p.x(3))
console.log(p.x(4))
*/
