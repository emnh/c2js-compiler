"use strict;"

if (window === undefined) {
  require("6to5/polyfill");
}

//Q.longStackSupport = true;

if (typeof String.prototype.startsWith != 'function') {
  // see below for better implementation!
  String.prototype.startsWith = function (str){
    return this.indexOf(str) == 0;
  };
}

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
var LValue = function(varName) {
  this.get = function(state) {
    return state.getVar(varName);
  };
  this.set = function(state, val) {
    return state.setVar(varName, val);
  };
}

function Interpreter() {
  var I = this;
  I.JSExports = {
    printf: _printf,
    puts: _puts,
    'C.create': C.create,
    'C.nullPointer': C.nullPointer,
    'C.typedArray': C.typedArray,
    'C.fillArray': C.fillArray,
    'C.fillString': C.fillString,
    'C.typeCheckCall': C.typeCheckCall,
    '_r1': _r1,
    '_r2': _r2,
    '_r3': _r3
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
      var data = mori.updateIn(S.data, ["scopes", index, varName], value);
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
      var result = J.fun.apply(args);
      callback(I.V(result));
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
      var record = mori.hashMap();
      console.log("rec, children", recNode.info.varNames, recNode.children);
      var i = 0;
      for (var child of recNode.children) {
        // fields and subrecords both have info.varNames
        var fieldNames = child.info.varNames;
        for (var fieldName of fieldNames) {
          var defaultValue;
          [state, defaultValue] = yield [state, child];
          record = mori.assoc(record, fieldName, args[i] || defaultValue);
          console.log("record", mori.toJs(record));
        }
        i += 1;
      }
      yield [state, I.V(record)];
    };
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
    return I.V(arguments[2][0]);
  }
  I.field = function() {
    var a = new ASTNode("field", arguments);
    /*a.execute = function*(state) {
      yield [state, I.V(a)];
    }*/
    return a;
  }
  I.jsfun = function() {
    var a = new ASTNode("jsfun", arguments);
    a.execute = function*(state) {
      var args = [];
      for (var child of a.children.slice(1)) {
        var [state, result] = yield [state, child];
        args.push(result);
      }
      var fun = I.JSExports[a.children[0]];
      if (fun === undefined) {
        throw new Error("unknown JS function: " + JSON.stringify(a.children[0]));
      }
      var jsfunNode = new I.JSFun(fun, args);
      var [state, result] = yield [state, jsfunNode];
      yield [state, new I.Value(result)];
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
        state = left.set(state, right);
        result = right;
      } else {
        result = eval("" + left + operator + right);
      }
      //console.log("operator result", result);
      yield [state, I.V(result)];
    };
    return a;
  }
  I.ref = function() {
    var a = new ASTNode("ref", arguments);
    a.execute = function*(state) {
      var result = new LValue(a.children[0]); 
      //state.getVar(a.children[0]);
      //console.log("var lookup", a.children[0], mdump(state.data), result);
      if (result === undefined || result === null) {
        throw new Error("var lookup failed: " + a.children[0]);
      }
      // result is ASTNode in case of defn,
      // but is not supposed to be processed here
      yield [state, I.V(result)];
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
    a.execute = function*(state) {
      for (var name of a.info.varNames) {
        state = state.newVar(name, a);
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
      return a;
    };
    I.up = function() {
      var a = new ASTNode("up", arguments);
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
      var a = new ASTNode("str", arguments);
      return a;
    };
    I.m = function() {
      var a = new ASTNode("m", arguments);
      a.execute = function*(state) {
        var [state, result] = yield [state, a.children[0]];
        var member = a.info.member;
        result = result.get(state);
        if (member.startsWith('.')) {
          member = member.slice(1);
          if (!(member in result)) {
            throw new Error("member lookup: " + member);
          }
          result = result[member];
        } else if (member.startsWith('->')) {
          member = member.slice(2);
          result = result._m();
          if (!(member in result)) {
            throw new Error("member lookup: " + member);
          }
        }
        yield [state, I.V(result)];
      }
      return a;
    };
    I.sz = function() {
      var a = new ASTNode("sz", arguments);
      return a;
    };
    I.init = function() {
      var a = new ASTNode("init", arguments);
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
    I.geti = function() {
      var a = new ASTNode("geti", arguments);
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
  }

  var __next_objid = 1;
  function objectId(obj) {
      if (obj == null) return null;
      if (obj.__obj_id == null) {
        obj.__obj_id = __next_objid++;
      }
      return obj.__obj_id;
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
        frameElement.html(D.formatDefault(frame));
        frameElement.css({ 
          top: $(window).scrollTop(),
          left: leftContainer.offset().left + leftContainer.width()
        });
        return false;
      };
    };
    D.enter = function(frame, caption) {
      //console.log("caption", caption);
      caption = D.formatDefault(caption);
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
    D.formatDefault = function(obj) {
      var ignore = {
        "interpreter": true
      };
      var propertyFilter = function(name, value) {
        if (name in ignore) {
          return H.div("ignored");
        }
        if (value instanceof ASTNode) {
        //if (value !== undefined && value.hasOwnProperty('kind')) { // instanceof ASTNode) {
          return H.div("ASTNode:" + value.kind);
        }
        if (value instanceof NULL) {
          return H.div("NULL");
        }
        /*if (name == "scopes") {
          return H.div(JSON.stringify(JSON.decycle(value)));
        }*/
        return null;
      }
      return D.formatObject(obj, propertyFilter);
    };
    // based on https://github.com/douglascrockford/JSON-js/blob/master/cycle.js
    D.formatObject = function(obj, propertyFilter) {
      var value = obj;
      //var value = JSON.parse(JSON.stringify(JSON.decycle(obj)));
      var objects = [];
      var paths = {};
      var attrs = { class: "DOMLogger JSON" };
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
              if (name == '__obj_id' || isFunction(value[name])) {
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
              } else if (childNode instanceof I.Value || childNode instanceof I.LValue) {
                //console.log("childValue", childNode.value);
                //console.log("state", JSON.stringify(mori.toJs(frame.state.data)));
                frame.result = childNode.value;
                logger.enter(frame, frame.result);
                logger.leave();
                frame.stage = EvalEnum.NEXT;
              } else if (childNode instanceof I.JSFun) {
                //var deferred = Q.defer();
                //childNode.evaluate(deferred.resolve);
                frame.result = yield setTimeout(() => childNode.evaluate((arg) => generator.next(arg)), 0);
              console.log("JSFun frame result", frame.result);
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
