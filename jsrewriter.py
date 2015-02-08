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
import argparse
from collections import Counter

defaultValues = {
    'int': '0',
    'char': '0',
    'short': '0',
    'long': '0',
    'long long': '0',
    'float': '0.0',
    'double': '0.0'
    }

JSBUILTINS = '''break
case
class
catch
const
continue
debugger
default
delete
do
else
export
extends
finally
for
function
if
import
in
instanceof
let
new
return
super
switch
this
throw
try
typeof
var
void
while
with
yield'''.splitlines()

BUILTINS = '''getSaveLine
_l
_r1
_r2
_r3
_n
C
'''.splitlines()

def indent(s):
    # indent all
    s = re.sub(r'^', '    ', s, flags=re.MULTILINE)
    # but not blank lines
    s = re.sub(r'^\s*$', '', s, flags=re.MULTILINE)
    return s

class Util(object):
    @staticmethod
    def isPrimitive(typeName):
        return typeName.split(' ')[-1] in [
                'int',
                'long',
                'char',
                'short',
                'float',
                'double'
                ]

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

    # TODO: move to Util
    def isID(self, expr):
        return re.search('^[A-Za-z0-9_]+$', expr)

    def find(self, filter):
        if filter(self):
            yield self
        for child in self.children:
            for found in child.find(filter):
                yield found

    def getPosition(self):
        return [i for i, x in enumerate(self.parent.children) if x == self][0]

    def getChildrenRecursive(self, childFilter=None):
        for child in self.children:
            yield child
            if childFilter == None or childFilter(child):
                for grandChild in child.getChildrenRecursive(childFilter):
                    yield grandChild

    def getVarNames(self, childFilter=None):
        'get all variable names for moving them up in the hierarchy'
        def getVarNamesH(node, compoundParent):
            if node.kind == "CompoundStmt":
                compoundParent = node
                compoundParent.variables = []
            elif node.kind == "VarDecl" and node.declared == False:
                varName = node.getVarName()
                varNames[varName] = True
                counter[varName] += 1
                if counter[varName] > 1:
                    shadowVars = True
                compoundParent.variables.append(node)
                variables.append(node)
            for child in node.children:
                if childFilter == None or childFilter(child):
                    getVarNamesH(child, compoundParent)
            if node.kind == "CompoundStmt":
                for var in compoundParent.variables:
                    varName = node.getVarName()
                    counter[varName] -= 1

        counter = Counter()
        shadowVars = False
        variables = []
        varNames = {}
        getVarNamesH(self, None)
        varNames = varNames.keys()

        if len(varNames) > 0:
            statement = 'var ' + ', '.join(varNames) + ';\n'
        else:
            statement = ''
        return {'varNames': varNames,
                'statement': statement,
                'variables': variables,
                'shadowVars': shadowVars}

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

    # TODO: static, could be moved to Util
    def getBracketNum(self, s):
        return re.search('\[([0-9]+)\]', s).group(1)

    def getValue(self):
        print 'warning, default handler for: ', self.kind
        return self.getChildValues()

    def getVarName(self):
        varNames = filter(lambda x: x[0] == '[0;1;36', self.lineByColor)
        if len(varNames) > 0:
            varName = varNames[0][1]
            varName = varName.strip()
            varName = varName.strip("'")
            if varName in self.root.builtins:
                print "Renamed var", varName
                varName = varName + '_'
        else:
            varName = None
        return varName

    def getVarType(self):
        varType = filter(lambda x: x[0] == '[0;32', self.lineByColor)[0][1]
        varType = varType.strip("'")
        return varType

    def getLastVarType(self):
        varType = filter(lambda x: x[0] == '[0;32', self.lineByColor)[-1][1]
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
            if start.filename == None:
                start.filename = self.root.filename
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

    def getLogStatement(self, extra):
        extent = self.getExtent()
        s = '_log("%s:%s at %s:%s:%s = %s\\n");\n' % (
                str(self.kind),
                str(self.getVarName()),
                str(extent.start.filename),
                str(extent.start.line),
                str(extent.start.col),
                extra)
        return s

    def rewrite(self, replacer):
        pass

