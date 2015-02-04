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

class SourceExtent(object):
    def __init__(self, start, end):
        self.start = start
        self.end = end

class SourceLocation(object):
    def __init__(self, filename, line, col, valid):
        self.filename = filename
        self.line = line
        self.col = col
        self.valid = valid

    def __str__(self):
        return str(self.filename) + ':' + str(self.line) + ':' + str(self.col) + ':' + str(self.valid)

class ASTNode(object):

    def __init__(self, opts):
        for key in opts.keys():
            self.__dict__[key] = opts[key]
        self.children = []
        self._extent = None

    def printParents(self):
        stack = []
        parent = self.parent
        while parent.kind != 'root':
            stack.append(parent)
            parent = parent.parent
        stack.reverse()

        for parent in stack:
            print 'parent line', parent.rawline
        print 'self line', self.rawline

    def getVarName(self):
        varNames = filter(lambda x: x[0] == '[0;1;36', self.lineByColor)
        if len(varNames) > 0:
            varName = varNames[0][1]
            varName = varName.strip()
        else:
            varName = None
        return varName

    def getVarType(self):
        varType = filter(lambda x: x[0] == '[0;32', self.lineByColor)[0][1]
        return varType

    def parseLocation(self, location, askParent):
        match = re.search('^col:(?P<col>[0-9]+)$', location)
        match2 = re.search('^((?P<fname>[^:]+):)?(?P<line>[0-9]+):(?P<col>[0-9]+)$', location)
        match3 = re.search('<invalid sloc', location)
        if match:
            filename = None
            line = None
            if askParent:
                extent = self.parent.getExtent()
                #parent = self.parent
                #while parent.kind != 'root':
                #    print 'parent line', parent.rawline
                #    parent = parent.parent
                filename = extent.start.filename #or extent.end.filename
                line = extent.start.line #or extent.end.line
            col = int(match.group('col')) - 1    # 0 indexed
            valid = True
        elif match2:
            filename = match2.group('fname')
            if filename == 'line':
                if askParent:
                    filename = self.parent.getExtent().start.filename
                else:
                    filename = None
            line = int(match2.group('line')) - 1 # 0 indexed
            col = int(match2.group('col')) - 1   # 0 indexed
            valid = True
        elif match3:
            filename = None
            line = None
            col = None
            valid = False
        else:
            assert False, location
        return SourceLocation(filename, line, col, valid)

    def getExtent(self):
        if self._extent:
            return self._extent
        match = re.search(r'^<(.*), (.*)>$', self.location)
        match2 = re.search(r'^<(.*)>$', self.location)
        if match or match2:
            if match:
                startLocation = match.group(1)
                start = self.parseLocation(startLocation, True)
                endLocation = match.group(2)
                end = self.parseLocation(endLocation, False)
            elif match2:
                startLocation = match2.group(1)
                start = self.parseLocation(startLocation, True)
                end = start
            if end.filename == None:
                end.filename = start.filename
            if end.line == None:
                end.line = start.line
            self._extent =  SourceExtent(start, end)
            return self._extent
        else:
            assert False, self.line + ", LOCATION: " + self.location

    def getLineLocation(self):
        match = re.search('<line:([0-9]+)', self.location)
        if match:
            return int(match.group(1))
        else:
            return None

    def rewrite(self, replacer):
        pass

class ArraySubscriptExpr(ASTNode): pass
class AsmLabelAttr(ASTNode): pass
class BinaryOperator(ASTNode): pass
class BreakStmt(ASTNode): pass
class CallExpr(ASTNode): pass
class CaseStmt(ASTNode): pass
class CharacterLiteral(ASTNode): pass
class CompoundAssignOperator(ASTNode): pass
class CompoundStmt(ASTNode): pass
class ConditionalOperator(ASTNode): pass
class ConstAttr(ASTNode): pass
class ContinueStmt(ASTNode): pass
class CStyleCastExpr(ASTNode): pass
class DeclRefExpr(ASTNode): pass
class DeclStmt(ASTNode): pass
class DefaultStmt(ASTNode): pass
class DeprecatedAttr(ASTNode): pass
class DoStmt(ASTNode): pass
class EmptyDecl(ASTNode): pass
class EnumConstantDecl(ASTNode): pass
class EnumDecl(ASTNode): pass
class FieldDecl(ASTNode): pass
class Field(ASTNode): pass
class FloatingLiteral(ASTNode): pass
class FormatAttr(ASTNode): pass
class ForStmt(ASTNode): pass
class FullComment(ASTNode): pass

