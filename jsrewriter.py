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

defaultValues = {
    'int': '0',
    'char': '0',
    'char *': '""'
    }

def indent(s):
    # indent all
    s = re.sub(r'^', '    ', s, flags=re.MULTILINE)
    # but not blank lines
    s = re.sub(r'^\s*$', '', s, flags=re.MULTILINE)
    return s

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
        while parent.kind != 'ASTRootNode':
            stack.append(parent)
            parent = parent.parent
        stack.reverse()

        for parent in stack:
            print 'parent line', parent.rawline
        print 'self line', self.rawline

    def find(self, filter):
        if filter(self):
            yield self
        for child in self.children:
            for found in child.find(filter):
                yield found

    def getPosition(self):
        return [i for i, x in enumerate(self.parent.children) if x == self][0]

    def getChildrenRecursive(self):
        for child in self.children:
            yield child
            for grandChild in child.getChildrenRecursive():
                yield grandChild

    def getOperator(self):
        return self.rest.split(' ')[-1].strip("'")

    def getMember(self):
        return self.rest.split(' ')[-2].strip("'")

    def getChildValues(self, sep=''):
        s = ''
        for child in self.children:
            value = child.getValue()
            assert value != None, child.kind
            s += value + sep
        return s

    def getValue(self):
        print 'warning, default handler for: ', self.kind
        return self.getChildValues()

    def getVarName(self):
        varNames = filter(lambda x: x[0] == '[0;1;36', self.lineByColor)
        if len(varNames) > 0:
            varName = varNames[0][1]
            varName = varName.strip()
            varName = varName.strip("'")
            assert not varName in self.root.builtins
        else:
            varName = None
        return varName

    def getVarType(self):
        varType = filter(lambda x: x[0] == '[0;32', self.lineByColor)[0][1]
        varType = varType.strip("'")
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

class ASTRootNode(ASTNode):
    def __init__(self):
        self.kind = 'ASTRootNode'
        self.prefix = ''
        self.location = 0
        self.children = []
        self.builtins = []
        self.externs = {}

    def getValue(self):
        return self.getChildValues()

class ASTNullNode(ASTNode):

    # too lazy to define __init__ and call super
    def init(self):
        self.kind = None

    def getValue(self):
        return ''

class ASTArrayFiller(ASTNode):

    # too lazy to define __init__ and call super
    def init(self):
        self.kind = "ASTArrayFiller"
        self.children = []

class ASTAttr(ASTNode):
    "usually we don't are about it"

    def getValue(self):
        assert len(self.children) == 0
        return ''


class ArraySubscriptExpr(ASTNode):

    def getValue(self):
        c1, c2 = self.children
        val1 = c1.getValue()
        val2 = c2.getValue()
        return '%s[%s]' % (val1, val2)

class AsmLabelAttr(ASTAttr): pass

class BinaryOperator(ASTNode):

    def getValue(self):
        c1, c2 = self.children
        val1 = c1.getValue()
        val2 = c2.getValue()
        operator = self.getOperator()
        #print 'operator', operator
        return '%s %s %s' % (val1, operator, val2)

class BreakStmt(ASTNode):
    def getValue(self):
        return 'break;\n'

class CallExpr(ASTNode):
    def getValue(self):
        fexpr = self.children[0]
        values = self.children[1:]
        if (fexpr.getVarName() == 'alloc' and
            fexpr.parent.kind == "CStyleCastExpr"):
            varType = fexpr.parent.getVarType().strip('*')
            if 'struct ' in varType:
                varType = varType.replace('struct ', '')
            s = 'new %s' % varType
            return s
        else:
            fexpr = fexpr.getValue()
            values = [x.getValue() for x in values]
            s = '%s(%s)' % (fexpr, ', '.join(values))
            #print 'call ', s
            return s

class CaseStmt(ASTNode):

    def getValue(self):
        test = self.children[0].getValue()
        assert self.children[1].kind == None
        body = self.children[2].getValue()
        s = 'case %s:\n' % test
        s += indent(body)
        s += '\n'
        return s


class CharacterLiteral(ASTNode):
    def getValue(self):
        return self.getVarName()

class CompoundAssignOperator(ASTNode):

    def getOperator(self):
        return self.rest.split(' ')[-3].strip("'")

    def getValue(self):
        c1, c2 = self.children
        val1 = c1.getValue()
        val2 = c2.getValue()
        operator = self.getOperator()
        #print 'operator', operator
        return '%s %s %s' % (val1, operator, val2)


class CompoundStmt(ASTNode):
    def getValue(self):
        #return '{' + self.getChildValues(';\n') + '}'
        s = ''
        for child in self.children:
            s += child.getValue()
            s = re.sub(r'\s*;', ';', s);
            ss = s.rstrip()
            if not ss.endswith('}') and not ss.endswith(';'):
                s += ';\n'
        return s