class ASTRootNode(ASTNode):
    def __init__(self):
        self.kind = 'ASTRootNode'
        self.prefix = ''
        self.location = 0
        self.children = []
        self.builtins = JSBUILTINS + BUILTINS
        self.externs = {}
        self.typedefs = {}
        self.records = {}

    def getValue(self):
        return self.getChildValues()

    def getLastType(self, typeName):
        if "':'" in typeName:
            typeName = typeName.split("':'")[-1].strip("'")
        return typeName

    def resolveType(self, typeName):
        old = None
        typeName = self.getLastType(typeName)
        while typeName in self.typedefs and old != typeName:
            old = typeName
            typeName = self.typedefs[typeName]
            typeName = self.getLastType(typeName)
        return typeName

    def resolvePrimType(self, varType):
        primType = varType
        old = None
        while primType != old:
            old = primType
            primType = self.removeGeneralType(primType)
            primType = self.removeLengthSpecifier(primType)
            primType = self.removeSignSpecifier(primType)
            primType = self.removeOtherSpecifiers(primType)

            primType = self.resolveType(primType)

            primType = self.removeGeneralType(primType)
            primType = self.removeLengthSpecifier(primType)
            primType = self.removeSignSpecifier(primType)
            primType = self.removeOtherSpecifiers(primType)
        return primType

    def getDefaultInitializer(self, varType):
        if '*' in varType:
            initializer = '_n'
        else:
            varType = self.resolveType(varType)
            #print 'resolve: ', varType
            primType = self.removeSignSpecifier(varType) #.split(' ')[-1]
            # TODO: multidim arrays
            arraySize = self.getLengthSpecifier(varType)
            if arraySize:
                primType = self.resolvePrimType(varType)
                #print "array", varType, primType, arraySize
                if primType in defaultValues:
                    defaultValue = defaultValues[primType]
                    initializer = 'C.fillArray(%s, %d)' % (defaultValue, arraySize)
                else:
                    if primType == '__va_list_tag':
                        initializer = 'new %s()' % (primType)
                    else:
                        assert primType != 'void'
                        initializer = 'C.typedArray(%s, %d)' % (primType, arraySize)
            elif primType in defaultValues:
                initializer = defaultValues[primType]
            else:
                initializer = 'new %s()' % self.removeGeneralType(varType)
        return initializer

    def removeOtherSpecifiers(self, varType):
        return re.sub('(const)\s*', '', varType)

    def removeSignSpecifier(self, varType):
        return re.sub('((signed)|(unsigned))\s*', '', varType)

    def removeGeneralType(self, varType):
        return re.sub('((union)|(enum)|(struct))\s*', '', varType)

    def removeLengthSpecifier(self, varType):
        return re.sub('\s*\[([0-9]+)\]', '', varType)

    def getLengthSpecifier(self, varType):
        match = re.search('\[([0-9]+)\]', varType)
        if match:
            match = int(match.group(1))
        return match

    def renameField(self, field):
        if field in ['_s1', 'length']:
            print 'renaming field: %s' % field
            field = field + '_'
        return field

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
    "usually we don't care about it"

    def getValue(self):
        assert len(self.children) == 0
        return ''


class ArraySubscriptExpr(ASTNode):

    def getValue(self):
        c1, c2 = self.children
        val1 = c1.getValue()
        val2 = c2.getValue()
        return '%s._s1(%s).x' % (val1, val2)

class AsmLabelAttr(ASTAttr): pass

