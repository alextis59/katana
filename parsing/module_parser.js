const _ = require('lodash'),
    config = require('../config'),
    utils = require('../lib/utils'),
    code_utils = require('../lib/code_utils'),
    esprima = require('esprima-next'),
    escodegen = require('escodegen'),
    class_parser = require('./parsers/class'),
    function_parser = require('./parsers/function'),
    variable_parser = require('./parsers/variable'),
    js_doc_parser = require('./parsers/js_doc'),
    dependencies_parser = require('./parsers/dependencies'),
    parser_utils = require('./parsers/utils');

function computeCodeInternalDependencies(code, file) {
    let targets = [],
        dependencies = [];
    for (let type of ['function', 'class', 'variable']) {
        for (let name in file['internal_' + type + '_map']) {
            targets.push({ name, type });
        }
    }
    for (let target of targets) {
        if (dependencies_parser.findLibUsageIndex(code, target.name) !== null) {
            dependencies.push({
                name: file.module_name,
                project_path: file.project_path,
                target: target.name,
                type: target.type,
                depth: 0,
                internal: true
            });
        }
    }
    return dependencies;
}

function computeClassInternalDependencies(class_def, file) {
    let dependencies = computeCodeInternalDependencies(class_def.code, file);
    for (let class_name of class_def.extends) {
        if (file.internal_class_map[class_name]) {
            dependencies.push({
                name: file.module_name,
                project_path: file.project_path,
                target: class_name,
                type: 'class',
                depth: 0,
                internal: true
            })
        } else if (file.class_map[class_name]) {
            dependencies.push({
                name: file.module_name,
                project_path: file.project_path,
                target: class_name,
                type: 'class',
                depth: 0
            })
        }
    }
    return dependencies;
}

function computeFileInternalDependencies(file) {
    for (let name in file.function_map) {
        let target = file.function_map[name];
        target.dependencies = _.uniq([...target.dependencies, ...computeCodeInternalDependencies(target.code, file)]);
    }
    for (let name in file.class_map) {
        let target = file.class_map[name];
        target.dependencies = _.uniq([...target.dependencies, ...computeClassInternalDependencies(target, file)]);
        for (let method_name in target.function_map) {
            let method = target.function_map[method_name];
            method.dependencies = _.uniq([...method.dependencies, ...computeCodeInternalDependencies(method.code, file)]);
        }
    }
    for (let name in file.internal_function_map) {
        let target = file.internal_function_map[name];
        target.dependencies = _.uniq([...target.dependencies, ...computeCodeInternalDependencies(target.code, file)]);
    }
    for (let name in file.internal_class_map) {
        let target = file.internal_class_map[name];
        target.dependencies = _.uniq([...target.dependencies, ...computeClassInternalDependencies(target, file)]);
        for (let method_name in target.function_map) {
            let method = target.function_map[method_name];
            method.dependencies = _.uniq([...method.dependencies, ...computeCodeInternalDependencies(method.code, file)]);
        }
    }
}