class FunctionDecl(ASTNode):
    def isProtoType(self):
        return all(child.kind != 'CompoundStmt' for child in self.children)

    def rewrite(self, replacer):
        ext = self.getExtent()
        varName = self.getVarName()
        varType = self.getVarType()
        if varName != None:
            try:
                source = replacer.getSource(ext.start, ext.end)
            except:
                source = None
            if source != None:
                funStart = re.search(r'\b%s\b' % varName, source)
                if funStart:
                    #self.printParents()
                    #print ext.start, ext.end, varName, varType, source
                    start = replacer.lineColToPos(ext.start.line, ext.start.col)
                    end = start + funStart.start()
                    # remove function type and static etc
                    replacer.replace(start, end, 'function ')


class GNUInlineAttr(ASTNode): pass
class GotoStmt(ASTNode): pass
class IfStmt(ASTNode): pass
class ImplicitCastExpr(ASTNode): pass
class ImplicitValueInitExpr(ASTNode): pass
class IndirectFieldDecl(ASTNode): pass
class InitListExpr(ASTNode): pass
class IntegerLiteral(ASTNode): pass
class LabelStmt(ASTNode): pass
class MallocAttr(ASTNode): pass
class MemberExpr(ASTNode): pass
class ModeAttr(ASTNode): pass
class NonNullAttr(ASTNode): pass
class NoThrowAttr(ASTNode): pass
class NullStmt(ASTNode): pass
class OffsetOfExpr(ASTNode): pass
class ParagraphComment(ASTNode): pass
class ParenExpr(ASTNode): pass

class ParmVarDecl(ASTNode):
    def rewrite(self, replacer):
        ext = self.getExtent()
        varName = self.getVarName()
        varType = self.getVarType()
        try:
            source = replacer.getSource(ext.start, ext.end)
        except:
            #self.printParents()
            #print ext.start, ext.end, varName, varType
            #print 'could not get source'
            source = None
        if source != None:
            #self.printParents()
            #print ext.start, ext.end, varName, varType
            varTypeS = re.sub(r"['\s]*", '', varType).split(':')[0]
            sourceS = re.sub(r'\s*', '', source)
            if sourceS != varTypeS:
                pass
                #print 'incorrect getSource', sourceS, varTypeS
            else:
                # ParmDecl just includes type.
                # Erase type for JS.
                replacer.replace(ext.start, ext.end, '')

class PredefinedExpr(ASTNode): pass
class PureAttr(ASTNode): pass
class RecordDecl(ASTNode): pass
class ReturnStmt(ASTNode): pass
class ReturnsTwiceAttr(ASTNode): pass
class SentinelAttr(ASTNode): pass
class StmtExpr(ASTNode): pass
class StringLiteral(ASTNode): pass
class SwitchStmt(ASTNode): pass
class TextComment(ASTNode): pass
class TranslationUnitDecl(ASTNode): pass
class TransparentUnionAttr(ASTNode): pass
class TypedefDecl(ASTNode): pass
class UnaryExprOrTypeTraitExpr(ASTNode): pass
class UnaryOperator(ASTNode): pass
class UnusedAttr(ASTNode): pass
class VAArgExpr(ASTNode): pass

class VarDecl(ASTNode):
    def rewrite(self, replacer):

        ext = self.getExtent()
        varName = self.getVarName()
        varType = self.getVarType()
        if varName != None:
            end2 = self.parseLocation(self.rest.strip().split(' ')[0], False)
            if end2.filename == None:
                end2.filename = ext.start.filename
            if end2.line == None:
                end2.line = ext.start.line
            for endLoc in [ext.end, end2]:
                try:
                    # sometimes the VarDecl ends where the var name starts, sometimes not
                    # add len(varName) for good measure
                    start = replacer.lineColToPos(ext.start.line, ext.start.col)
                    end = replacer.lineColToPos(endLoc.line, endLoc.col) + len(varName)
                    source = replacer.getSource(start, end)
                except IndexError, e:
                    source = None
                if source != None:
                    self.printParents()
                    print ext.start, ext.end, end2, varName, varType, source
                    varStart = re.search(r'\b(?P<word>%s)\b' % varName, source)
                    print 'varStart', varStart
                    if varStart:
                        start = replacer.lineColToPos(ext.start.line, ext.start.col)
                        if start in replacer.replacedVarStarts:
                            print 'already replaced type for ', varName
                        else:
                            replacer.replacedVarStarts[start] = True
                            end = start + varStart.start('word')
                            # Declare as var instead of with type
                            replacer.replace(start, end, 'var ')
                            print 'replacing with var: ', replacer.getSource(start, end)
                    print




