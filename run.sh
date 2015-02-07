~/llvm/bin/clang -Xclang -ast-dump -fsyntax-only preamble.c > preamble.c.ast
~/llvm/bin/clang -Xclang -ast-dump -fsyntax-only inputs/test.c > inputs/test.c.ast
./jsrewriter.py inputs/test.c -o output/test.js
#cat output/test.js