function parseCode(code, dependencies_libs, export_name) {
    let function_map = {};
    let variable_map = {};
    let class_map = {};
    let internal_function_map = {};
    let internal_variable_map = {};
    let internal_class_map = {};

    try {
        const ast = esprima.parseScript(code, { range: true, tokens: true, comment: true });

        for (const node of ast.body) {
            // Handle ES6 named exports
            if (node.type === 'ExportNamedDeclaration') {
                if (node.declaration) {
                    if (node.declaration.type === 'FunctionDeclaration') {
                        const functionName = node.declaration.id.name;
                        const function_code = code.slice(node.declaration.range[0], node.declaration.range[1]);
                        function_map[functionName] = function_parser.parseFunctionFromCode(code, dependencies_libs, function_code, functionName);
                    } else if (node.declaration.type === 'VariableDeclaration') {
                        for (const declarator of node.declaration.declarations) {
                            if (declarator.id.type === 'Identifier') {
                                const variableName = declarator.id.name;
                                const variable_code = code.slice(declarator.range[0], declarator.range[1]);
                                variable_map[variableName] = variable_parser.parseVariableFromCode(code, dependencies_libs, variable_code, variableName);
                            }
                        }
                    } else if (node.declaration.type === 'ClassDeclaration') {
                        const className = node.declaration.id.name;
                        const class_code = code.slice(node.declaration.range[0], node.declaration.range[1]);
                        class_map[className] = class_parser.parseClassFromCode(code, dependencies_libs, class_code, className);
                    }
                }
            }

            // Handle CommonJS exports
            if (node.type === 'ExpressionStatement' &&
                node.expression.type === 'AssignmentExpression' &&
                node.expression.left.type === 'MemberExpression' &&
                node.expression.left.object.name === 'module' &&
                node.expression.left.property.name === 'exports') {
                if (node.expression.right.type === 'ObjectExpression') {
                    for (const prop of node.expression.right.properties) {
                        if (prop.value.type === 'FunctionExpression' || prop.value.type === 'ArrowFunctionExpression') {
                            const functionName = prop.key.name || prop.key.value;
                            const function_code = code.slice(prop.value.range[0], prop.value.range[1]);
                            function_map[functionName] = function_parser.parseFunctionFromCode(code, dependencies_libs, function_code, functionName);
                        } else if (prop.value.type === 'Identifier' || prop.value.type === 'Literal' || prop.value.type === 'ObjectExpression' || prop.value.type === 'ArrayExpression') {
                            const variableName = prop.key.name || prop.key.value;
                            const variable_code = code.slice(prop.range[0], prop.range[1]);
                            variable_map[variableName] = variable_parser.parseVariableFromCode(code, dependencies_libs, variable_code, variableName);
                        } else if (prop.value.type === 'ClassExpression') {
                            const className = prop.key.name || prop.key.value;
                            const class_code = code.slice(prop.value.range[0], prop.value.range[1]);
                            class_map[className] = class_parser.parseClassFromCode(code, dependencies_libs, class_code, className);
                        }
                    }
                } else if (node.expression.right.type === 'Identifier') {
                    const objectName = node.expression.right.name;
                    const objectDeclaration = ast.body.find(n => n.type === 'VariableDeclaration' && n.declarations.some(d => d.id.name === objectName));
                    if (objectDeclaration) {
                        const declarator = objectDeclaration.declarations.find(d => d.id.name === objectName);
                        if (declarator.init.type === 'ObjectExpression') {
                            for (const prop of declarator.init.properties) {
                                if (prop.value.type === 'FunctionExpression' || prop.value.type === 'ArrowFunctionExpression') {
                                    const functionName = prop.key.name || prop.key.value;
                                    const function_code = code.slice(prop.value.range[0], prop.value.range[1]);
                                    function_map[functionName] = function_parser.parseFunctionFromCode(code, dependencies_libs, function_code, functionName);
                                } else if (prop.value.type === 'Identifier' || prop.value.type === 'Literal' || prop.value.type === 'ObjectExpression' || prop.value.type === 'ArrayExpression') {
                                    const variableName = prop.key.name || prop.key.value;
                                    const variable_code = code.slice(prop.range[0], prop.range[1]);
                                    variable_map[variableName] = variable_parser.parseVariableFromCode(code, dependencies_libs, variable_code, variableName);
                                } else if (prop.value.type === 'ClassExpression') {
                                    const className = prop.key.name || prop.key.value;
                                    const class_code = code.slice(prop.value.range[0], prop.value.range[1]);
                                    class_map[className] = class_parser.parseClassFromCode(code, dependencies_libs, class_code, className);
                                }
                            }
                        }
                    }
                }
            }

            // Handle internal functions
            if (node.type === 'FunctionDeclaration') {
                const functionName = node.id.name;
                const function_code = code.slice(node.range[0], node.range[1]);
                internal_function_map[functionName] = function_parser.parseFunctionFromCode(code, dependencies_libs, function_code, functionName);
            }

            // Handle internal variables
            if (node.type === 'VariableDeclaration') {
                for (const declarator of node.declarations) {
                    if (declarator.id.type === 'Identifier') {
                        const variableName = declarator.id.name;
                        const variable_code = code.slice(declarator.range[0], declarator.range[1]);
                        if (!variable_code.includes('require') && variableName !== export_name) {
                            internal_variable_map[variableName] = variable_parser.parseVariableFromCode(code, dependencies_libs, variable_code, variableName);
                        }
                    }
                }
            }

            // Handle internal classes
            if (node.type === 'ClassDeclaration') {
                const className = node.id.name;
                const class_code = code.slice(node.range[0], node.range[1]);
                internal_class_map[className] = class_parser.parseClassFromCode(code, dependencies_libs, class_code, className);
            }
        }
    } catch (err) {
        console.log('Error while parsing code');
        console.log(err);
    }

    return {
        function_map,
        variable_map,
        class_map,
        internal_function_map,
        internal_variable_map,
        internal_class_map
    };
}

