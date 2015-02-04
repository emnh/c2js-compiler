#!/usr/bin/env python
# -*- coding: utf-8 -*-
# vim: ft=python ts=4 sw=4 sts=4 et fenc=utf-8
# Original author: "Eivind Magnus Hvidevold" <hvidevold@gmail.com>
# License: GNU GPLv3 at http://www.gnu.org/licenses/gpl.html

'''
'''

import os
import sys
import re

'''
Example AST:
TranslationUnitDecl 0x36b9250 <<invalid sloc>> <invalid sloc>
|-TypedefDecl 0x36b9750 <<invalid sloc>> <invalid sloc> implicit __int128_t '__int128'
|-TypedefDecl 0x36b97b0 <<invalid sloc>> <invalid sloc> implicit __uint128_t 'unsigned __int128'
|-TypedefDecl 0x36b9b00 <<invalid sloc>> <invalid sloc> implicit __builtin_va_list '__va_list_tag [1]'
|-FunctionDecl 0x36b9cd0 <c_if_and_for.c:1:1, line:5:1> line:1:6 foo 'void (int *, int *)'
| |-ParmVarDecl 0x36b9b90 <col:10, col:15> col:15 used a 'int *'
| |-ParmVarDecl 0x36b9c00 <col:18, col:23> col:23 used b 'int *'
| `-CompoundStmt 0x36f6a50 <col:26, line:5:1>
|   `-IfStmt 0x36b9f58 <line:2:3, line:4:3>
|     |-<<<NULL>>>
|     |-BinaryOperator 0x36b9e40 <line:2:7, col:14> 'int' '>'
|     | |-ImplicitCastExpr 0x36b9e28 <col:7, col:10> 'int' <LValueToRValue>
|     | | `-ArraySubscriptExpr 0x36b9de0 <col:7, col:10> 'int' lvalue
|     | |   |-ImplicitCastExpr 0x36b9dc8 <col:7> 'int *' <LValueToRValue>
|     | |   | `-DeclRefExpr 0x36b9d80 <col:7> 'int *' lvalue ParmVar 0x36b9b90 'a' 'int *'
|     | |   `-IntegerLiteral 0x36b9da8 <col:9> 'int' 0
|     | `-IntegerLiteral 0x36b9e08 <col:14> 'int' 1
|     |-CompoundStmt 0x36b9f38 <col:17, line:4:3>
|     | `-BinaryOperator 0x36b9f10 <line:3:5, col:12> 'int' '='
|     |   |-ArraySubscriptExpr 0x36b9ec8 <col:5, col:8> 'int' lvalue
|     |   | |-ImplicitCastExpr 0x36b9eb0 <col:5> 'int *' <LValueToRValue>
|     |   | | `-DeclRefExpr 0x36b9e68 <col:5> 'int *' lvalue ParmVar 0x36b9c00 'b' 'int *'
|     |   | `-IntegerLiteral 0x36b9e90 <col:7> 'int' 0
|     |   `-IntegerLiteral 0x36b9ef0 <col:12> 'int' 2
|     `-<<<NULL>>>
|-FunctionDecl 0x36f6bc0 <line:7:1, col:26> col:6 bar 'void (float, float)'
| |-ParmVarDecl 0x36f6a80 <col:10, col:16> col:16 x 'float'
| `-ParmVarDecl 0x36f6af0 <col:19, col:25> col:25 y 'float'
`-FunctionDecl 0x36f6dd0 <line:9:1, line:13:1> line:9:6 bang 'void (int *, int)'
  |-ParmVarDecl 0x36f6c90 <col:11, col:16> col:16 used a 'int *'
  |-ParmVarDecl 0x36f6d00 <col:19, col:23> col:23 used v 'int'
  `-CompoundStmt 0x36f7190 <col:26, line:13:1>
    `-ForStmt 0x36f7150 <line:10:5, line:12:5>
      |-DeclStmt 0x36f6f08 <line:10:10, col:19>
      | `-VarDecl 0x36f6e90 <col:10, col:18> col:14 used i 'int' cinit
      |   `-IntegerLiteral 0x36f6ee8 <col:18> 'int' 0
      |-<<<NULL>>>
      |-BinaryOperator 0x36f6fa0 <col:21, col:25> 'int' '<'
      | |-ImplicitCastExpr 0x36f6f70 <col:21> 'int' <LValueToRValue>
      | | `-DeclRefExpr 0x36f6f20 <col:21> 'int' lvalue Var 0x36f6e90 'i' 'int'
      | `-ImplicitCastExpr 0x36f6f88 <col:25> 'int' <LValueToRValue>
      |   `-DeclRefExpr 0x36f6f48 <col:25> 'int' lvalue ParmVar 0x36f6d00 'v' 'int'
      |-UnaryOperator 0x36f6ff0 <col:28, col:30> 'int' prefix '++'
      | `-DeclRefExpr 0x36f6fc8 <col:30> 'int' lvalue Var 0x36f6e90 'i' 'int'
      `-CompoundStmt 0x36f7130 <col:33, line:12:5>
        `-CompoundAssignOperator 0x36f70f8 <line:11:9, col:17> 'int' '-=' ComputeLHSTy='int' ComputeResultTy='int'
          |-ArraySubscriptExpr 0x36f7090 <col:9, col:12> 'int' lvalue
          | |-ImplicitCastExpr 0x36f7060 <col:9> 'int *' <LValueToRValue>
          | | `-DeclRefExpr 0x36f7010 <col:9> 'int *' lvalue ParmVar 0x36f6c90 'a' 'int *'
          | `-ImplicitCastExpr 0x36f7078 <col:11> 'int' <LValueToRValue>
          |   `-DeclRefExpr 0x36f7038 <col:11> 'int' lvalue Var 0x36f6e90 'i' 'int'
          `-ImplicitCastExpr 0x36f70e0 <col:17> 'int' <LValueToRValue>
            `-DeclRefExpr 0x36f70b8 <col:17> 'int' lvalue Var 0x36f6e90 'i' 'int'
'''