class BinaryOperator(ASTNode):

    def overridePointerArithmetic(self, c1, c2, val1, val2, t1, t2, operator):
        ptr = False
        hasPtr = False
        if '*' in t1:
            ptr = val1
            other = val2
            otherAsPtr = ''
            hasPtr = True
            switched = False
        elif '*' in t2:
            ptr = val2
            other = val1
            hasPtr = True
            switched = True
        if '*' in t1 and '*' in t2:
            both = True
        if hasPtr:
            #if operator != '=':
            #print 'operator', val1, operator, val2, t1, t2
            s = None
            if operator == '=':
                if 'NullToPointer' in c2.line:
                    s = '%s = _n' % ptr
                    return s
                #elif c1.kind == "ArraySubscriptExpr":
                #    c1, c2 = self.children
                #    val1 = c1.getValue()
                #    val2 = c2.getValue()
                #    s = '%s._s1(%s)' % (val1, val2)
                #    return s
            # Override pointer arithmetic
            elif operator == '==':
                s = '%s.eq(%s)'
            elif operator == '!=':
                s = '%s.ne(%s)'
            elif operator == '+':
                s = '%s.p(%s)'
            elif operator == '-':
                s = '%s.m(%s)'
            elif operator == '/':
                s = '%s.div(%s)'
            elif operator == '*':
                s = '%s.mul(%s)'
            elif operator == '>':
                if switched:
                    s = '%s.lt(%s)'
                else:
                    s = '%s.gt(%s)'
            elif operator == '<':
                if switched:
                    s = '%s.gt(%s)'
                else:
                    s = '%s.lt(%s)'
            elif operator == '>=':
                if switched:
                    s = '%s.le(%s)'
                else:
                    s = '%s.ge(%s)'
            elif operator == '<=':
                if switched:
                    s = '%s.ge(%s)'
                else:
                    s = '%s.le(%s)'
            elif operator == ',':
                s = None
            else:
                assert False, ('BINARY PTR OPERATOR', operator)
            if s != None:
                return s % (ptr, other)
        return None

    def getValue(self):
        c1, c2 = self.children
        val1 = c1.getValue()
        val2 = c2.getValue()
        operator = self.getOperator()
        t1, t2 = c1.getVarType(), c2.getVarType()
        s = self.overridePointerArithmetic(c1, c2, val1, val2, t1, t2, operator)
        if s != None:
            return s
        s = '%s %s %s' % (val1, operator, val2)
        if operator in ['+', '-', '*', '/']:
            # coerce to int32
            s = '((%s) >>> 0)' % s
        return s

class BreakStmt(ASTNode):
    def getValue(self):
        return 'break;\n'

class CallExpr(ASTNode):

    def overrideFunctions(self, fexpr, fexprValue, values):
        allocs = ['alloc', 'malloc']
        s = None
        if (fexprValue in allocs):
            if ((self.parent.kind == "CStyleCastExpr" or
                self.parent.kind == "ImplicitCastExpr") and
                not 'void' in self.parent.getVarType()):
                varType = self.parent.getVarType()
            else:
                # Will be return type of alloc function, like char_u or void*,
                # but looks like result is of same type.
                varType = self.getVarType()
            if '*' in varType:
                primType = self.root.resolvePrimType(varType.strip(' *'))
                sizeExpr = values[0]
                if primType in defaultValues:
                    defaultValue = defaultValues[primType]
                    if primType == 'char':
                        s = 'C.fillString(%s, %s)' % (defaultValue, sizeExpr)
                    else:
                        s = 'C.fillArray(%s, %s)' % (defaultValue, sizeExpr)
                else:
                    assert primType != 'void'
                    s = 'C.typedArray(%s, %s)' % (primType, sizeExpr)
            else:
                initializer = self.root.getDefaultInitializer(varType)
                s = initializer
            return [s, fexprValue]
        elif fexprValue == 'calloc':
            assert False, 'not implemented'
        elif fexprValue == 'printf':
            fexprValue = '_printf'
        elif fexprValue == 'puts':
            fexprValue = '_puts'
        elif fexprValue == 'memset':
            # XXX: hack
            fexprValue = 'fakememset'
        elif fexprValue == '__builtin_va_start':
            fexprValue = '__va_list_start'
            values = ['arguments'] + values
        elif fexprValue == '__builtin_va_end':
            fexprValue = '__va_list_end'
        return [s, fexprValue]

    def getValue(self):
        fexpr = self.children[0]
        fexprValue = fexpr.getValue()
        childExpr = self.children[1:]
        values = [x.getValue() for x in childExpr]
        types = [self.getVarType()] + [x.getVarType() for x in childExpr]
        for i, tp in enumerate(types):
            if re.search('\*[^(]*\([^)]\)', tp):
                tp = 'function'
            elif '*' in tp:
                tp = 'ptr'
            else:
                tp = self.root.resolvePrimType(tp.strip(' *'))
            if not self.isID(tp):
                assert False, tp
            types[i] = tp
        varName = fexpr.getVarName()
        quotedTypes = ['"' + x + '"' for x in types]

        [s, fexprValue] = self.overrideFunctions(fexpr, fexprValue, values)
        if s:
            return s

        typeCheck = True
        if typeCheck:
            if len(values) > 0:
                values = [''] + values # for starting ,
            #print 'types', quotedTypes
            s = 'C.typeCheckCall("%s", [%s] %s)' % (fexprValue, ', '.join(quotedTypes), ', '.join(values))
        else:
            s = '%s(%s)' % (fexprValue, ', '.join(values))
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
        operator =  re.search("'([^']+)' ComputeLHSTy", self.rest).group(1)
        #return self.rest.split(' ')[-3].strip("'")
        return operator

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
        result = self.getVarNames(lambda y: y.kind != "CompoundStmt")
        s += result['statement']
        for child in self.children:
            s += child.getValue()
            s = re.sub(r'\s*;', ';', s);
            ss = s.rstrip()
            if not ss.endswith('}') and not ss.endswith(';'):
                s += ';\n'
        if self.parent.kind != 'SwitchStmt':
            wrap = '{' + s + '}'
        else:
            wrap = s
        return wrap

