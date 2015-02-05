~/llvm/bin/clang -Xclang -ast-dump -fsyntax-only inputs/test.c > inputs/test.ast
./jsrewriter.py inputs/test.c inputs/test.ast output/test.js
cat output/test.js
