# c2js-compiler

WARNING: This project is in its infancy, and you won't get away with much else
than reading the source code currently.

This project is for compiling C to JavaScript.

This project parses the Clang AST from -dump AST and generates JavaScript from
it. It does _NOT_ work by translating to LLVM IR first, thereby keeping the
source more close to the original.

Contrary to Emscripten and LLJS, it uses closures to simulate pointers instead
of arrays with integer indices. This keeps the source more readable, presumably
at the expense of performance.

# Status
c2js-compiler is specifically targeted at porting Vim to the web, and has so
far only been tried on eval.c in the Vim src directory. The resulting JS file
loads the definitions in nodejs without errors, but I haven't tried running
anything in a Web browser yet. I also need to implement a filesystem, probably
borrow from Emscripten or something.

# TODO
 - Pointer arithmetic. Array pointers.
 - Goto statements and labels.
 - JavaScript to C source maps.
 - Resolve variable type issues, JavaScript string versus char* etc.