class ConditionalOperator(ASTNode):

    def getValue(self):
        condition, expr1, expr2 = self.children
        condition = condition.getValue()
        expr1 = expr1.getValue()
        expr2 = expr2.getValue()
        s = '%s ? %s : %s' % (condition, expr1, expr2)
        #print 'conditional', s
        return s

class ConstAttr(ASTAttr): pass

class ContinueStmt(ASTNode):
    def getValue(self):
        return 'continue;\n'

class CStyleCastExpr(ASTNode):
    def getValue(self):
        return self.getChildValues()

class DeclRefExpr(ASTNode):
    def getValue(self):
        varname = self.getVarName()
        return varname


class DeclStmt(ASTNode):
    def getValue(self):
        # TODO: maybe sep=; but not in for loops
        return self.getChildValues('')

class DefaultStmt(ASTNode):

    def getValue(self):
        body = self.children[0].getValue()
        assert len(self.children) == 1
        s = 'default:\n'
        s += indent(body)
        s += '\n'
        return s


class DeprecatedAttr(ASTAttr): pass

class DoStmt(ASTNode):

    def getValue(self):
        assert len(self.children) == 2
        body = self.children[0].getValue()
        test = self.children[1].getValue()
        s = 'do {\n'
        s += indent(body)
        s += '\n} while (%s);\n' % test
        return s


class EmptyDecl(ASTNode): pass

class EnumConstantDecl(ASTNode):

    def getValue(self):
        return self.getChildValues()

class EnumDecl(ASTNode):
    def getValue(self):
        s = ''
        oldValue = None
        i_base = 0
        i = 0
        for child in self.children:
            if len(child.children) > 0:
                value = child.getValue()
                try:
                    i_base = int(value)
                except ValueError, e:
                    i_base = value
                i = 0
            else:
                if isinstance(i_base, int):
                    value = str(i_base + i)
                else:
                    value = i_base + ' + ' + str(i)
            i += 1
            s += '%s = %s;\n' % (child.getVarName(), value)
        return s


class FieldDecl(ASTNode): pass
class Field(ASTNode): pass

class FloatingLiteral(ASTNode):
    def getValue(self):
        return self.getVarName()

class FormatAttr(ASTAttr): pass

class ForStmt(ASTNode):
    def getValue(self):
        init, unknown, test, update, body = self.children
        if unknown.kind != None:
            raise 'Found unknown for statement thingy!'
        init = init.getValue()
        test = test.getValue()
        update = update.getValue()
        body = body.getValue()
        init = init.rstrip(';\n')
        s = 'for (%s; %s; %s) {\n' % (init, test, update)
        s += indent(body)
        s += '}\n'
        return s

class FullComment(ASTNode): pass

# TODO: disable function prototypes
class FunctionDecl(ASTNode):
    def isProtoType(self):
        return all(child.kind != 'CompoundStmt' for child in self.children)

    def getValue(self):
        if not self.isProtoType():
            varName = self.getVarName()
            if varName != None:
                s = ''
                fields = [x.getVarName() for x in self.children if x.kind == "ParmVarDecl"]
                for i, field in enumerate(fields):
                    # prototypes have unnamed arguments
                    if field == None:
                        fields[i] = '_'
                fields = ', '.join(fields)
                body = ''.join([x.getValue() for x in self.children if x.kind != "ParmVarDecl"])
                s += 'function %s(%s) {\n' % (self.getVarName(), fields)
                s += indent(body)
                s += '\n}\n'
                return s
            else:
                print 'FunctionDecl', self.rawline
        else:
            return ''

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

                    # remove anything between argument list and body
                    match = re.search(r'\([^{]*\)([^{]*)\{', source)
                    if match:
                        #self.printParents()
                        #print ext.start, ext.end, varName, varType, source
                        start2 = start + match.start(1)
                        end2 = start + match.end(1)
                        replacer.replace(start2, end2, '')
                        #print 'between brace', match.group(1)
                        #print


class GNUInlineAttr(ASTAttr): pass
class GotoStmt(ASTNode): pass
class IfStmt(ASTNode):

    def getValue(self):
        test = self.children[1].getValue()
        body = self.children[2].getValue()
        elseClause = self.children[3].getValue()
        s = 'if (%s) {\n' % test
        if not re.search('[;}]\s*$', body):
            body = body + ';'
        s += indent(body) + '\n'
        s += '}'
        if elseClause.strip() != '':
            s += ' else {\n'
            s += indent(elseClause) + '\n'
            s += '}\n'
        else:
            s += '\n'
        return s

class ImplicitCastExpr(ASTNode):
    def getValue(self):
        return self.getChildValues()

class ImplicitValueInitExpr(ASTNode): pass
class IndirectFieldDecl(ASTNode): pass