class ConditionalOperator(ASTNode):

    def getValue(self):
        condition, expr1, expr2 = self.children
        condition = condition.getValue()
        expr1 = expr1.getValue()
        #if ';' in expr1:
        #    expr1 = '( %s )' % expr1
        expr2 = expr2.getValue()
        #if ';' in expr2:
        #    expr2 = '( %s )' % expr2
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
            s += 'var %s = %s;\n' % (child.getVarName(), value)
        return s


# Handled as part of RecordDecl
class FieldDecl(ASTNode):
    pass
class Field(ASTNode):
    pass

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

class FunctionDecl(ASTNode):
    def isProtoType(self):
        return all(child.kind != 'CompoundStmt' for child in self.children)

    def getValue(self):
        if not self.isProtoType():
            varName = self.getVarName()
            if varName != None:
                fields = [x.getVarName() for x in self.children if x.kind == "ParmVarDecl"]
                for i, field in enumerate(fields):
                    # prototypes can have unnamed arguments
                    if field == None:
                        fields[i] = '_'

                result = self.getVarNames()
                if not result['shadowVars']:
                    for var in result['variables']:
                        var.declared = True

                fields = ', '.join(fields)
                body = ''.join([x.getValue() for x in self.children if x.kind != "ParmVarDecl"])
                if not result['shadowVars']:
                    body = result['statement'] + body
                s = ''
                s += 'function %s(%s) {\n' % (self.getVarName(), fields)
                s += indent(self.getLogStatement("START"))
                s += indent(body)
                s += indent(self.getLogStatement("END"))
                s += '\n}\n'
                return s
            else:
                print 'FunctionDecl', self.rawline
                assert False
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
            return 'C.fillArray(%s, %s)' % (value, size)
        else:
            varType = self.getVarType()
            varType = self.root.resolveType(varType)
            plainType = self.root.removeGeneralType(varType)
            withoutLength = self.root.removeLengthSpecifier(plainType)
            if 'anonymous' in plainType:
                print 'TODO: anonymous list init'
            # struct initialization, but not arrays
            if (not plainType in defaultValues and
                    not 'anonymous' in plainType and
                    not withoutLength != plainType):
                return '(new %s(%s))\n' % (plainType, self.getChildValues(', ').strip(', '))
            # regular array
            else:
                return '_r2([ ' + self.getChildValues(', ').strip(', ') + ' ])\n'

