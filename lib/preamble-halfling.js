"use strict;"

if (window === undefined) {
  require("6to5/polyfill");
}

// Use 1000 as increment for object ids so that when the object id is
// considered a pointer, the objects don't "overlap in memory".
var __next_objid = 1000;
var objects = {};
function programObjectId(obj) {
    if (obj == null) return null;
    if (obj.__obj_id == null) {
      obj.__obj_id = __next_objid;
      // unassignable property, must be a primitive object, add it by value
      if (obj.__obj_id != __next_objid) {
        objects[obj] = __next_objid;
        __next_objid += 1000;
        return objects[obj];
      }
      __next_objid += 1000;
    }
    return obj.__obj_id;
}

var __general_next_objid = 1000;
var objects = {};
function objectId(obj) {
    if (obj == null) return null;
    if (obj.__general_obj_id == null) {
      obj.__general_obj_id = __general_next_objid;
      __general_next_objid += 1000;
    }
    return obj.__general_obj_id;
}


//Q.longStackSupport = true;

if (typeof String.prototype.startsWith != 'function') {
  // see below for better implementation!
  String.prototype.startsWith = function (str){
    return this.indexOf(str) == 0;
  };
}

String.prototype.endsWith = function(suffix) {
  return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

function zip(arrays) {
    return arrays[0].map(function(_,i){
        return arrays.map(function(array){return array[i]})
    });
}

function mdump(s) {
  return JSON.stringify(mori.toJs(s));
}
function isFunction(functionToCheck) {
  var getType = {};
  return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
}

var switchOperator = function(operator) {
  var set = false;
  var compare = false;
  var fun;
  switch (operator) {
    case '*=':
      set = true;
    case '*':
      fun = (x, y) => x * y;
      break;

    case '/=':
      set = true;
    case '/':
      fun = (x, y) => x / y;
      break;

    case '+=':
      set = true;
    case '+':
      fun = (x, y) => x + y;
      break;

    case '-=':
      set = true;
    case '-':
      fun = (x, y) => x - y;
      break;

    case '==':
      fun = (x, y) => x === y;
      compare = true;
      break;

    case '!=':
      fun = (x, y) => x !== y;
      compare = true;
      break;

    case '>':
      fun = (x, y) => x > y;
      compare = true;
      break;

    case '<':
      fun = (x, y) => x < y;
      compare = true;
      break;

    case '>=':
      fun = (x, y) => x >= y;
      compare = true;
      break;

    case '<=':
      fun = (x, y) => x <= y;
      compare = true;
      break;

    case ',':
      fun = (x, y) => y;
      break;
      
    default:
        throw new Error("uknown operator " + operator);
        break;
  }
  return [set, compare, fun];
}

var ASTNode = function(kind, args) {
  var a = this;
  this.kind = kind;
  this.debugInfo = args[0];
  this.info = args[1];
  this.children = args[2];
  if (this.args == {}) {
    throw new Error("remember to pass arguments as second argument to ASTNode: " + kind);
  }
  if (this.children === undefined) {
    throw new Error("children undefined: " + kind);
  }
  this.define = function*() { };
  this.execute = function*(state) { 
    var children = a.children;
    var lastResult;
    for (var child of children) {
      [state, lastResult] = yield [state, child];
    }
    if (children.length > 0) {
      yield [state, new Value(lastResult)];
    }
  };
  this.copy = function() {
    var a = new ASTNode();
    this.debugInfo = a.debugInfo;
    this.info = a.info;
    this.children = a.children;
  }
  this.caption = function() {
    return this.kind;
  }
};
// TODO: Rename to RValue
var Value = function(value) {
  this.value = value;
  this.kind = "value";
  this.caption = () => this.kind;
};
// TODO: save scope as well, because otherwise we can lookup this LValue in
// another scope
var LValue = function(varName) {
  this.get = function(state) {
    return state.getVar(varName);
  };
  this.set = function(state, val) {
    return [state.setVar(varName, val), val];
  };
}
var PointerLValue = function(ptr) {
  this.get = function(state) {
    return ptr.get(state);
  }
  this.set = function(state, val) {
    // TODO: mori.vector, state change
    [state, val] = ptr.set(state, val);
    return [state, val];
  }
}
PointerLValue.prototype = Object.create(LValue.prototype);

var Pointer = function() {
}
var FixedPointer = function(lvalue) {
  var P = this;
  P.lvalue = lvalue;
  P.get = function(state) {
    return P.lvalue.get(state);
  }
  P.set = function(state, val) {
    return P.lvalue.set(state, val);
  }
  P.copy = function() {
    var newP = new Pointer(P.lvalue);
    newP.index = P.index;
    return newP;
  }
}
var IndexedPointer = function() {
}
var ArrayPointer = function(array) {
  var P = this;
  P.objID = programObjectId(array);
  P.index = P.objID;
  P.array = array;
  //P.lvalue = lvalue;
  P.get = function(state) {
    return P.array[P.index - P.objID];
  }
  P.set = function(state, val) {
    P.array[P.index - P.objID] = val;
    return [state, val];
  }
  P.geti = function(state, i) {
    return P.array[P.index - P.objID + i];
  }
  P.seti = function(state, i, val) {
    P.array[P.index - P.objID + i] = val;
    return [state, val];
  }
  P.copy = function() {
    var newP = new ArrayPointer(P.array);
    newP.index = P.index;
    newP.objID = P.objID;
    return newP;
  }
}
var RecordPointer = function(lvalue, rec) {
  var P = this;
  P.objID = programObjectId(rec);
  P.index = P.objID;
  P.lvalue = lvalue;
  P.get = function(state) {
    return P.geti(state, 0);
  }
  P.set = function(state, val) {
    return P.seti(state, 0, val);
  }
  P.geti = function(state, i) {
    var fieldIndex = P.index - P.objID + i;
    var record = P.lvalue.get(state);
    var fieldName = record.recNode.indexToFieldMap[fieldIndex][0];
    return record.getField(state, fieldName);
  }
  P.seti = function(state, i, val) {
    var fieldIndex = P.index - P.objID + i;
    var record = P.lvalue.get(state);
    var fieldName = record.recNode.indexToFieldMap[fieldIndex][0];
    var [state, newRecord] = record.setField(state, fieldName, val);
    var [state, newRecord] = lvalue.set(state, newRecord);
    return [state, val];
  }
  P.copy = function() {
    var newP = new RecordPointer(P.lvalue, P.record);
    // same objID
    newP.objID = P.objID;
    newP.index = P.index;
    return newP;
  }
}
var StringPointer = function(str) {
  var P = this;
  P.objID = programObjectId(str);
  P.index = P.objID; // so that pointer comparison works
  P.str = str;
  //P.lvalue = lvalue;
  P.toJs = function() {
    return P.str.slice(P.index - P.objID);
  }
  P.geti = function(state, i) {
    return P.str.charAt(P.index - P.objID + i);
  }
  P.seti = function(state, i, val) {
    P.str[P.index - P.objID + i] = String.fromCharCode(val);
    return [state, val];
  }
  P.copy = function() {
    var newP = new StringPointer(P.str);
    newP.index = P.index;
    newP.objID = P.objID;
    return newP;
  }
}
var NullPointer = function() { 
  var N = this;
  N.objID = 0;
  N.index = 0;
}
FixedPointer.prototype = Object.create(Pointer.prototype)
IndexedPointer.prototype = Object.create(Pointer.prototype)
RecordPointer.prototype = Object.create(IndexedPointer.prototype)
ArrayPointer.prototype = Object.create(IndexedPointer.prototype)
StringPointer.prototype = Object.create(IndexedPointer.prototype)
NullPointer.prototype = Object.create(Pointer.prototype)

var Record = function(recNode) {
  var R = this;
  this.objID = programObjectId(R);
  this.hashMap = new mori.hashMap();
  this.recNode = recNode;
  this.hasField = function(state, field) {
    return mori.hasKey(R.hashMap, field);
  }
  this.getField = function(state, field) {
    return mori.get(R.hashMap, field);
  }
  this.setField = function(state, field, val) {
    var resultMap = mori.assoc(R.hashMap, field, val);
    var result = R.copy();
    result.hashMap = resultMap;
    return [state, result];
  }
  this.copy = function() {
    var r = new Record(R.recNode);
    r.hashMap = R.hashMap;
    r.recNode = R.recNode;
    // Important, record copies have same object ID
    // because we expect pointers to compare as same.
    r.objID = R.objID;
    return r;
  }
}

function Interpreter() {
  var I = this;
  I.JSExports = {
    printf: _printf,
    puts: _puts,
    //'C.create': C.create,
    //'C.nullPointer': C.nullPointer,
    //'C.typedArray': C.typedArray,
    //'C.fillArray': C.fillArray,
    //'C.fillString': C.fillString,
    //'C.typeCheckCall': C.typeCheckCall,
    //'_r1': _r1,
    //'_r2': _r2,
    //'_r3': _r3
  }
  I.State = function() {
    S = this;
    S.data = mori.hashMap(
      "scopes", mori.vector(mori.hashMap()),
      "labels", mori.hashMap(),
      "funStack", mori.vector()
      );
    S.wrap = function(data) {
      var s = new I.State();
      s.data = data;
      return s;
    };
    S.pushFun = function(defn) {
      return S.wrap(mori.updateIn(S.data, ["funStack"], x => mori.conj(x, defn)));
    };
    S.popFun = function() {
      var defn = mori.get(S.data, ["funStack"]);
      defn = mori.pop(defn);
      var data = mori.assoc(S.data, "funStack", defn);
      return [S.wrap(data), defn];
    };
    S.beginScope = function() {
      var scopes = mori.get(S.data, "scopes");
      scopes = mori.conj(scopes, mori.hashMap());
      var data = mori.assoc(S.data, "scopes", scopes);
      return S.wrap(data);
    };
    S.endScope = function() {
      var scopes = mori.get(S.data, "scopes");
      scopes = mori.pop(scopes);
      var data = mori.assoc(S.data, "scopes", scopes);
      return S.wrap(data);
    };
    S.findVar = function(varName) {
      var scopes = mori.get(S.data, "scopes");
      var i = mori.count(scopes);
      while (!mori.isEmpty(scopes)) {
        i--;
        var vars = mori.peek(scopes);
        scopes = mori.pop(scopes);
        if (mori.hasKey(vars, varName)) return i;
      }
      return null;
    };
    S.newVar = function(varName, value) {
      var scopes = mori.get(S.data, "scopes");
      var vars = mori.peek(scopes);
      vars = mori.assoc(vars, varName, value);
      scopes = mori.pop(scopes);
      scopes = mori.conj(scopes, vars);
      return S.wrap(mori.assoc(S.data, "scopes", scopes));
    };
    S.setVar = function(varName, value) {
      var index = S.findVar(varName);
      if (index == null) {
        throw new Error("couldn't find var: " + varName);
      }
      var data = mori.updateIn(S.data, ["scopes", index, varName], () => value);
      return S.wrap(data);
    };
    S.getVar = function(varName) {
      var index = S.findVar(varName);
      if (index == null) {
        throw new Error("couldn't find var: " + varName);
      }
      var vv = mori.getIn(S.data, ["scopes", index, varName]);
      return vv;
    };
  };
  I.ASTNode = ASTNode;
  I.Value = Value;
  I.LValue = LValue;
  var JSFun = I.JSFun = function(fun, args) {
    J = this;
    J.fun = fun;
    J.kind = "JSFun";
    J.caption = () => this.kind;
    J.evaluate = function(callback) {
      var result = J.fun.apply(null, args);
      callback(result);
    }
  }
  I.checkReturn = function(result) {
    if (result._break !== undefined ||
        result._return !== undefined ||
        result._continue !== undefined ||
        result._goto !== undefined) {
      return true;
    }
    return false;
  };
  I.wrapResult = function(result) {
    return {
      value: result
    };
  };

  // Runtime nodes
  I.nop = function() {
    var a = new ASTNode("nop", [{}, {}, []]);
    return a;
  };
  I.newRecord = function(recNode, args) {
    var a = new ASTNode("newRecord", [{}, {}, []]);
    a.execute = function*(state) {
      var record = new Record(recNode);
      //console.log("rec, children", recNode.info.varNames, recNode.children);
      var i = 0;
      for (var child of recNode.children) {
        // fields and subrecords both have info.varNames
        var fieldNames = child.info.varNames;
        // TODO: there should only be one fieldName, even with typedefs
        for (var fieldName of fieldNames) {
          var defaultValue;
          [state, defaultValue] = yield [state, child];
          record.hashMap = mori.assoc(record.hashMap, fieldName, args[i] || defaultValue);
          //console.log("record", mori.toJs(record));
        }
        i += 1;
      }
      yield [state, I.V(record)];
    };
    a.caption = () => a.kind + ":" + recNode.info.varNames.join(',');
    return a;
  }
  // Actual function call
  I.fun = function(defnNode) {
    var a = new ASTNode("fun", [{}, {}, []]);
    a.execute = function*(state) {
      state = state.pushFun(a);
      state = state.beginScope();
      var i = 0;
      // Bind variables
      for (var varName of defnNode.info.varNames) {
        state = state.newVar(varName, a.args[i]);
        i++;
      }
      var result;
      for (var child of defnNode.children) {
        [state, result] = yield [state, child];
      }
      state = state.endScope();
      [state, fun] = state.popFun();
      yield [state, I.V(result)];
    };
    a.caption = function() {
      return this.kind + ":" + defnNode.info.funName;
    }
    return a;
  };
  // Define-time nodes
  I.V = function(value) {
    var value = new I.Value(value);
    return value;
  };
  I.val = function() {
    return I.V(JSON.parse(arguments[2][0]));
  }
  I.field = function() {
    var a = new ASTNode("field", arguments);
    a.caption = () => a.kind + ":" + a.info.varNames.join(',')
    /*a.execute = function*(state) {
      yield [state, I.V(a)];
    }*/
    return a;
  }
  I.jsfun = function() {
    var a = new ASTNode("jsfun", arguments);
    a.execute = function*(state) {
      var funName = a.children[0];
      var args = [];
      for (var child of a.children.slice(1)) {
        var result;
        [state, result] = yield [state, child];
        args.push(result);
      }
      switch (funName) {
        case "malloc":
          var node = I.malloc(a.debugInfo, a.info, args);
          [state, result] = yield [state, node];
          break;
        case "time":
          var node = I.time(a.debugInfo, a.info, args);
          [state, result] = yield [state, node];
          break;
        default:
          var newArgs = [];
          for (var arg of args) {
            if (arg instanceof Value) {
              arg = arg.value;
            } else if (arg instanceof LValue) {
              arg = arg.get(state);
            }
            if (arg instanceof StringPointer) {
              arg = arg.toJs();
            }
            newArgs.push(arg);
          }
          var fun = I.JSExports[funName];
          if (fun === undefined) {
            throw new Error("unknown JS function: " + JSON.stringify(a.children[0]));
          }
          var jsfunNode = new I.JSFun(fun, newArgs);
          var [state, result] = yield [state, jsfunNode];
          yield [state, new I.Value(result)];
          break;
      }
    }
    a.caption = () => a.kind + ":" + a.children[0];
    return a;
  }
  I.programs = function() {
    var a = new ASTNode("programs", arguments);
    a.execute = function*(state) { 
      var children = a.children;
      var lastResult;
      for (var child of children) {
        [state, lastResult] = yield [state, child];
      }
      yield [state, new Value(lastResult)];
    };
    return a;
  };
  I._if = function() {
    var a = new ASTNode("if", arguments);
    a.execute = function*(state) {
      var [state, result] = yield [state, a.children[0]];
      if (result) {
        var [state, result] = yield [state, a.children[1]];
      } else {
        var [state, result] = yield [state, a.children[2]];
      }
      yield [state, new I.Value(result)];
    };
    return a;
  };
  I.defn = function() {
    var a = new ASTNode("defn", arguments);
    a.execute = function*(state) {
      state = state.newVar(a.info.funName, a);
      //console.log("defn-state", mdump(state.data));
      yield [state, I.nop()];
    };
    a.caption = function() {
      return a.kind + ":" + a.info.funName;
    }
    a.getCall = function() {
      return I.fun(a);
    };
    return a;
  };
  I.call = function() {
    var a = new ASTNode("call", arguments);
    a.execute = function*(state) {
      var args = [];
      for (var child of a.children) {
        var [state, result] = yield [state, child];
        args.push(result);
      }
      var defnNode = args[0];
      console.log("defnNode", defnNode);
      var call = defnNode.getCall();
      call.args = args.slice(1);
      yield [state, call];
    };
    return a;
  };
  I.op = function() {
    var a = new ASTNode("op", arguments);
    a.caption = () => a.kind + ":" + a.children[0]
    a.execute = function*(state) {
      var operator = a.children[0];
      var [state, left] = yield [state, a.children[1]];
      var [state, right] = yield [state, a.children[2]];
      //console.log("operator", left, operator, right);
      var result;
      if (operator == '=') {
        //console.log("setting value");
        if (!(left instanceof LValue)) {
          throw new Error("tried to assign to !LValue");
        }
        [state, result] = left.set(state, right);
        result = I.V(result);
        console.log("left", left, state);
        yield [state, result];
      } else {
        var [set, compare, fun] = switchOperator(operator);
        funInt32 = (x, y) => fun(x, y) >>> 0;
        if (set) {
          var leftValue = left.get(state);
          if (leftValue instanceof IndexedPointer) {
            index = funInt32(leftValue.index, right);
            result = leftValue.copy();
            result.index = index;
            [state, result] = left.set(state, result);
            yield [state, result];
          } else if (right instanceof IndexedPointer) {
            throw new Error("unsupported operation");
          } else {
            result = funInt32(left.get(state), right);
            [state, result] = left.set(state, result);
            result = I.V(result);
            yield [state, result];
          }
        } else {
          if (left instanceof IndexedPointer) {
            var leftValue = left.index;
            var rightValue;
            if (right instanceof IndexedPointer) {
              rightValue = right.index;  
            } else {
              rightValue = right;
            }
            if (compare) {
              // return true/false
              result = I.V(fun(leftValue, rightValue));
              yield [state, result];
            } else {
              // return pointer
              index = funInt32(leftValue, rightValue);
              result = left.copy();
              result.index = index;
              yield [state, result];
            }
          } else if (right instanceof IndexedPointer) {
            index = funInt32(left, right.index);
            result = right.copy();
            result.index = index;
            yield [state, result];
          } else {
            result = funInt32(left, right);
            result = I.V(result);
            yield [state, result];
          }
        }
      }
      //yield [state, result];
      //console.log("operator result", result);
    };
    return a;
  }
  I.ref = function() {
    var a = new ASTNode("ref", arguments);
    a.execute = function*(state) {
      var result = new I.LValue(a.children[0]); 
      var check = state.getVar(a.children[0]);
      //console.log("var lookup", a.children[0], mdump(state.data), result);
      if (check === undefined || check === null) {
        throw new Error("var lookup failed: " + a.children[0]);
      }
      // result is ASTNode in case of defn,
      // but is not supposed to be processed here
      yield [state, result];
    }
    a.caption = function() {
      return this.kind + ":" + a.children[0]
    }
    return a;
  }
  I.root = function() {
    var a = new ASTNode("root", arguments);
    a.execute = function*(state) {
      var children = a.children;
      var lastResult;
      for (var child of children) {
        [state, lastResult] = yield [state, child];
      }
      yield [state, I.V(lastResult)];
    }
    return a;
  };
  I.tdef = function() {
    var a = new ASTNode("tdef", arguments);
    return a;
  };
  I.rec = function() {
    var a = new ASTNode("rec", arguments);
    a.indexToFieldMap = {};
    a.execute = function*(state) {
      for (var name of a.info.varNames) {
        state = state.newVar(name, a);
      }
      var i = 0;
      for (var child of a.children) {
        var fieldNames = child.info.varNames;
        a.indexToFieldMap[i] = fieldNames;
        i++;
      }
      //console.log("a.children", a.children);
      yield [state, I.nop()];
    };
    a.getCreate = function(args) {
      return I.newRecord(a, args);
    };
    return a;
  };
  I.c = function() {
    var a = new ASTNode("c", arguments);
    a.execute = function*(state) {
      if (a.children.length != 1) {
        console.log(a.children);
        throw new Error("children supposed to be length 1");
      }
      //console.log("a.children[0]", a.children[0]);
      var [state, result] = yield [state, a.children[0]];
      if (a.info.l2r && result instanceof LValue) {
        result = result.get(state);
        yield [state, I.V(result)];
      }
    }
    return a;
  };
  
  I._null = function() {
    var a = new ASTNode("null", arguments);
    return a;
  }
  I.def = function() {
    var a = new ASTNode("def", arguments);
    a.caption = () => a.kind + ":" + a.children[0];
    a.execute = function*(state) {
      var varName = a.children[0];
      var expr = a.children[1];
      var value;
      if (expr instanceof I.ASTNode) {
        [state, value] = yield [state, expr];
      } else {
        value = expr;
      }
      state = state.newVar(varName, value);
      yield [state, I.nop()];
    }
    return a;
  };
  I._new = function() {
    var a = new ASTNode("new", arguments);
    a.execute = function*(state) {
      var recordName = a.children[0];
      console.log(recordName);
      var record = state.getVar(recordName);
      var args = [];
      for (var child of a.children.slice(1)) {
        var [state, result] = yield [state, child];
        args.push(result);
      }
      var creator = record.getCreate(args);
      var [state, result] = yield [state, creator];
    }
    return a;
  }
  I.decl = function() {
    var a = new ASTNode("decl", arguments);
    return a;
  };
  I._for = function() {
    var a = new ASTNode("for", arguments);
    a.execute = function*(state) {
      var [init, test, update, body] = a.children;
      for ([state, _] = yield [state, init];
           ([state, _] = yield [state, test])[1];
           [state, _] = yield [state, update]) {
        var [state, result] = yield [state, body];
      }
    }
    return a;
  };
  I.up = function() {
    var a = new ASTNode("up", arguments);
    a.caption = () => a.kind + " " + a.children[0];
    a.execute = function*(state) {
      var operator = a.children[0];
      var [state, left] = yield [state, a.children[1]];
      //console.log("operator", left, operator, right);
      if (operator == '*') {
        console.log("dereference");
        if (!(left instanceof Pointer)) {
          console.log("left", typeof left, left);
          throw new Error("tried to dereference !Pointer");
        }
        if (left instanceof FixedPointer) {
          yield [state, left.lvalue]
        } else if (left instanceof IndexedPointer) {
          var lvalue = new PointerLValue(left);
          yield [state, lvalue];
        } else {
          console.log("left", left);
          throw new Error("not implemented pointer type");
        }
      } else if (operator == '&') {
        if (!(left instanceof LValue)) {
          throw new Error("tried to make pointer of !LValue");
        }
        var pointer;
        if (left.get(state) instanceof Record) {
          console.log("taking address of record");
          pointer = new RecordPointer(left, left.get(state));
        } else {
          pointer = new FixedPointer(left);
        }
        result = pointer;
        yield [state, pointer];
      } else {
        var result;
        var opFun;
        switch (operator) {
          case '++':
            opFun = (x) => x + 1;
            break;
          case '--':
            opFun = (x) => x - 1;
            break;
          case '+':
            opFun = (x) => x;
            break;
          case '-':
            opFun = (x) => -x;
          case '!':
            opFun = (x) => !x;
          case '~':
            opFun = (x) => ~x;
          default:
            console.log("operator", operator);
            throw new Error("unimplemented operator");
        }
        var opFunInt32 = (x) => opFun(x) >>> 0;
        if (a.info.prefix) {
          if (left instanceof LValue && left.get(state) instanceof IndexedPointer) {
            var copy = left.get(state).copy();
            copy.index = opFunInt32(copy.index);
            [state, result] = left.set(state, copy);
            yield [state, result];
          } else if (left instanceof LValue) {
            if (left.get(state) instanceof FixedPointer) {
              throw new Error("unsupported operation: " + operator + " on FixedPointer");
            }
            [state, result] = left.set(state, opFunInt32(left.get(state)));
            yield [state, I.V(result)];
          } else {
            yield [state, I.V(opFun(left))];
          }
        } else if (a.info.postfix) {
          if (left instanceof LValue && left.get(state) instanceof IndexedPointer) {
            var orig = left.get(state);
            var copy = orig.copy();
            copy.index = opFunInt32(copy.index);
            [state, result] = left.set(state, copy);
            yield [state, orig];
          } else if (left instanceof LValue) {
            if (left.get(state) instanceof FixedPointer) {
              throw new Error("unsupported operation: ++ on Fixed Pointer");
            }
            [state, result] = left.set(state, opFunInt32(left.get(state)));
            yield [state, I.V(result)];
          } else {
            yield [state, I.V(opFun(left))];
          }
        } else {
          throw new Error("unary operator is neither prefix nor postfix");
        }
      }
      //console.log("operator result", result);
    }
    return a;
  };
  I.ret = function() {
    var a = new ASTNode("ret", arguments);
    return a;
  };
  I.i = function() {
    var a = new ASTNode("i", arguments);
    return a;
  };
  I.null = function() {
    var a = new ASTNode("null", arguments);
    return a;
  };
  I.cc = function() {
    var a = new ASTNode("cc", arguments);
    return a;
  };
  I.enum = function() {
    var a = new ASTNode("enum", arguments);
    return a;
  };
  I.edecl = function() {
    var a = new ASTNode("edecl", arguments);
    return a;
  };
  I.assign = function() {
    var a = new ASTNode("assign", arguments);
    return a;
  };
  I.p = function() {
    var a = new ASTNode("p", arguments);
    return a;
  };
  I._while = function() {
    var a = new ASTNode("while", arguments);
    return a;
  };
  I._switch = function() {
    var a = new ASTNode("switch", arguments);
    return a;
  };
  I._case = function() {
    var a = new ASTNode("case", arguments);
    return a;
  };
  I._break = function() {
    var a = new ASTNode("break", arguments);
    return a;
  };
  I._default = function() {
    var a = new ASTNode("default", arguments);
    return a;
  };
  I.str = function() {
    return new StringPointer(JSON.parse(arguments[2][0]));
  };
  I.m = function() {
    var a = new ASTNode("m", arguments);
    a.caption = () => a.kind + " " + a.info.member;
    a.execute = function*(state) {
      var [state, expr] = yield [state, a.children[0]];
      var member = a.info.member;
      if (member.startsWith('.')) {
        member = member.slice(1);
      } else if (member.startsWith('->')) {
        member = member.slice(2);
        if (!(expr instanceof RecordPointer)) {
          throw new Error("tried to access ->member on !RecordPointer");
        }
        expr = expr.lvalue;
        var record = expr.get(state);
        if (!(record.hasField(state, member))) {
          throw new Error("member lookup: " + member);
        }
      }
      var lvalue = new LValue();
      lvalue.get = function(state) {
        var record = expr.get(state);
        if (!(record instanceof Record)) {
          throw new Error("invalid member lookup, not a record: " + record + ":" + member);
        }
        if (!(record.hasField(state, member))) {
          throw new Error("member lookup: " + member);
        }
        return record.getField(member);
      };
      lvalue.set = function(state, val) {
        var record = expr.get(state);
        if (!(record instanceof Record)) {
          throw new Error("invalid member lookup, not a record: " + result + ":" + member);
        }
        if (!(record.hasField(state, member))) {
          throw new Error("member lookup: " + member);
        }
        var [state, result] = record.setField(state, member, val);
        var [state, value] = expr.set(state, result);
        return [state, value];
      }
      yield [state, lvalue];
    }
    return a;
  };
  I.fill_array = function() {
    var a = new ASTNode("fill_array", arguments);
    a.execute = function*(state) {
      var [state, value] = yield [state, a.children[0]];
      var [state, size] = yield [state, a.children[1]];
      var result = new ArrayPointer(Array.apply(null, new Array(size)).map(function() { return value; }, 0));
      yield [state, result];
    }
    return a;
  }
  I.typed_array = function() {
    var a = new ASTNode("typed_array", arguments);
    a.execute = function*(state) {
      var [state, recNode] = yield [state, a.children[0]]
      //recNode = recNode.get(state);
      var [state, size] = yield [state, a.children[1]]
      var ar = new Array(size);
      for (var i = 0; i < ar.length; i++) {
        [state, result] = yield [state, recNode.getCreate([])];
        ar[i] = result;
      }
      yield [state, new ArrayPointer(ar)];
    }
    return a;
  }
  I.null_ptr = function() {
    var a = new ASTNode("null_ptr", arguments);
    a.execute = function*(state) {
      yield [state, new NullPointer()];
    }
    return a;
  }
  I.sz = function() {
    var a = new ASTNode("sz", arguments);
    a.execute = function*(state) {
      if (a.children.length == 0) {
        throw new Error("sizeof missing child");
      }
      var result = a.children[0];
      [state, result] = yield [state, result];
      result = result.get(state);
      var size;
      if (result instanceof Record) {
        size = result.recNode.children.length;
      } else {
        throw new Error("array sizeof not implemented yet");
        size = result.length;
      }
      yield [state, I.V(size)];
    }
    return a;
  };
  I.init = function() {
    var a = new ASTNode("init", arguments);
    a.execute = function*(state) {
      var array = [];
      for (var child of a.children) {
        var [state, result] = yield [state, child];
        array.push(result);
      }
      yield [state, new ArrayPointer(array)];
    }
    return a;
  };
  I.va = function() {
    var a = new ASTNode("va", arguments);
    return a;
  };
  I.compound = function() {
    var a = new ASTNode("compound", arguments);
    return a;
  };
  I.subscript = function() {
    var a = new ASTNode("subscript", arguments);
    a.execute = function*(state) {
      var [state, arLValue] = yield [state, a.children[0]];
      var [state, index] = yield [state, a.children[1]];
      if (!(arLValue instanceof ArrayPointer)) {
        throw new Error("tried to subscript !ArrayPointer");
      }
      var lvalue = new LValue();
      lvalue.get = function(state) {
        return arLValue.geti(state, index);
      }
      lvalue.set = function(state, val) {
        /*var ar = arLValue.get(state);
        ar[index] = val;
        var [state, result] = arLValue.set(state, val);
        return [state, result];*/
        [state, val] = arLValue.seti(state, index, val);
        return [state, val];
      }
      yield [state, lvalue];
    }
    return a;
  };
  I.file = function() {
    var a = new ASTNode("file", arguments);
    return a;
  };
  I.GENERIC = function() {
    var a = new ASTNode("", arguments);
    return a;
  };
  I.time = function() {
    var a = new ASTNode("time", arguments);
    a.execute = function*(state) {
      var t = a.children[0];
      var d = new Date();
      var n = (d.getTime() / 1000) >>> 0;
      if (!(t instanceof NullPointer)) {
        [state, result] = t.set(state, n);
      }
      yield [state, I.V(n)];
    };
    return a;
  }
  I.malloc = function() {
    var a = new ASTNode("malloc", arguments);
    return a;
  }
}

function DOMLogger() {
  var D = this;
  var H = HTML;
  D.stack = [];
  D.container = H.table(H.tr([H.td(), H.td("DOMLogger")]));
  D.root = D.container
  $('body').append(this.container);
  D.getClickFun = function(leftContainer, frame) {
    return function(){
      var frameElement = $("#frame");
      frameElement.html(D.formatDefault(frame.state, frame));
      frameElement.css({ 
        top: $(window).scrollTop(),
        left: leftContainer.offset().left + leftContainer.width()
      });
      return false;
    };
  };
  D.enter = function(frame, caption) {
    //console.log("caption", caption);
    caption = D.formatDefault(frame.state, caption);
    var container = H.table(H.caption(H.a(caption, { href: "#" })), { class: 'DOMLogger' });
    if (container === undefined) {
      throw new Error("container undefined");
    }
    D.container.append(H.tr([H.td(), H.td(container)]));
    D.stack.push(this.container);
    D.container = container;
    container.click(D.getClickFun(D.stack[0], frame));
  };
  D.log = function() {
    tds = [];
    for (var i = 0; i < arguments.length; i++) {
      tds.push(H.td(arguments[i]));
    }
    D.container.append(H.tr(tds));
  };
  D.isRealObject = function(value) {
    return (typeof value === 'object' && 
            value !== null &&
            !(value instanceof Boolean) &&
            !(value instanceof Date)    &&
            !(value instanceof Number)  &&
            !(value instanceof RegExp)  &&
            !(value instanceof String));
  };
  D.formatDefault = function(state, obj) {
    var ignore = {
      "interpreter": true
    };
    var attrs = { class: "DOMLogger JSON" };
    var propertyFilter = function(name, value) {
      if (name in ignore) {
        return H.div("ignored");
      }
      if (value === undefined) {
        return H.div("undefined");
      }
      if (value instanceof ASTNode) {
      //if (value !== undefined && value.hasOwnProperty('kind')) { // instanceof ASTNode) {
        return H.div("ASTNode:" + value.kind);
      }
      if (value instanceof NULL) {
        return H.div("NULL");
      }
      if (value instanceof Value) {
        return H.table(H.tr([H.td("Value"), H.td(D.formatDefault(state, value.value))]));
      }
      if (value instanceof LValue) {
        return H.table(H.tr(H.td(["LValue", D.formatDefault(state, value.get(state))])));
      }
      if (value !== undefined && value !== null) {
        if (value.hasOwnProperty('string')) {
          var arg = value;
          arg = arg.data.map(function(y) { return String.fromCharCode(y); }).join('');
          arg = arg.replace(/\0$/, '');
          return H.div(arg);
        }
      }
      /*if (name == "scopes") {
        return H.div(JSON.stringify(JSON.decycle(value)));
      }*/
      return null;
    }
    return D.formatObject(obj, propertyFilter, attrs);
  };
  // based on https://github.com/douglascrockford/JSON-js/blob/master/cycle.js
  D.formatObject = function(obj, propertyFilter, attrs) {
    var value = obj;
    //var value = JSON.parse(JSON.stringify(JSON.decycle(obj)));
    var objects = [];
    var paths = {};

    var result = propertyFilter("root", value);
    if (result) {
      return result;
    }

    var formatObjectRecurse = function(value, path) {
      // If array
      if (Object.prototype.toString.apply(value) === '[object Array]') {
        var rows = [];
        for (var i = 0; i < value.length; i += 1) {
          var newPath = path + '[' + i + ']';
          var child = propertyFilter("" + i, value[i]);
          if (child == null) {
            child = formatObjectH(value[i], newPath);
          }
          rows.push(H.tr([H.td('[' + i + ']'), H.td(child)]));
        }
        //var dl = H.table(rows);
        var dl = H.table(rows, attrs);
        return dl;
      } else {
        // If it is an object
        var rows = [];
        for (var name in value) {
          if (Object.prototype.hasOwnProperty.call(value, name)) {
            if (name == '__obj_id' || name == '__general_obj_id' || isFunction(value[name])) {
              continue;
            }
            var newPath = path + '[' + JSON.stringify(name) + ']';
            var child = propertyFilter(name, value[name]);
            if (child == null) {
              child = formatObjectH(value[name], newPath);
            }
            rows.push(H.tr([H.td(name), H.td(child)]));
          }
        }
        var dl = H.table(rows, attrs);
        return dl;
      }
    };
    var formatObjectH = function(value, path) {
      if (D.isRealObject(value)) {

        // If the value is an object or array, look to see if we have already
        // encountered it. If so, return a $ref/path object.
        var objID = objectId(value);

        if (objID in paths) {
          return paths[objID];
        }
        paths[objID] = path;

        var isCollection = false;
        try {
          isCollection = mori.isCollection(value);
          if (isCollection) {
            value = mori.toJs(value);
          }
        } catch (err) {
          // certainly not a collection
        }
        return formatObjectRecurse(value, path);
      } else {
        return H.div(JSON.stringify(value));
      }
    };
    return formatObjectH(value, '$');
  }
  D.leave = function() {
    if (D.stack.length == 0) {
      throw new Error("tried to pop empty stack");
    }
    D.container = D.stack.pop();
  };
}

var EvalFrame = function(astStack, node, state) {
  this.astStack = astStack;
  this.node = node;
  this.state = state;
  this.stage = 0;
};

function runEvalNodeInternal(I, stack, callback) {
  var EvalEnum = {
    INIT: 0,
    RETURN: 1,
    NEXT: 2,
    PROCESS: 3,
    FINISH: 4,
    END: 5
  };
  // Iterate over AST depth first calling execute to get children.
  var generator;
  var evalNodeInternal = (function*() {
    var retVal;
    while (stack.length > 0) {
      var frame = stack[stack.length - 1];
      //throw new Error("test");
      switch (frame.stage) {
        case EvalEnum.INIT:
          // retVal from parent
          frame.generator = frame.node.execute(frame.state);
          frame.astStack.push(frame.node);
          logger.enter(frame, frame.node.caption());
          frame.item = frame.generator.next();
          frame.stage = EvalEnum.PROCESS;
          break;
        case EvalEnum.RETURN:
          // retVal from child
          [frame.state, frame.result] = retVal;
        case EvalEnum.NEXT:
          frame.item = frame.generator.next([frame.state, frame.result]);
        case EvalEnum.PROCESS:
          if (!frame.item.done) {
            var childNode;
            try {
              [frame.state, childNode] = frame.item.value;
            } catch (err) {
              frame.generator.throw(err); //new Error("incorrect yield"));
            }
            if (frame.state === undefined || frame.state.data === undefined) {
              frame.generator.throw("incorrect state yield");
            }
            if (childNode instanceof I.ASTNode) {
              frame.stage = EvalEnum.RETURN;
              newFrame = new EvalFrame(frame.astStack, childNode, frame.state);
              stack.push(newFrame);
              //setTimeout(suspend.resume(), 10);
              //var deferred = Q.defer();
              //requestAnimationFrame(deferred.resolve);
              //yield requestAnimationFrame(() => generator.next());
              // setImmediate is fastest, but gives bogus stack traces
              //yield setImmediate(() => generator.next());
              //yield deferred.promise;
            } else if (childNode instanceof I.Value || childNode instanceof I.LValue || childNode instanceof Pointer) {
              // pass it back into program
              //console.log("childValue", childNode.value);
              //console.log("state", JSON.stringify(mori.toJs(frame.state.data)));
              if (childNode instanceof I.Value) {
                frame.result = childNode.value;
                if (frame.result == undefined) {
                  //frame.generator.throw("incorrect value yield");
                }
              } else {
                frame.result = childNode;
              }
              logger.enter(frame, frame.result);
              logger.leave();
              frame.stage = EvalEnum.NEXT;
            } else if (childNode instanceof I.JSFun) {
              //var deferred = Q.defer();
              //childNode.evaluate(deferred.resolve);
              frame.result = yield setTimeout(() => childNode.evaluate((arg) => generator.next(arg)), 0);
              //console.log("JSFun frame result", frame.result);
              //frame.result = yield deferred.promise;
              logger.enter(frame, frame.result);
              logger.leave();
              frame.stage = EvalEnum.NEXT;
            } else {
              frame.generator.throw(new Error("invalid childNode: " + childNode));
            }
            continue;
          }
          frame.stage = EvalEnum.FINISH;
        case EvalEnum.FINISH:
          logger.leave();
          frame.astStack.pop();
          retVal = [frame.state, frame.result];
          stack.pop();
          frame.stage = EvalEnum.END;
        }
      }
      callback(retVal);
  });
  generator = evalNodeInternal();
  generator.next();
  //.next(); //done();
}

function evalNode(I, astStack, node, state, callback) {
  var stack = [new EvalFrame(astStack, node, state)];
  var retVal = runEvalNodeInternal(I, stack, callback);
  return retVal;
}

var logger;
function runTest(program) {
  logger = new DOMLogger();
  var I = program.debugInfo.interpreter;
  var cls = I.State;
  var state = new cls();
  var astStack = [];
  var callback = function(arg) {
    console.log("callback");
    var [state, result] = arg;
    console.log("result", result);
  }
  evalNode(I, astStack, program, state, callback);
}
function runMain() {
  logger = new DOMLogger();
  var [programs, I] = getPrograms();
  var cls = I.State;
  var state = new cls();
  state = state.newVar("test", 17);
  var astStack = [];

  var mainRef = I.ref({}, {}, ["main"]);
  var l2rCast = I.c({}, {l2r: true}, [mainRef]);
  var callArgs = [l2rCast, I.V(0), I.V(0)]
  programs.push(I.call({}, {}, callArgs));

  var callback = function(arg) {
    console.log("callback");
    var [state, result] = arg;
    console.log("result", result);
  }
  var astPrograms = I.programs({}, {}, programs);
  evalNode(I, astStack, astPrograms, state, callback);
  //console.log("result", result);
}

function getHalfLingTestProgram() {
  var I = new Interpreter();
  var program = 
    I.root({kind: "root", interpreter: I }, 
           {}, 
           [I.defn({},
              {
                funName: 'foo',
                varNames: ['a', 'b', 'c']
              }, 
              [I._if({}, {}, 
                    [I.V(true),
                     I.op({}, {}, 
                       ['*', 
                        I.V(2), 
                        I.ref({}, {}, ['a'])]),
                     I.V(4)])]),
            I.call({}, {}, [I.ref({}, {}, ['foo']), I.V(3), I.V(4), I.V(5)])]);
  return program;
}
// Example program in WISP syntax, arguing its case
var wisp = `(root
  (defn foo
   [a, b, c]
   (if true ('*' 1 a) 2))
  (foo 3 4 5))`