class InitListExpr(ASTNode):

    def getValue(self):
        if self.children[0].kind == 'ASTArrayFiller':
            varType = self.getVarType()
            size = re.search('[0-9]+', varType).group(0)
            size = int(size)
            value = self.children[1].getValue()
            try:
                int(value)
            except ValueError:
                assert False, ("todo: implement other than int array filler: %s" % value)
            return '_fillArray(%s, %s)' % (size, value)
        else:
            return '[ ' + self.getChildValues(', ') + ' ]'

class IntegerLiteral(ASTNode):
    def getValue(self):
        varname = self.getVarName()
        return varname

class LabelStmt(ASTNode): pass
class MallocAttr(ASTAttr): pass

class MemberExpr(ASTNode):

    def getValue(self):
        member = self.getMember()
        expr = self.getChildValues()
        if member.startswith('.'):
            member = '.' + member[1:]
        elif member.startswith('->'):
            # TODO: Fix pointer referencing
            member = '.' + member[2:]
        s = expr + member
        #print 'member', s
        return s




class ModeAttr(ASTAttr): pass
class NonNullAttr(ASTAttr): pass
class NoThrowAttr(ASTAttr): pass

class NullStmt(ASTNode):

    def getValue(self):
        assert len(self.children) == 0
        return ';'

class OffsetOfExpr(ASTNode): pass
class ParagraphComment(ASTNode): pass

class ParenExpr(ASTNode):

    def getValue(self):
        return '(%s)' % self.getChildValues()


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
class PureAttr(ASTAttr): pass

class RecordDecl(ASTNode):
    def getValue(self):
        pos = self.getPosition()
        typeDefSibling = self.parent.children[pos + 1]
        # TODO: check that it overlaps with definition
        if typeDefSibling.kind == 'TypedefDecl': # and typeDefSibling.getExtent().start.line == self.getExtent().start.line:
            varName = typeDefSibling.getVarName()
            typeDefSibling.processed = True
        else:
            varName = self.getVarName()
        if varName == None:
            print 'record None', self.rawline
        fields = [x.getVarName() for x in self.children if x.kind == "FieldDecl"]
        for i, field in enumerate(fields):
            # prototypes have unnamed arguments
            if field == None:
                fields[i] = '_'
        types = [x.getVarType() for x in self.children if x.kind == "FieldDecl"]
        s = 'function %s(%s) {\n' % (varName, ', '.join(fields))
        body = ''
        for field, t in zip(fields, types):
            #if t in defaultValues:
            #    defaultValue = defaultValues[t]
            #else:
            #    defaultValue = 'undefined'
            body += 'this.%s = %s;\n' % (field, field)
        s += indent(body)
        s += '}\n'
        return s

    def rewrite(self, replacer):
        ext = self.getExtent()
        value = self.getValue()
        start = replacer.lineColToPos(ext.start)
        end = replacer.lineColToPos(ext.end)

        source1 = replacer.getSource(replacer.capBelow(start - 100), start)
        source1 = ''.join(reversed(source1))
        typedef = ''.join(reversed('typedef'))
        match1 = re.search(typedef, source1)
        start -= match1.start() + len(typedef)

        source2 = replacer.getSource(end, replacer.cap(end + 100))
        match2 = re.search(';', source2)
        end += match2.start()

        replacer.replace(start, end, value)


class ReturnStmt(ASTNode):
    def getValue(self):
        s = ''
        for child in self.children:
            s += child.getValue() + '\n'
        return 'return ' + s + ';'

class ReturnsTwiceAttr(ASTAttr): pass
class SentinelAttr(ASTAttr): pass

class StmtExpr(ASTNode):
    def getValue(self):
        return self.getChildValues()

class StringLiteral(ASTNode):
    def getValue(self):
        return self.getVarName()

class SwitchStmt(ASTNode):

    def getValue(self):
        assert self.children[0].kind == None
        test = self.children[1].getValue()
        body = self.children[2].getValue()
        s = 'switch (%s) {\n' % test
        s += indent(body)
        s += '}\n'
        return s

class TextComment(ASTNode): pass

class TranslationUnitDecl(ASTNode):

    def getValue(self):
        s = ''
        s += '''
"use strict";
function _getSaveLine() {
    var lineNumber = 0;
    return function(line) {
        var tmp = lineNumber;
        lineNumber = line;
        return tmp;
    };
}
function _fillArray(size, value) {
    return Array.apply(null, new Array(size)).map(Number.prototype.valueOf, value);
}
var _l = _getSaveLine();
'''
        self.root.builtins = [
                'getSaveLine',
                '_l'
                ]
        s += self.getChildValues()
        return s

class TransparentUnionAttr(ASTAttr): pass

class TypedefDecl(ASTNode):
    def getValue(self):
        return ''

