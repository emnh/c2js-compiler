"use strict;"

if (window === undefined) {
  require("6to5/polyfill");
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
      lastResult = yield [state, child];
    }
    yield [state, new Value(lastResult)];
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
var Value = function(value) {
  this.value = value;
  this.kind = "value";
  this.caption = () => this.kind;
};

function Interpreter() {
  var I = this;
  I.JSExports = {
    printf: _printf,
    puts: _puts
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
  var JSFun = I.JSFun = function(fun, args) {
    this.fun = fun;
    this.kind = "JSFun";
    this.caption = () => this.kind;
    this.evaluate = function(callback) {
      var result = this.fun.apply(args);
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
        result = yield [state, child];
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
  I.jsfun = function() {
    var a = new ASTNode("jsfun", arguments);
    a.execute = function*(state) {
      var args = [];
      for (var child of a.children.slice(1)) {
        var result = yield [state, child];
        args.push(result);
      }
      var fun = I.JSExports[a.children[0]];
      var jsfunNode = new I.JSFun();
      var result = yield [state, jsfunNode];
      yield new I.Value(result);
    }
    return a;
  }
  I._if = function() {
    var a = new ASTNode("if", arguments);
    a.execute = function*(state) {
      var result = yield [state, a.children[0]];
      if (result) {
        var result = yield [state, a.children[1]];
      } else {
        var result = yield [state, a.children[2]];
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
        var result = yield [state, child];
        args.push(result);
      }
      var defnNode = args[0];
      var call = defnNode.getCall();
      call.args = args.slice(1);
      yield [state, call];
    }
    return a;
  };
  I.op = function() {
    var a = new ASTNode("op", arguments);
    a.execute = function*(state) {
      var operator = a.children[0];
      var left = yield [state, a.children[1]];
      var right = yield [state, a.children[2]];
      //console.log("operator", left, operator, right);
      var result = eval("" + left + operator + right);
      //console.log("operator result", result);
      yield [state, I.V(result)];
    };
    return a;
  }
  I.ref = function() {
    var a = new ASTNode("ref", arguments);
    a.execute = function*(state) {
      var result = state.getVar(a.children[0]);
      console.log("var lookup", a.children[0], mdump(state.data), result);
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
        lastResult = yield [state, child];
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
    return a;
  };
  I.tc = function() {
    var a = new ASTNode("tc", arguments);
    return a;
  };
  I._var = function() {
    var a = new ASTNode("var", arguments);
    return a;
  };
  I.decl = function() {
    var a = new ASTNode("decl", arguments);
    return a;
  };
  I._for = function() {
    var a = new ASTNode("a", arguments);
    return a;
  };
  I.op = function() {
    var a = new ASTNode("op", arguments);
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
  I.tcc = function() {
    var a = new ASTNode("tcc", arguments);
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
  I.cs = function() {
    var a = new ASTNode("cs", arguments);
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
  D.container = H.div("DOMLogger");
  console.log("container", D.container);
  $('body').append(this.container);
  D.enter = function(frame, caption) {
    var container = H.table(H.caption(H.a(caption, { href: "#" })), { class: 'DOMLogger' });
    if (container === undefined) {
      throw new Error("container undefined");
    }
    D.container.append(H.tr([H.td(), H.td(container)]));
    container.click(function() {
      $("#frame").html(D.formatFrame(frame));
      return false;
    });
    D.stack.push(this.container);
    D.container = container;
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
  D.formatFrame = function(obj) {
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
      return null;
    }
    return D.formatObject(obj, propertyFilter);
  };
  // based on https://github.com/douglascrockford/JSON-js/blob/master/cycle.js
  D.formatObject = function(obj, propertyFilter) {
    //JSON.parse(JSON.stringify(JSON.decycle(obj)));
    var value = obj; 
    var objects = [];
    var paths = {};
    var formatObjectH = function(value, path) {
      //console.log("formatObjectH");
      if (D.isRealObject(value)) {

        // If the value is an object or array, look to see if we have already
        // encountered it. If so, return a $ref/path object.
        var objID = objectId(value);

        if (objID in paths) {
          return paths[objID];
        }
        
        /*for (var i = 0; i < objects.length; i += 1) {
           if (objects[i] === value) {
             return H.div(paths[i]);
           }
        }*/

        //objects.push(value);
        paths[objID] = path;

        var attrs = { class: "DOMLogger JSON" };

        if (mori.isMap(value)) {
          value = mori.toJs(value);
        }
        // If array
        if (Object.prototype.toString.apply(value) === '[object Array]') {
          var rows = [];
          for (var i = 0; i < value.length; i += 1) {
            var newPath = path + '[' + i + ']';
            var child = propertyFilter("" + i, value[i]);
            if (child == null) {
              child = formatObjectH(value[i], newPath);
            }
            //console.log(i, child);
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
      } else {
        //console.log("not real object", value);
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
  var finalReturn;
  var evalNodeInternal = (function*() {
    var retVal;
    while (stack.length > 0) {
      var frame = stack[stack.length - 1];
      console.log("caption/stage", frame.node.caption(), frame.stage);
      switch (frame.stage) {
        case 0:
          if (retVal !== undefined) {
            frame.state = retVal[0];
          }
          frame.generator = frame.node.execute(frame.state);
          console.log("node", frame.node.kind);
          logger.enter(frame, frame.node.caption());
          frame.item = frame.generator.next();
          frame.stage = 2;
          break;
        case 1:
          [frame.state, frame.result] = retVal;
          console.log("newState", JSON.stringify(mori.toJs(frame.state.data)));
          frame.item = frame.generator.next(frame.result);
        case 2:
          frame.astStack.push(frame.node);
          if (!frame.item.done) {
            var childNode;
            [frame.state, childNode] = frame.item.value;
            if (childNode instanceof I.ASTNode) {
              console.log("childNode", childNode.kind);
              console.log("state", JSON.stringify(mori.toJs(frame.state.data)));
              //logger.log("state", logger.formatObject(mori.toJs(frame.state.data)));
              frame.stage = 1;
              newFrame = new EvalFrame(frame.astStack, childNode, frame.state);
              stack.push(newFrame);
              //setTimeout(suspend.resume(), 10);
              //var value = yield requestAnimationFrame(suspend.resumeRaw());
              continue;
              //[frame.state, frame.result] = evalNode(I, frame.astStack, childNode, state);
            } else if (childNode instanceof I.Value) {
              console.log("childValue", childNode.value);
              console.log("state", JSON.stringify(mori.toJs(frame.state.data)));
              frame.result = childNode.value;
            } else if (childNode instanceof I.JSFun) {
              throw new Error("not implemented yet: " + childNode);
            } else {
              throw new Error("invalid childNode: " + childNode);
            }
          }
          frame.stage = 3;
        case 3:
          logger.leave();
          frame.astStack.pop(frame.node);
          retVal = [frame.state, frame.result];
          stack.pop();
          frame.stage = 4;
      }
    }
    callback(retVal);
  });
  evalNodeInternal().next();
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
  var astStack = [];
  programs.push(I.call({}, {}, [I.ref({}, {}, ["main"]), I.V(0), I.V(0)]))
  for (var program of programs) {
    var [state, result] = evalNode(I, astStack, program, state);
  }
  console.log("result", result);
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
