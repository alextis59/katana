const { parse } = require('@babel/parser'),
    traverse = require('@babel/traverse').default,
    utils = require('./utils'),
    dependencies = require('./dependencies'),
    js_doc_parser = require('./js_doc');

function preprocessCode(code) {
    // Handle methods with no parameters (empty parentheses)
    code = code.replace(/(\w+)\s*:\s*\(\s*\)\s*=>\s*\{/g, '$1() {');

    // Handle methods with parameters in parentheses
    code = code.replace(/(\w+)\s*:\s*\(([^)]*?)\)\s*=>\s*\{/g, '$1($2) {');

    // Handle methods with a single parameter without parentheses
    code = code.replace(/(\w+)\s*:\s*([^\s=>(){}]+)\s*=>\s*\{/g, '$1($2) {');

    return code;
}

const self = {

    parseClassFromCode: (file_code, dependencies_libs, class_code, name) => {
        let class_function_map = {};
        let class_variable_map = {};
        // Create the class data object
        const class_info = self.getClassInfoFromCode(class_code, name);

        for (let method of class_info.methods) {
            let method_code = method.code;
            while(method_code[0] === ' '){
                method_code = method_code.slice(1);
            }
            let data = {
                name: method.name,
                code: method_code,
                indent: utils.computeCodeIndent(file_code, method_code) || "",
                dependencies: dependencies.computeCodeLibsDependencies(method_code, dependencies_libs),
                js_doc: "",
                external_source: false,
                lines_indexes: utils.computeTargetLinesIndexes(file_code, method_code)
            }
            let js_doc_data = js_doc_parser.extractTargetJsDoc(file_code, data.lines_indexes.start);
            if (js_doc_data.js_doc) {
                data.js_doc = js_doc_data.js_doc;
                data.js_doc_lines_indexes = js_doc_data.js_doc_lines_indexes;
            }
            class_function_map[method.name] = data;
        }
        for (let property of class_info.properties) {
            let property_code = property.code;
            let data = {
                name: property.name,
                code: property_code,
                indent: utils.computeVariableIndent(file_code, property.name) || "",
                dependencies: dependencies.computeCodeLibsDependencies(property_code, dependencies_libs),
                js_doc: "",
                external_source: false,
                lines_indexes: utils.computeTargetLinesIndexes(file_code, property_code)
            }
            let js_doc_data = js_doc_parser.extractTargetJsDoc(file_code, data.lines_indexes.start);
            if (js_doc_data.js_doc) {
                data.js_doc = js_doc_data.js_doc;
                data.js_doc_lines_indexes = js_doc_data.js_doc_lines_indexes;
            }
            class_variable_map[property.name] = data;
        }

        let class_data = {
            name: name,
            code: class_code,
            indent: utils.computeCodeIndent(file_code, class_code) || "",
            dependencies: dependencies.computeClassLibsDependencies(class_info, dependencies_libs),
            js_doc: '',
            external_source: false,
            function_map: class_function_map,
            variable_map: class_variable_map,
            lines_indexes: utils.computeTargetLinesIndexes(file_code, class_code),
            extends: class_info.extends
        };

        // Extract JSDoc for the class
        let js_doc_data = js_doc_parser.extractTargetJsDoc(file_code, class_data.lines_indexes.start);
        if (js_doc_data.js_doc) {
            class_data.js_doc = js_doc_data.js_doc;
            class_data.js_doc_lines_indexes = js_doc_data.js_doc_lines_indexes;
        }

        return class_data;
    },

    getClassInfoWithCode: (classDefinition) => {
        return self.getClassInfoFromCode(classDefinition.toString(), classDefinition.name);
    },

    getClassInfoFromCode: (originalCode, name) => {
        let code = originalCode;
        let className = name || 'AnonymousClass';
        // If code does not contain the class name, insert it
        if (!code.includes('class ' + className)) {
            code = code.replace('class ', 'class ' + className + ' ');
        }

        const classInfo = {
            name: className,
            properties: [],
            methods: [],
            staticProperties: [],
            staticMethods: [],
            code: originalCode,
            extends: []
        };

        let ast;
        try{
            ast = parse(code, {
                sourceType: 'unambiguous',
                plugins: ['all'],  // Enable all available plugins  
                allowReturnOutsideFunction: true,
                allowSuperOutsideMethod: true,
                allowUndeclaredExports: true,
                strictMode: false
            });
        }catch(err){
            ast = parse(preprocessCode(code), {
                sourceType: 'unambiguous',
                plugins: ['all'],  // Enable all available plugins  
                allowReturnOutsideFunction: true,
                allowSuperOutsideMethod: true,
                allowUndeclaredExports: true,
                strictMode: false
            });
        }

        // Find the ClassDeclaration node
        let classNode = null;

        traverse(ast, {
            ClassDeclaration(path) {
                classNode = path.node;
                path.stop();
            },
            ClassExpression(path) {
                classNode = path.node;
                path.stop();
            }
        });

        if (!classNode) {
            throw new Error('No class declaration found in the provided code.');
        }

        // Get the superclass if any
        if (classNode.superClass) {
            if (classNode.superClass.type === 'Identifier') {
                classInfo.extends.push(classNode.superClass.name);
            } else {
                classInfo.extends.push('UnknownSuperClass');
            }
        }

        // Process class body
        const classBody = classNode.body;

        classBody.body.forEach(element => {
            if (element.type === 'ClassMethod') {
                // This is a method
                const methodName = element.key.name;
                const isStatic = element.static;
                const methodCode = utils.getCodeLinesFromIndexes(code, element.loc.start.line - 1, element.loc.end.line - 1);
                // const methodCode = code.slice(element.start, element.end);

                const methodInfo = {
                    name: methodName,
                    code: methodCode
                };

                if (isStatic) {
                    classInfo.staticMethods.push(methodInfo);
                } else {
                    classInfo.methods.push(methodInfo);
                }
            } else if (element.type === 'ClassProperty') {
                // This is a class field (property or method defined using class field syntax)
                const propName = element.key.name;
                const isStatic = element.static;

                const propCode = code.slice(element.start, element.end);
                const propValue = element.value ? code.slice(element.value.start, element.value.end) : null;

                const propInfo = {
                    name: propName,
                    value: propValue,
                    code: propCode
                };

                // Determine if it's a method or a property
                if (element.value && (element.value.type === 'ArrowFunctionExpression' || element.value.type === 'FunctionExpression')) {
                    // It's a method
                    if (isStatic) {
                        classInfo.staticMethods.push(propInfo);
                    } else {
                        classInfo.methods.push(propInfo);
                    }
                } else {
                    // It's a property
                    if (isStatic) {
                        classInfo.staticProperties.push(propInfo);
                    } else {
                        classInfo.properties.push(propInfo);
                    }
                }
            }
        });

        return classInfo;
    }

}

module.exports = self;