class WarnUnusedResultAttr(ASTNode): pass
class WhileStmt(ASTNode): pass

def parseAST(data):
    'parse AST'
    #data = re.sub(r'\033\[[^m]+m', '', data)
    parents = [ASTNode({
        'kind': 'root',
        'prefix': '',
        'location': 0
        })]
    oldPrefix = ''
    prevLine = ''
    for rawline in data.splitlines():
        if '<<<NULL>>>' in rawline:
            continue
        # Not sure what this is used for exactly, seems to be array init
        if 'array filler' in rawline:
            continue
        line = re.sub(r'\033\[[^m]+m', '', rawline)
        lineByColor = re.findall(r'[\033](?P<color>\[[^m]+)m(?P<value>[^\033]*)', rawline)
        #print lineByColor
        match = re.search('(?P<prefix>[- |`]*)(?P<kind>[A-Za-z]*) (?P<ptr>[^ ]*) (prev (?P<prev>[^ ]* ))?(?P<location>(<[^>]+>)|([^ ]+))(?P<rest>.*)', line)
        #if not match:
        #    print 'NO MATCH'
        #    print line
        d = {}
        for group in 'prefix', 'kind', 'ptr', 'rest', 'location':
            d[group] = match.group(group)
        kind = d['kind']
        if kind in globals():
            ast = globals()[kind](d)
        else:
            print >>sys.stderr, 'unknown kind', kind
            print >>sys.stderr, 'LINE', line
            ast = ASTNode(d)
        ast.rawline = rawline
        ast.line = line
        ast.lineByColor = lineByColor

        assert isinstance(ast, ASTNode)
        #print len(ast.prefix), ast.kind, ast.ptr, ast.rest

        prefix = ast.prefix
        while len(parents[-1].prefix) >= len(prefix) and parents[-1].kind != 'root':
            parents.pop()
        oldPrefix = prefix

        ast.parent = parents[-1]
        ast.parent.children.append(ast)
        #print ast.parent.kind.ljust(30), line
        parents.append(ast)
        #print 'push', ast.kind
        prevLine = line
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
            print 'class ' + kind + '(ASTNode): pass'

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
        # state
        self.replacedVarStarts = {}

    def lineColToPos(self, line, col):
        return self.lineMap[line][col]

    def insert(self, start, text):
        return self.replace(start, start, text)

    def getSource(self, start, end):
        if isinstance(start, SourceLocation):
            start = self.lineColToPos(start.line, start.col)
        if isinstance(end, SourceLocation):
            end = self.lineColToPos(end.line, end.col)
        if start <= len(self.chars) and end <= len(self.chars):
            return self.source[start:end]
        else:
            raise IndexError("index out of range")

    def replace(self, start, end, text):
        'replace from start to end, not inclusive end'
        if isinstance(start, SourceLocation):
            start = self.lineColToPos(start.line, start.col)
        if isinstance(end, SourceLocation):
            end = self.lineColToPos(end.line, end.col)
        #print len(self.chars), start, end
        for i in range(start, end):
            assert self.chars[i] != '', 'overwrite not supported'
            self.chars[i] = ''
        self.chars[start] = text

    def __str__(self):
        return ''.join(self.chars)

class Visitor(object):

    def __init__(self, ast, replacer):
        self.ast = ast
        self.replacer = replacer

    def visit(self, node=None):
        if node == None:
            node = self.ast
        node.rewrite(self.replacer)
        for child in node.children:
            self.visit(child)

def main():
    'entry point'
    sourceFileName = sys.argv[1]
    astFileName = sys.argv[2]
    outFileName = sys.argv[3]
    sourceData = file(sourceFileName).read()
    astData = file(astFileName).read()
    ast = parseAST(astData)
    #printKinds = PrintKinds(ast)
    #printKinds.printKinds()
    replacer = Replacer(sourceData)
    replacer.fileName = sourceFileName
    visitor = Visitor(ast, replacer)
    visitor.visit()
    fd = file(outFileName, 'w')
    print >>fd, str(replacer)
    fd.close()

if __name__ == '__main__':
    main()

