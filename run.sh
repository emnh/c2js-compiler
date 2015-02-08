~/llvm/bin/clang -Xclang -ast-dump -fsyntax-only lib/baselib.c > lib/baselib.ast
~/llvm/bin/clang -Xclang -ast-dump -fsyntax-only inputs/test.c > inputs/test.ast
./jsrewriter.py inputs/test.c -o output/test.js
#cat output/test.js
