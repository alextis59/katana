const acorn = require('acorn');
const walk = require('acorn-walk');
const ClassNode = require('./ClassNode');
const FunctionNode = require('./FunctionNode');
const VariableNode = require('./VariableNode');
const ImportNode = require('./ImportNode');

let decl_types = [];

class FileParser {
    constructor(code, filePath) {
        this.code = code;
        this.filePath = filePath;
        this.ast = null;
        this.internalClasses = [];
        this.exportedClasses = [];
        this.internalFunctions = [];
        this.exportedFunctions = [];
        this.internalVariables = [];
        this.exportedVariables = [];
        this.imports = [];
    }

    parse() {
        this.ast = acorn.parse(this.code, { ecmaVersion: 2022, sourceType: 'module' });
        this.traverseAST();
    }

    traverseAST() {
        walk.full(this.ast, (node, state, type) => {
            // console.log(node.type);
            //   console.log(node.type + " => " + this.code.substring(node.start, node.end));
            //   if(node.type === "Property"){
            //     console.log(node);
            //   }
            if (!decl_types.includes(node.type)) {
                decl_types.push(node.type);
                console.log(node.type);
            }
            switch (type) {
                case 'ImportDeclaration':
                    this.imports.push(new ImportNode(node, this.code));
                    break;
                case 'ExportNamedDeclaration':
                    console.log(node);
                    if (node.declaration) {
                        this.handleDeclaration(node.declaration, true);
                    }
                    break;
                case 'ExportDefaultDeclaration':
                    console.log(node);
                    if (node.declaration) {
                        this.handleDeclaration(node.declaration, true);
                    }
                    break;
                case 'ClassDeclaration':
                    this.handleDeclaration(node, false);
                    break;
                case 'FunctionDeclaration':
                    this.handleDeclaration(node, false);
                    break;
                case 'VariableDeclaration':
                    this.handleDeclaration(node, false);
                    break;
            }
        });
    }

    handleDeclaration(node, isExported) {
        switch (node.type) {
            case 'ClassDeclaration':
                const classNode = new ClassNode(node, this.code);
                isExported ? this.exportedClasses.push(classNode) : this.internalClasses.push(classNode);
                break;
            case 'FunctionDeclaration':
                const functionNode = new FunctionNode(node, this.code);
                isExported ? this.exportedFunctions.push(functionNode) : this.internalFunctions.push(functionNode);
                break;
            case 'VariableDeclaration':
                node.declarations.forEach(decl => {
                    if (decl.init && decl.init.type === 'ObjectExpression') {
                        // Handle object with multiple function declarations
                        decl.init.properties.forEach(prop => {
                            if (prop.value.type === 'FunctionExpression') {
                                const functionNode = new FunctionNode({
                                    ...prop.value,
                                    id: prop.key
                                }, this.code);
                                isExported ? this.exportedFunctions.push(functionNode) : this.internalFunctions.push(functionNode);
                            }
                        });
                    } else {
                        const variableNode = new VariableNode(decl, this.code);
                        isExported ? this.exportedVariables.push(variableNode) : this.internalVariables.push(variableNode);
                    }
                });
                break;
        }
    }

    getInternalClasses() {
        return this.internalClasses;
    }

    getExportedClasses() {
        return this.exportedClasses;
    }

    getInternalFunctions() {
        return this.internalFunctions;
    }

    getExportedFunctions() {
        return this.exportedFunctions;
    }

    getInternalVariables() {
        return this.internalVariables;
    }

    getExportedVariables() {
        return this.exportedVariables;
    }

    getImports() {
        return this.imports;
    }
}

module.exports = FileParser;