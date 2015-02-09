~/llvm/bin/clang -Xclang -ast-dump -fsyntax-only lib/baselib.c > lib/baselib.ast
~/llvm/bin/clang -Xclang -ast-dump -fsyntax-only inputs/test.c > inputs/test.ast
#PYTHONPATH=$PYTHONPATH:$PWD/addict ./jsrewriter.py inputs/test.c -o output/test.js
PYTHONPATH=$PYTHONPATH:$PWD/addict ./jsrewriter.py --halfling inputs/test.c -o output/test.js
#browserify script.js -t 6to5ify --outfile bundle.js
#browserify halfling.js -t 6to5ify --outfile bundle.js &&
#node ./bundle.js