let parsing_error_path_list = [],
    unexpected_export_name_list = [],
    function_export_warning_list = [];

const self = {

    extractRequires: dependencies_parser.extractRequires,

    extractExportInfo: (content) => {
        const ast = esprima.parseScript(content, { range: true });
        let exportName = undefined;
        let exportType = undefined;
        let exportedEntity = undefined;
        let exportRange = undefined;

        for (const node of ast.body) {
            if (node.type === 'ExpressionStatement' &&
                node.expression.type === 'AssignmentExpression' &&
                node.expression.left.object &&
                node.expression.left.object.name === 'module' &&
                node.expression.left.property &&
                node.expression.left.property.name === 'exports') {

                const right = node.expression.right;

                if (right.type === 'Identifier') {
                    exportName = right.name;
                    // Further analysis to determine type
                    exportedEntity = self.findDeclaration(ast, right.name);
                    exportType = self.determineType(exportedEntity);
                    if (exportedEntity && exportedEntity.range) {
                        exportRange = exportedEntity.range;
                    }
                } else if (right.type === 'ObjectExpression') {
                    exportName = 'self';
                    exportType = 'object';
                    exportedEntity = right;
                    exportRange = right.range;
                } else if (right.type === 'FunctionExpression' || right.type === 'ArrowFunctionExpression') {
                    exportType = 'function';
                    exportedEntity = right;
                    exportRange = right.range;
                } else if (right.type === 'ClassExpression') {
                    exportType = 'class';
                    exportedEntity = right;
                    exportRange = right.range;
                } else {
                    exportType = typeof right.value;
                    exportedEntity = right;
                    exportRange = right.range;
                }
                break;
            }
        }

        let code;
        if(exportedEntity){
            try{
                code = content.substring(exportRange[0], exportRange[1]);
                // code = escodegen.generate(exportedEntity);
            }catch(err){
                code = content.substring(exportRange[0], exportRange[1]);
            }
        }
        

        return { 
            name: exportName, 
            type: exportType, 
            code: code
        };
    },

    findDeclaration: (ast, name) => {
        for (const node of ast.body) {
            if (node.type === 'FunctionDeclaration' && node.id.name === name) {
                return node;
            }
            if (node.type === 'ClassDeclaration' && node.id.name === name) {
                return node;
            }
            if (node.type === 'VariableDeclaration') {
                for (const decl of node.declarations) {
                    if (decl.id.name === name) {
                        return decl.init;
                    }
                }
            }
        }
        return undefined;
    },

    determineType: (node) => {
        if (!node) return undefined;
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
            return 'function';
        }
        if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
            return 'class';
        }
        if (node.type === 'ObjectExpression') {
            return 'object';
        }
        return typeof node.value;
    },

    parseModule: (file) => {
        let function_map = {},
            internal_function_map = {},
            variable_map = {},
            internal_variable_map = {},
            class_map = {},
            internal_class_map = {},
            dependencies_libs = _.cloneDeep(file.libs);
        try {
            const export_info = self.extractExportInfo(file.content);
            let export_name = export_info.name,
                export_type = export_info.type;

            if (!export_name) {
                if (unexpected_export_name_list.indexOf(file.absolute_path) === -1) {
                    // console.log(`Unexpected type of module exports in file: ` + file.name);
                    unexpected_export_name_list.push(file.absolute_path);
                }
            }

            file.export_type = export_type;
            file.export_name = export_name || file.module_name;

            if (export_name) {
                dependencies_libs.push({
                    name: file.export_name,
                    project_path: file.project_path,
                    local: true
                });
            }
            let export_parsed = false;
            if (file.export_name) {
                if (export_type === 'function') {
                    let code = export_info.code;
                    function_map['.'] = function_parser.parseFunctionFromCode(file.content, dependencies_libs, code, '.');
                    export_parsed = true;
                } else if (export_type === 'class') {
                    try{
                        let class_info = class_parser.getClassInfoFromCode(export_info.code, export_name);
                        class_map[class_info.name] = class_parser.parseClassFromCode(file.content, dependencies_libs, class_info.code, class_info.name);
                        export_parsed = true;
                    }catch(err){
                        console.log(err);
                        process.exit(1);
                    }
                    
                }
            }
            let code_maps = parseCode(file.content, dependencies_libs, export_name);
            if (!export_parsed) {
                function_map = code_maps.function_map;
                variable_map = code_maps.variable_map;
                class_map = code_maps.class_map;
            }
            internal_function_map = code_maps.internal_function_map;
            internal_variable_map = code_maps.internal_variable_map;
            internal_class_map = code_maps.internal_class_map;
        } catch (e) {
            if (parsing_error_path_list.indexOf(file.absolute_path) === -1) {
                console.log('Error while parsing module: ' + file.absolute_path);
                console.log(e);
                parsing_error_path_list.push(file.absolute_path);
            }
            file.export_name = file.export_name || file.module_name;
            file.parsing_error = true;
        }
        file.function_map = function_map;
        file.internal_function_map = internal_function_map;
        file.variable_map = variable_map;
        file.internal_variable_map = internal_variable_map;
        file.class_map = class_map;
        file.internal_class_map = internal_class_map;
        self.postProcessExports(file);
        self.computeFileLinesIndexes(file);
        computeFileInternalDependencies(file);
    },

    postProcessExports: (file) => {
        for(let name in file.variable_map){
            let variable = file.variable_map[name];
            if(variable.code === name){
                for(let target_type of ['function', 'class']){
                    if(file['internal_' + target_type + '_map'][name]){
                        file[target_type + '_map'][name] = file['internal_' + target_type + '_map'][name];
                        delete file['internal_' + target_type + '_map'][name];
                        delete file.variable_map[name];
                        break;
                    }
                }
            }
        }
    },

    computeFileLinesIndexes: (file) => {
        let content = file.content;
        for (let function_name in file.function_map) {
            let target = file.function_map[function_name];
            try {
                target.lines_indexes = parser_utils.computeTargetLinesIndexes(content, target.code);
                if (target.lines_indexes && target.js_doc) {
                    let js_doc_indexes = parser_utils.computeTargetLinesIndexes(content, target.js_doc);
                    if (js_doc_indexes) {
                        target.js_doc_lines_indexes = js_doc_indexes;
                        if (js_doc_indexes.start < target.lines_indexes.start) {
                            target.lines_indexes.start = js_doc_indexes.start;
                        }
                    }
                }
            } catch (err) {
                console.log('Error while computing lines indexes for function: ' + function_name);
                console.log(err);
            }
        }
        for (let variable_name in file.variable_map) {
            let target = file.variable_map[variable_name];
            try {
                target.lines_indexes = parser_utils.computeTargetLinesIndexes(content, target.code);
                if (target.lines_indexes && target.js_doc) {
                    let js_doc_indexes = parser_utils.computeTargetLinesIndexes(content, target.js_doc);
                    if (js_doc_indexes) {
                        target.js_doc_lines_indexes = js_doc_indexes;
                        if (js_doc_indexes.start < target.lines_indexes.start) {
                            target.lines_indexes.start = js_doc_indexes.start;
                        }
                    }
                }
            } catch (err) {
                console.log('Error while computing lines indexes for variable: ' + variable_name);
                console.log(err);
            }
        }
    },

    getModuleTargetDependenciesMap: (project, project_path, { name, type, internal }, options = {}) => {
        let use_filter = options.use_filter || true,
            min_depth = options.min_depth || 0,
            max_depth = options.max_depth || 0,
            filters = config.dependencies_filter,
            file = project.getFile(project_path),
            dependencies = _.get(file, (internal ? 'internal_' : "") + type + '_map.' + name + '.dependencies', []),
            map = {};
        for (let dependency of dependencies) {
            if (dependency.type !== 'unknown') {
                if (use_filter && (filters[dependency.project_path] === true ||
                    (filters[dependency.project_path] && filters[dependency.project_path].indexOf(dependency.target) > -1))) {
                    continue;
                } else if (dependency.depth > max_depth) {
                    continue;
                } else if (dependency.depth < min_depth) {
                    continue;
                }
                map[dependency.project_path] = map[dependency.project_path] || {};
                map[dependency.project_path][dependency.target] = dependency.internal ? 'internal_' + dependency.type : dependency.type;
            }
        }
        return map;
    }

}

module.exports = self;