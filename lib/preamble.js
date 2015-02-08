"use strict";
function _getSaveLine() {
    var lineNumber = 0;
    return function(line) {
        var tmp = lineNumber;
        lineNumber = line;
        return tmp;
    };
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
      return this.x === o.x; \
    }; \
    this.ne = function(o) { \
      return !this.eq(o); \
    }; \
    this.isNull = function() { \
      return false; \
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
    //if (this.data.hasOwnProperty('_s1')) {
    //  return this.data._s1(this.i).x;
    //} else {
      return this.data[this.i]; 
    //}
  });
  this.__defineSetter__("x", function(val) {
    // for records
    //if (this.data.hasOwnProperty('_s1')) {
    //  return this.data._s1(this.i).x = val;
    //} else {
      return this.data[this.i] = val;
    //}
  });

  this.__defineGetter__("length", function() {
    return this.data.length; 
  });
  this.mul = function(val) {
    var newr = _r2(data);
    newr.i = this.i * _intOrPtr(val);
    return newr;
  };
  this.div = function(val) {
    var newr = _r2(data);
    newr.i = this.i / _intOrPtr(val);
    return newr;
  };
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
  // member access
  this._m = function() {
    var ar = this;
    return ar.data[ar.i]; //eval(_r1("ar.data[ar.i]."));
  }
  this.isNull = function() {
    return false;
  }
})();
};

// convert string to array
var _r3 = function(str) {
  var stringArray = _r2((str + "\0").split('').map(function(x) { return x.charCodeAt(0) }));
  //stringArray.data.push(0); // Null termination by default
  stringArray.string = true;
  return stringArray;
}

// Null pointer
var _n = new function() {
  this.i = 0;
   this.__defineGetter__("x", function() {
     assert(false, "cannot dereference null pointer");
  });
  this.__defineSetter__("x", function(val) {
     assert(false, "cannot assign to null pointer");
  });

  this.isNull = function() {
    return true;
  }
  this.eq = function(o) {
    if (typeof o === "number") {
      return 0 == o;
    } else {
      return o.isNull(); 
    }
  }
  this.ne = function(o) {
    return 0 != o;
  }
};
var C = new function(){
  /*this.nullArray = function(size) {
    return _r2(Array.apply(null, new Array(size)).map(Number.prototype.valueOf,0));
  }*/
  this.typedArray = function(cls, size) {
    return _r2(Array.apply(null, new Array(size)).map(function() { return new cls(); },0));
  }
  this.fillArray = function(value, size) {
    return _r2(Array.apply(null, new Array(size)).map(function() { return value; }, 0));
  }
  this.fillString = function(value, size) {
    var ret = this.fillArray(value, size);
    ret.string = true;
    return ret;
  }
  this.isPrimitive = function(cls) {
    return (cls == 'int'
        || cls == 'char'
        || cls == 'short'
        || cls == 'long'
        || cls == 'long long'
        || cls == 'float'
        || cls == 'double');
  }
  this.typeCheck = function(cls, value) {
    if (cls == 'ptr') {
      // TODO: check contained type
      return value.hasOwnProperty('isNull');
    } else if (cls == 'function') {
      return true;
    } else if (cls == 'void' || this.isPrimitive(cls)) {
      return true;
    } else {
      return value instanceof eval(cls);
    }
  }
  this.typeCheckCall = function() {
    var fexpr = arguments[0];
    var argClasses = arguments[1];
    var args = Array.apply(null, arguments).slice(2)
    //console.log("fexpr", fexpr, "args", args);
    var ret = eval(fexpr).apply(null, args);
    if (!this.typeCheck(argClasses[0], ret)) {
      console.log("return value", ret);
      throw new Error("invalid return type for " + fexpr + ", expected " + argClasses[0] + ", got " + ret);
    }
    for (var i = 0; i < args.length; i++) {
      var cls = argClasses[i + 1];
      if (!this.typeCheck(cls, args[i])) {
        throw new Error("invalid argument type for " + fexpr + ", expected " + cls + ", got " + args[i]);
      }
    }
    return ret;
  }
}();

function assert(condition, message) {
    if (!condition) {
        message = message || "Assertion failed";
        if (typeof Error !== "undefined") {
            throw new Error(message);
        }
        throw message; // Fallback
    }
}

function derefArray(arg) {
  if (arg !== null && arg !== undefined && typeof(arg) == 'object')  {
    var tp = Object.prototype.toString.call(arg);
    if (arg.hasOwnProperty('data')) {
      if (arg.hasOwnProperty('string')) {
        arg = arg.data.map(function(y) { return String.fromCharCode(y); }).join('');
        arg = arg.replace(/\0$/, '');
      } else {
        arg = arg.data;
      }
    }
  }
  return arg;
}

// console.log will print too many newlines, but there is no better alternative
// unless on nodejs
function _log() {
  // nodejs
  if (process !== undefined) {
    for (var i in arguments) {
      process.stdout.write(arguments[i]);
    }
  } else {
    console.log(arguments);
  }
}

function _printf(format) {
  var newargs = [];
  for (var i = 0; i < arguments.length; i++) {
    var arg = derefArray(arguments[i]);
    newargs.push(arg);
  }
  // console.log appends newline, so strip it
  // newargs[0] = newargs[0].replace(/[\n]+$/g, '')
  _log(exports.sprintf.apply(null, newargs));
}

function _puts(str) {
  var newargs = [];
  for (var i = 0; i < arguments.length; i++) {
    var arg = derefArray(arguments[i]);
    newargs.push(arg);
  }
  newargs.push('\n');
  _log.apply(null, newargs);
}

// C functions
function time(t) {
  var d = new Date();
  var n = d.getTime() / 1000;
  if (t.ne(0)) {
    t.x = n;
  }
  return n;
}

// Varargs
function __va_list_tag() {
  this.index = 0;
  //this.length = 0;
  this.arguments = [];
  this.getNextArg = function() {
    /*if (this.index >= this.length) {
      return 0;
    }*/
    var arg = this.arguments[this.index];
    this.index += 1;
    return arg;
  }
}
function __va_list_start(args, ap, length) {
  ap.arguments = args;
  ap.length = length;
}
function __va_list_end(ap) {
}

// Test code
/*
var p = eval(_r("_l"));
console.log(p);
console.log(p.x(2))
console.log(p.x(3))
console.log(p.x(4))
*/