class IntegerLiteral(ASTNode):
    def getValue(self):
        if self.parent.kind == "CStyleCastExpr" and 'NullToPointer' in self.parent.line:
            # null pointer
            return '_n'
        else:
            varname = self.getVarName()
            return varname

class LabelStmt(ASTNode): pass
class MallocAttr(ASTAttr): pass

class MemberExpr(ASTNode):

    def getValue(self):
        member = self.getMember()
        member = self.root.renameField(member)
        expr = self.getChildValues()
        if member.startswith('.'):
            member = '.' + member[1:]
        elif member.startswith('->'):
            member = '._m().' + member[2:]
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

# TODO: handle nested RecordDecl
class RecordDecl(ASTNode):

    def isSubRecord(self):
        node = self
        while node.kind != "ASTRootNode":
            node = node.parent
            if node.kind == "RecordDecl":
                return True
        return False

    def getValue(self):
        pos = self.getPosition()
        typeDefSibling = self.parent.children[pos + 1]
        # TODO: check that it overlaps with definition
        if typeDefSibling.kind == 'TypedefDecl': # and typeDefSibling.getExtent().start.line == self.getExtent().start.line:
            varName = typeDefSibling.getVarName()
            typeDefSibling.processed = True
            varName2 = self.getVarName()
            self.root.records[varName] = self
            self.root.records[varName2] = self
        # can happen for instance with nested anonymous union or record
        elif typeDefSibling.kind == 'FieldDecl':
            varName = typeDefSibling.getVarName()
            typeDefSibling.processed = True
            varName2 = self.getVarName()
        else:
            varName = self.getVarName()
            self.root.records[varName] = self
            varName2 = None

        self.recordName = varName

        # TODO: qualified name for subrecords
        if varName != None:
            self.root.records[varName] = self
        if varName2 != None:
            self.root.records[varName2] = self

        # TODO: must be something to fix if this happens
        if varName == None:
            print 'record None', self.rawline

        subrecords = []
        subrecordValues = []
        for child in self.children:
            if child.kind == 'RecordDecl':
                subrecord = child
                subrecords.append(subrecord)
                value = child.getValue()
                subrecordValues.append(value)

        fieldNodes = [x for x in self.children if x.kind == "FieldDecl"]
        fields = [x.getVarName() for x in fieldNodes]
        fields = [self.root.renameField(x) for x in fields]
        self.size = len(fields) # will be looked up later
        for i, field in enumerate(fields):
            # prototypes have unnamed arguments
            if field == None:
                fields[i] = '_'
        types = [x.getVarType() for x in self.children if x.kind == "FieldDecl"]
        if varName2 != None:
            s = 'var %s; var %s = %s = function(%s) {\n' % (varName2, varName, varName2, ', '.join(fields))
        else:
            s = 'var %s = function(%s) {\n' % (varName, ', '.join(fields))
        body = ''
        # TODO: resolve type and lookup initializer
        for field, node, t in zip(fields, fieldNodes, types):
            initializer = self.root.getDefaultInitializer(t)
            if 'anonymous' in initializer:
                assert node.processed == True
            else:
                body += 'this.%s = %s || %s;\n' % (field, field, initializer)
        # TODO: emit subrecord in the order specified
        for subrecord, value in zip(subrecords, subrecordValues):
            body += indent(value)
            body += 'this.%s = new %s();' % (subrecord.recordName, subrecord.recordName)
        casesRead = ''
        casesWrite = ''
        for i, field in enumerate(fields):
            casesRead += 'case %d: return eval(_r1(\'_record.%s\')); break;\n' % (i, field)
        body += '''
this.length = %d;
this._s1 = function(i) {
    var _record = this;
    switch(i) {
        %s
    }
}
''' % (len(fields), casesRead)
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

    def getParentOfType(self, tp):
        node = self.parent
        while node.kind != 'ASTRootNode' and node.kind != tp:
            node = node.parent
        return node

    def getValue(self):
        s = ''
        for child in self.children:
            s += child.getValue() + '\n'
        s = 'return ' + s + ';'
        parentFunction = self.getParentOfType('FunctionDecl').getVarName()
        s = self.getLogStatement("RETURN from %s") % parentFunction + s
        return s