class UnaryExprOrTypeTraitExpr(ASTNode):

    def getValue(self):
        if 'sizeof' in self.line:
            # case 1: inside alloc/malloc. whole call should be replace with "new Class(defaultValues)"
            # case 2: else, size of array, call len
            return "1"
        else:
            assert "Unknown UnaryExprOrTypeTraitExpr"


class UnaryOperator(ASTNode):

    def getValue(self):
        c1 = self.children[0]
        val1 = c1.getValue()
        operator = self.getOperator()
        if operator == '*':
            # TODO: check all instances, fix properly
            #print self.rawline
            subVar = None
            for child in self.getChildrenRecursive():
                #print child.rawline
                if child.kind == "DeclRefExpr":
                    varType = child.getVarType()
                    if '*' or '[' in x.getVarType():
                        subVar = child
                        break
            varName = subVar.getVarName()
            index = re.sub('%s' % varName, '0', val1)
            s = '%s[%s]' % (varName, index)
            #print 'deref', s
            return s
        else:
            # TODO: be more specific about prefix/suffix token location
            if 'prefix' in self.line:
                return operator + val1
            elif 'postfix' in self.line:
                return val1 + operator

class UnusedAttr(ASTAttr): pass
class VAArgExpr(ASTNode): pass

class VarDecl(ASTNode):
    def getValue(self):
        varName = self.getVarName()
        if len(self.children) > 0:
            expr = ''.join([x.getValue() for x in self.children])
            if not 'extern' in self.line:
                return 'var %s = %s;\n' % (varName, expr)
            else:
                assert False, (varName, expr)
        else:
            if not 'extern' in self.line:
                return 'var %s;\n' % varName
            else:
                # TODO: verify
                # we plan to concat all JS, so no globals required
                # save it in case it appears we need to know later
                self.root.externs[varName] = self
                return '';
                #return 'global %s;\n' % varName

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
                    #self.printParents()
                    #print ext.start, ext.end, end2, varName, varType, source
                    varStart = re.search(r'\b(?P<word>%s)\b' % varName, source)
                    #print 'varStart', varStart
                    if varStart:
                        start = replacer.lineColToPos(ext.start.line, ext.start.col)
                        if start in replacer.replacedVarStarts:
                            pass
                            #print 'already replaced type for ', varName
                        else:
                            replacer.replacedVarStarts[start] = True
                            end = start + varStart.start('word')
                            # Declare as var instead of with type
                            replacer.replace(start, end, 'var ')
                            #print 'replacing with var: ', replacer.getSource(start, end)
                    #print




class WarnUnusedResultAttr(ASTAttr): pass
class WhileStmt(ASTNode):

    def getValue(self):
        assert self.children[0].kind == None
        test = self.children[1].getValue()
        body = self.children[2].getValue()
        s = 'while (%s) {\n' % test
        s += indent(body)
        s += '}\n'
        return s


def parseAST(data):
    'parse AST'
    #data = re.sub(r'\033\[[^m]+m', '', data)
    parents = [ASTRootNode()]
    oldPrefix = ''
    for rawline in data.splitlines():
        line = re.sub(r'\033\[[^m]+m', '', rawline)
        lineByColor = re.findall(r'[\033](?P<color>\[[^m]+)m(?P<value>[^\033]*)', rawline)
        #print lineByColor
        prefix = re.search('(?P<prefix>[- |`]*)', line).group('prefix')
        while len(parents[-1].prefix) >= len(prefix) and parents[-1].kind != 'ASTRootNode':
            parents.pop()
        oldPrefix = prefix

        if '<<<NULL>>>' in line:
            ast = ASTNullNode({})
            ast.prefix = prefix
            ast.init()
        elif 'array filler' in line:
            ast = ASTArrayFiller({})
            ast.prefix = prefix
            ast.init()
        else:
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
        ast.root = parents[0]
        ast.rawline = rawline
        ast.line = line
        ast.lineByColor = lineByColor

        assert isinstance(ast, ASTNode)
        #print len(ast.prefix), ast.kind, ast.ptr, ast.rest

        ast.parent = parents[-1]
        ast.parent.children.append(ast)
        #print ast.parent.kind.ljust(30), line
        parents.append(ast)
        #print 'push', ast.kind
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

    def capBelow(self, pos):
        return max(pos, 0)

    def cap(self, pos):
        return min(pos, len(self.chars))

    def lineColToPos(self, line, col=None):
        if isinstance(line, SourceLocation):
            return self.lineMap[line.line][line.col]
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
            #assert self.chars[i] != '', 'overwrite not supported'
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
    #visitor = Visitor(ast, replacer)
    #visitor.visit()
    fd = file(outFileName, 'w')
    #print >>fd, str(replacer)
    print >>fd, ast.getValue()
    fd.close()

if __name__ == '__main__':
    main()

