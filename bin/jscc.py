#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# vim: ft=python ts=4 sw=4 sts=4 et fenc=utf-8
# Original author: "Eivind Magnus Hvidevold" <hvidevold@gmail.com>
# License: GNU GPLv3 at http://www.gnu.org/licenses/gpl.html

'''
Example, compile coreutils with AST dump:
make CC="~/dev/c2js-compiler/bin/jscc.py -std=gnu99"
'''

import os
import sys
import re
import subprocess

def main():
    'entry point'
    args = sys.argv[1:]
    options = {}
    ignoreNext = True
    nonOptions = []
    argopts = ['MT', 'MF', 'o']

    # parse args
    for i, arg in enumerate(args):
        if args[i] == None:
            continue
        if arg.startswith('-'):
            arg = arg.replace('-', '')
            options[arg] = True
            if arg in argopts:
                options[arg] = args[i + 1]
                args[i + 1] = None
        else:
            nonOptions.append(arg)

    if 'c' in options:
        astOutputFile = options['o']
        if not astOutputFile.endswith('.o'):
            print('Error, could not parse arguments: output file with .o')
            print((sys.argv))
            sys.exit(1)
        astOutputFile = astOutputFile.replace('.o', '.ast')

        # call clang with syntax dump
        clang = ['clang'] + sys.argv[1:]
        clang += ['-Xclang', '-ast-dump']
        print('calling', clang)
        output = subprocess.check_output(clang)

        # write AST dump
        fd = open(astOutputFile, 'wb')
        fd.write(output)
        fd.close()

    # call clang without syntax dump
    clang = ['clang'] + sys.argv[1:]
    exitCode = subprocess.call(clang)
    return exitCode

    # call gcc
    ccargs = ['gcc'] + sys.argv[1:]
    print(ccargs)
    exitcode = subprocess.call(ccargs)
    return exitcode

if __name__ == '__main__':
    main()

