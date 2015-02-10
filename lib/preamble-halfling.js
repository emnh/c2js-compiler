"use strict;"

if (window === undefined) {
  require("6to5/polyfill");
}

function mdump(s) {
  return JSON.stringify(mori.toJs(s));
}

function Interpreter() {
  var I = this;
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
  var ASTNode = I.ASTNode = function(args) {
    this.debugInfo = args[0];
    this.info = args[1];
    this.children = args[2];
    this.define = function*() { };
    this.execute = function*() { };
    this.copy = function() {
      var a = new ASTNode();
      this.debugInfo = a.debugInfo;
      this.info = a.info;
      this.children = a.children;
    }
  };
  var Value = I.Value = function(value) {
    this.value = value;
    this.kind = "value";
  };
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
    var a = new ASTNode({}, {}, []);
    a.kind = "nop";
    return a;
  };
  // Actual function call
  I.fun = function(defnNode) {
    var a = new ASTNode({}, {}, []);
    a.kind = "fun";
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
    return a;
  };

  // Define-time nodes
  I.V = function(value) {
    var value = new I.Value(value);
    return value;
  };
  I._if = function() {
    var a = new ASTNode(arguments);
    a.kind = "if";
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
    var a = new ASTNode(arguments);
    a.kind = "defn";
    a.execute = function*(state) {
      state = state.newVar(a.info.funName, a);
      //console.log("defn-state", mdump(state.data));
      yield [state, I.nop()];
    };
    a.getCall = function() {
      return I.fun(a);
    };
    return a;
  };
  I.call = function() {
    var a = new ASTNode(arguments);
    a.kind = "call";
    a.execute = function*(state) {
      var args = [];
      console.log("call", a.children);
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
    var a = new ASTNode(arguments);
    a.kind = "op";
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
    var a = new ASTNode(arguments);
    a.kind = "ref";
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
    return a;
  }
  I.root = function() {
    var a = new ASTNode(arguments);
    a.kind = "root";
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
}
function DOMLogger() {
  var D = this;
  var H = HTML;
  this.stack = [];
  this.container = H.div("DOMLogger");
  $('body').append(this.container);
  D.enter = function(caption) {
    var container = H.table(H.caption(caption), { class: 'DOMLogger' });
    this.container.append(H.tr([H.td(), H.td(container)]));
    this.stack.push(this.container);
    this.container = container;
  };
  D.log = function() {
    tds = [];
    for (var i = 0; i < arguments.length; i++) {
      tds.push(H.td(arguments[i]));
    }
    this.container.append(H.tr(tds));
  };
  D.isRealObject = function(value) {
    return (typeof value === 'object' && 
            value !== null &&
            !(value instanceof Boolean) &&
            !(value instanceof Date)    &&
            !(value instanceof Number)  &&
            !(value instanceof RegExp)  &&
            !(value instanceof String));
  }
  // based on https://github.com/douglascrockford/JSON-js/blob/master/cycle.js
  D.formatObject = function(obj) {
    //var value = obj; //JSON.parse(JSON.stringify(JSON.decycle(obj)));
    var value = JSON.parse(JSON.stringify(JSON.decycle(obj)));
    var objects = [];
    var paths = [];
    console.log("fmtvalue", value);
    var formatObjectH = function(value, path) {
      console.log("formatObjectH");
      if (D.isRealObject(value)) {

        // If the value is an object or array, look to see if we have already
        // encountered it. If so, return a $ref/path object. This is a hard way,
        // linear search that will get slower as the number of unique objects grows.
        for (var i = 0; i < objects.length; i += 1) {
           if (objects[i] === value) {
             return H.div(paths[i]);
           }
        }
        objects.push(value);
        paths.push(path);

        var attrs = { class: "DOMLogger JSON" };

        // If array
        if (Object.prototype.toString.apply(value) === '[object Array]') {
          var rows = [];
          for (var i = 0; i < value.length; i += 1) {
            var newPath = path + '[' + i + ']';
            var child = formatObjectH(value[i], newPath);
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
              var newPath = path + '[' + JSON.stringify(name) + ']';
              var child = formatObjectH(value[name], newPath);
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
    this.container = this.stack.pop();
  };
};

function rr(I, astStack, node, state) {
  var generator;
  generator = node.execute(state);
  console.log("node", node.kind);
  var item = generator.next();
  var result;
  astStack.push(node);
  logger.enter(node.kind);
  while (!item.done) {
    var [state, childNode] = item.value;
    if (childNode instanceof I.ASTNode) {
      console.log("childNode", childNode.kind);
      console.log("state", JSON.stringify(mori.toJs(state.data)));
      //logger.log("state", logger.formatObject(mori.toJs(state.data)));
      [state, result] = rr(I, astStack, childNode, state);
      console.log("newState", JSON.stringify(mori.toJs(state.data)));
    } else if (childNode instanceof I.Value) {
      console.log("childValue", childNode.value);
      console.log("state", JSON.stringify(mori.toJs(state.data)));
      result = childNode.value;
    } else {
      throw new Error("invalid childNode: " + childNode);
    }
    item = generator.next(result);
  }
  logger.leave();
  astStack.pop(node);
  return [state, result];
}

var logger;
function run(program) {
  logger = new DOMLogger();
  var I = program.debugInfo.interpreter;
  var cls = I.State;
  var state = new cls();
  var astStack = [];
  // TODO: globals
  var rootFun = function*(state) {
    yield program;
  }(state);
  var [state, result] = rr(I, astStack, program, state);
  console.log("result", result);
  /*
  var Sentinel = function() { };
  astStack.push([new Sentinel(), I.root, I.root.execute(), undefined]);
  while (astStack.length > 0) {
    var [nodeParent, node, generator, first] = astStack.pop();
    if (first) {
      var item = generator.next(result);
    } else {
    }
    while (!item.done) {
      var childNode = item.value;
      if (childNode instanceof I.ASTNode) {
        astStack.push([nodeParent, node, generator, false]);
        astStack.push([node, childNode, childNode.execute(state), undefined]);
        break;
      } else if (childNode instanceof I.Value) {
        result = childNode.value;
        item = generator.next(result);
      }
    }
  }*/
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

var programs = {};
var programCounter = 0;