class ASTNode(object):

    def __init__(self, opts):
        for key in opts.keys():
            self.__dict__[key] = opts[key]
        self.children = []

class ParmVarDecl(ASTNode): pass



def parse(data):
    'parse AST'
    data = re.sub(r'\033\[[^m]+m', '', data)
    parents = [ASTNode({'kind': 'root'})]
    oldPrefix = ''
    firstLine = True
    for line in data.splitlines():
        if '<<<NULL>>>' in line:
            continue
        match = re.search('(?P<prefix>[- |`]*)(?P<kind>[A-Za-z]*) (?P<ptr>[^ ]*) (?P<location><[^>]*>)(?P<rest>.*)', line)
        d = {}
        for group in 'prefix', 'kind', 'ptr', 'rest', 'location':
            d[group] = match.group(group)
        ast = ASTNode(d)
        #ast = globals()[d['kind']]()
        assert isinstance(ast, ASTNode)
        #print len(ast.prefix), ast.kind, ast.ptr, ast.rest

        prefix = ast.prefix
        if len(prefix) < len(oldPrefix):
            for i in range((len(oldPrefix) - len(prefix)) / 2 + 1):
                #print 'pop', parents[-1].kind
                parents.pop()
        elif len(prefix) > len(oldPrefix):
            assert len(prefix) == len(oldPrefix) + 2
            pass
        elif len(prefix) == len(oldPrefix) and not firstLine:
            #print 'pop', parents[-1].kind
            parents.pop()
        oldPrefix = prefix

        ast.parent = parents[-1]
        ast.parent.children.append(ast)
        #print ast.parent.kind.ljust(30), line
        parents.append(ast)
        #print 'push', ast.kind
        firstLine = False
    return parents[0]

class PrintKinds(object):

    def __init__(self, ast):
        self.ast = ast
        self.kinds = {}

    def getKinds(self, node=None):
        self.kinds[node.kind] = True
        if node == None:
            node = self.ast
        for child in node.children:
            self.getKinds(child)
        return self.kinds

    def printKinds(self):
        kinds = self.getKinds(self.ast).keys()
        kinds.sort()
        for kind in kinds:
            print 'class ' + kind + '(object): pass'

class Replacer(object):

    def __init__(self, source):
        self.source = source
        lineMap = [[]]
        lineno = 0
        column = 0
        chars = []
        for i, c in enumerate(self.source):
            chars.append(c)
            lineMap[lineno].append(i)
            if c == '\n':
                lineno += 1
                column = 0
                lineMap.append([])
        self.chars = chars
        self.lineMap = lineMap
        self.lines = source.splitlines()

    def lineColToPos(self, line, col):
        return self.lineMap[line, col]

    def insert(self, start, text):
        return self.replace(start, start, text)

    def replace(self, start, end, text):
        'replace from start to end, not inclusive end'
        start = self.lineColToPos(start)
        end = self.lineColToPos(end)
        for i in range(start, end):
            self.chars[i] = ''
        self.chars[start] = text
        self.chars[start:end] = text

    def __str__(self):
        return ''.join(self.chars)

class Visitor(object):

    def __init__(self, ast, replacer):
        self.ast = ast
        self.replacer = replacer

    def visit(self, node=None):
        if node == None:
            node = self.ast
        for child in node.children:
            self.visit(child)

def main():
    'entry point'
    sourceFileName = sys.argv[1]
    astFileName = sys.argv[2]
    sourceData = file(sourceFileName).read()
    astData = file(astFileName).read()
    ast = parse(astData)
    printKinds = PrintKinds(ast)
    printKinds.printKinds()
    replacer = Replacer(sourceData)
    visitor = Visitor(ast, replacer)
    visitor.visit()
    #print str(replacer)

if __name__ == '__main__':
    main()