class ReturnsTwiceAttr(ASTAttr): pass
class SentinelAttr(ASTAttr): pass

class StmtExpr(ASTNode):
    def getValue(self):
        return self.getChildValues()

class StringLiteral(ASTNode):
    def getValue(self):
        s = '_r3(%s)' % self.getVarName()
        return s

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
        s = self.getChildValues()
        return s

class TransparentUnionAttr(ASTAttr): pass

class TypedefDecl(ASTNode):
    def getValue(self):
        typeName = self.getVarName()
        typeDef = self.getVarType()
        self.root.typedefs[typeName] = typeDef
        return ''

class UnaryExprOrTypeTraitExpr(ASTNode):

    def getValue(self):
        if 'sizeof' in self.line:
            # case 1: inside alloc/malloc. whole call should be replace with "new Class(defaultValues)"
            # case 2: else, size of array, call len
            if len(self.children) > 1:
                self.printParents()
                assert False
            tp = self.getLastVarType()
            # sizeof array
            if len(self.children) > 0:
                child = self.children[0]
                #tp = child.getVarType()
                expr = child.getValue()
                #size = self.getBracketNum(tp)
                s = '%s.length' % expr
                print 'sizeof: ', s
                return s
            # sizeof struct
            else:
                child = None
                expr = None
                varType = self.root.resolveType(tp)
                # We let records be the size number of their members.
                # Hopefully this works :), since our records are subscriptable
                # by integer index n corresponding to member number n.
                if '*' in varType or varType.split(' ')[-1] in defaultValues:
                    size = 1
                else:
                    varType = self.root.removeGeneralType(varType)
                    size = self.root.records[varType].size
                return str(size)
        else:
            assert "Unknown UnaryExprOrTypeTraitExpr"


class UnaryOperator(ASTNode):

    def getValue(self):
        assert len(self.children) == 1
        child = self.children[0]
        expr = child.getValue()
        operator = self.getOperator()

        # Override pointer arithmetic
        if '*' in self.getVarType():
            s = None
            if operator == '++':
                if 'prefix' in self.line:
                    s = '%s.pp(1)' % (expr)
                elif 'postfix':
                    s = '%s.pa(1)' % (expr)
            if operator == '--':
                if 'prefix' in self.line:
                    s = '%s.pp(-1)' % (expr)
                elif 'postfix':
                    s = '%s.pa(-1)' % (expr)
            elif operator == '+':
                s = '%s.p(0)' % (expr)
            elif operator == '-':
                s = '%s.neg(0)' % (expr)
            if s != None:
                return s
            elif operator != '*' and operator != '&':
                print 'UNARY', operator, expr

        # Override dereference and take address
        if operator == '*':
            if not self.isID(expr):
                expr = '(%s)' % expr
                print 'deref', expr
            s = '%s.x' % (expr)
            return s
        elif operator == '&':
            subVar = None
            #if not self.isID(expr):
            assert len(self.children) == 1
            tp = self.children[0].getLastVarType()
            tp = self.root.resolveType(tp)
            #print 'ref', expr, tp
            # TODO: BIG PROBLEM: ambiguity with resolving records of type _r2
            # currently only a problem if you do (*(&structvar)).member instead
            # of using ->. TODO: Detect case of member access to dereferenced
            # value.
            if 'struct' in tp:
                s = '_r2([%s])' % (expr)
            else:
                s = 'eval(_r1(\'%s\'))' % (expr)
            return s
        else:
            # Normal operators
            # TODO: be more specific about prefix/suffix token location
            space = ''
            # __extension__ is a GNU operator
            if re.search('[A-Za-z_]', operator):
                space = ' '
                #print 'JS-unsupported GNU operator', operator
                return expr
            if 'prefix' in self.line:
                return operator + space + expr
            elif 'postfix' in self.line:
                return expr + space + operator

class UnusedAttr(ASTAttr): pass

