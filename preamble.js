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
    return _r2(Array.apply(null, new Array(size)).map(Number.prototype.valueOf, value));
}
var _l = _getSaveLine();

// Function for creating references to variables.
// Returns a string of a function to be evaled in the right context
var _r1 = function R1(varName) { 
return "\
new (function() { \
    this.v = \"" + varName + "\"; \
    this.__defineGetter__(\"x\", function() { \
        var val = " + varName + ";\
        return val; \
    }); \
    this.__defineSetter__(\"x\", function(val) { \
        return " + varName + " = val; \
    }); \
    this.eq = function(o) { \
      if (o == 0) { return false; } \
      return o." + varName + " == this." + varName + " && \
        o.i  ;\
    }; \
})()";
};
function _intOrPtr(o) {
  if (typeof o === "number") {
    return o;
  } else {
    return o.i;
  }
}

// Pointer wrapper for arrays and records
var _r2 = function(data) { 
return new (function() {
  this.i = 0;
  this.data = data;
  this.__defineGetter__("x", function() {
    // for records
    if (this.data.hasOwnProperty('_s1')) {
      return this.data._s1(this.i).x;
    } else {
      return this.data[this.i]; 
    }
  });
  this.__defineSetter__("x", function(val) {
    // for records
    if (this.data.hasOwnProperty('_s1')) {
      return this.data._s1(this.i).x = val;
    } else {
      return this.data[this.i] = val;
    }
  });

  this.__defineGetter__("length", function() {
    return this.data.length; 
  });
  // *
  this.mul = function(val) {
    var newr = _r2(data);
    newr.i = this.i * _intOrPtr(val);
    return newr;
  };
  // *
  this.div = function(val) {
    var newr = _r2(data);
    newr.i = this.i / _intOrPtr(val);
    return newr;
  };
  // +/-
  this.p = function(val) {
    var newr = _r2(data);
    newr.i = this.i + _intOrPtr(val);
    return newr;
  };
  this.m = function(val) {
    var newr = _r2(data);
    newr.i = this.i - _intOrPtr(val);
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
  };
  this.lt = function(o) {
    return this.i < _intOrPtr(o);
  };
  this.gt = function(o) {
    return this.i > _intOrPtr(o);
  };
  this.le = function(o) {
    return this.i <= _intOrPtr(o);
  };
  this.ge = function(o) {
    return this.i >= _intOrPtr(o);
  };
  this.eq = function(o) {
    return this.data === o.data && this.i == o.i;
  };
  this.ne = function(o) {
    return this.data !== o.data && this.i != o.i;
  };
  // subscript operation
  this._s1 = function(i) {
    var ar = this;
    // maybe use another _r2 instead?
    return eval(_r1("ar.data[ar.i + i]"));
  };
})();
};

// convert string to array
var _r3 = function(str) {
  var stringArray = _r2(str.split('').map(function(x) { return x.charCodeAt(0) }));
  stringArray.string = true;
  return stringArray;
}

// Null pointer
var _n = new function() {
    this.eq = function(o) {
        return 0 == o; 
    }
    this.ne = function(o) {
      return 0 != o;
    }
};
var C = new function(){
  this.nullArray = function(size) {
    return _r2(Array.apply(null, new Array(size)).map(Number.prototype.valueOf,0));
  }
}();

function derefArray(arg) {
  if (arg !== null && arg !== undefined && typeof(arg) == 'object')  {
    var tp = Object.prototype.toString.call(arg);
    if (arg.hasOwnProperty('data')) {
      if (arg.hasOwnProperty('string')) {
        arg = arg.data.map(function(y) { return String.fromCharCode(y); }).join('');
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
  // console.log appends newline, so strip it
  newargs[0] = newargs[0].replace(/[\n]+$/g, '')
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

// C functions
function time(t) {
  var d = new Date();
  var n = d.getTime() / 1000;
  if (t != 0 || t.ne(0)) {
    t.x = n;
  }
  return n;
}

// Test code
/*
var p = eval(_r("_l"));
console.log(p);
console.log(p.x(2))
console.log(p.x(3))
console.log(p.x(4))
*/