class VAArgExpr(ASTNode):
    def getValue(self):
        assert len(self.children) == 1
        child = self.children[0]
        # usually name of va_list, usually "ap"
        value = child.getValue()
        s = '%s.getNextArg()' % value
        return s

class VarDecl(ASTNode):
    def __init__(self, d):
        super(VarDecl, self).__init__(d)
        self.declared = False

    def getValue(self):
        varName = self.getVarName()
        varType = self.getVarType()
        # With initializer
        if len(self.children) > 0:
            assert len(self.children) == 1
            child = self.children[0]
            expr = child.getValue() #''.join([x.getValue() for x in self.children])
            if not 'extern' in self.line:
                #return 'var %s = %s;\n' % (varName, expr)
                # variable declarations are pulled up into compound statement
                # there are still top level var declarations though
                varPrefix = ''
                if not self.declared:
                    varPrefix = 'var '
                    self.declared = True
                if 'NullToPointer' in child.line:
                    expr = '_n'
                return varPrefix + '%s = %s;\n' % (varName, expr)
            else:
                assert False, (varName, expr)
        # Without initializer
        else:
            if not 'extern' in self.line:
                # variable declarations are pulled up into compound statement
                # but we should still return the value of the variable
                varPrefix = ''
                if not self.declared:
                    varPrefix = 'var '
                    self.declared = True
                # default initialize all variables
                initializer = self.root.getDefaultInitializer(varType)
                return varPrefix + "%s = %s;\n" % (varName, initializer)
                #return 'var %s;\n' % varName
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


def parseAST(data, filename):
    'parse AST'
    #data = re.sub(r'\033\[[^m]+m', '', data)
    parents = [ASTRootNode()]
    parents[0].filename = filename
    oldPrefix = ''
    for rawline in data.splitlines():
        line = re.sub(r'\033\[[^m]+m', '', rawline)
        lineByColor = re.findall(r'[\033](?P<color>\[[^m]+)m(?P<value>[^\033]*)', rawline)
        lineByColor = [(x, y) for (x, y) in lineByColor if y.strip() != '']
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

def sourceToJS(fname):
    return fname.replace('.c', '.js')

def main():
    'entry point'
    parser = argparse.ArgumentParser(description='Convert C to JavaScript')
    parser.add_argument('sourceFiles', metavar='sourceFiles', type=str,
            nargs='+', help='C source files. file.c.ast must exist for each file.')
    parser.add_argument('-o', dest='outputfile', type=str, help='output file')

    args = parser.parse_args()
    scriptPath = os.path.dirname(os.path.realpath(__file__))

    sourceFileNames = [os.path.join(scriptPath, 'lib', 'baselib.c')]
    sourceFileNames += args.sourceFiles
    for sourceFileName in sourceFileNames:
        print 'processing', sourceFileName
        if not sourceFileName.endswith('.c'):
            raise Exception("source filename must end with .c")
        astFileName = sourceFileName.replace('.c', '.ast')
        outFileName = sourceToJS(sourceFileName)
        sourceData = file(sourceFileName).read()
        astData = file(astFileName).read()
        ast = parseAST(astData, sourceFileName)
        #printKinds = PrintKinds(ast)
        #printKinds.printKinds()

        fd = file(outFileName, 'w')
        print >>fd, ast.getValue()
        fd.close()

    # link
    finalOutFileName = args.outputfile
    outFileName = args.outputfile
    preamblePath = os.path.join(scriptPath, 'lib', 'preamble.js')
    sprintfPath = os.path.join(scriptPath, 'jscache', 'sprintf.js')
    preamble = file(preamblePath).read()
    sprintf = file(sprintfPath).read()
    fd = file(finalOutFileName, 'w')
    print >>fd, 'var exports = {};'
    print >>fd, sprintf
    print >>fd, preamble
    for sourceFileName in sourceFileNames:
        outFileName = sourceToJS(sourceFileName)
        data = file(outFileName).read()
        print >>fd, data
    print >>fd, "main();"


if __name__ == '__main__':
    main()

