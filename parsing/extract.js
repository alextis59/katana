const _ = require('lodash'),
    module_parser = require('./module_parser'),
    code_utils = require('../lib/code_utils'),
    utils = require('../lib/utils');

const DEBUG = false;

function log(message) {
    if (DEBUG) {
        console.log('extract: ' + message);
    }
}

function shouldIncludeJsDoc(target_name, target, options = {}) {
    return target.js_doc && options.include_js_doc && (!options.exclude_js_doc_targets || options.exclude_js_doc_targets.indexOf(target_name) === -1);
}

function isTargetVariable(target_file_path, target_name, options = {}) {
    return options.target_file_path === target_file_path && options.target_variable === target_name;
}

function isTargetFunction(target_file_path, target_name, options = {}) {
    return options.target_file_path === target_file_path && options.target_function === target_name;
}

function shouldOnlyIncludePrototype(file, target_type, target_name, options = {}) {
    let target_file_path = file.absolute_path,
        target_code = file[target_type + '_map'][target_name].code; 
    if(target_code && file.content.indexOf(target_code) === -1){
        return true;
    }
    return options.only_prototypes &&
        (!options.only_prototypes_exclude_target_function || !isTargetFunction(target_file_path, target_name, options));
}

const self = {

    getTypeFromTarget: (file, target_name) => {
        if(file.function_map[target_name]){
            return {type: 'function'};
        }else if(file.variable_map[target_name]){
            return {type: 'variable'};
        }else if(file.class_map[target_name]){
            return {type: 'class'};
        }else if(file.internal_function_map[target_name]){
            return {type: 'function', internal: true};
        }else if(file.internal_variable_map[target_name]){
            return {type: 'variable', internal: true};
        }else if(file.internal_class_map[target_name]){
            return {type: 'class', internal: true};
        }else{
            throw new Error('Target ' + target_name + ' not found in ' + file.absolute_path);
        }
    },

    extractModuleTarget: (project, file, {name, type, internal}, options = {}) => {
        log('Extracting code from ' + file.name + ' for ' + type + ' ' + name);
        options = Object.assign(_.cloneDeep(options), { target_file_path: file.absolute_path });
        options['target_' + type] = name;
        if (options.include_dependencies) {
            return self.buildModuleTargetAndDependenciesExtract(project, file, {name, type, internal}, options)
        }
        let targets = {},
            target_type_name = (internal ? "internal_": "") + type + '_list';
        targets[target_type_name] = [name];
        return self.buildModuleExtract(project, file.project_path, targets, options);
    },

    buildVariableExtract: (file, variable_name, options = {}) => {
        let extract = "",
            indent = options.indent || '    ',
            target = file.variable_map[variable_name];
        if (!target) {
            // console.error('Variable ' + variable_name + ' not found in ' + file.absolute_path);
            return "";
            process.exit(1);
        }
        if (!options.without_js_doc && shouldIncludeJsDoc(variable_name, target, options)) {
            extract += target.js_doc + '\n';
        }
        if(options.without_prefix){
            extract += target.code;
        }else{
            if (target.code_include_declaration) {
                extract += indent + target.code;
            }else{
                extract += indent + variable_name + ': ' + target.code;
            }
        }
        return extract;
    },

    buildInternalVariableExtract: (file, variable_name, options = {}) => {
        let extract = "",
            indent = options.indent || '',
            target = file.internal_variable_map[variable_name];
        if (!target) {
            // console.error('Internal variable ' + variable_name + ' not found in ' + file.absolute_path);
            return "";
            process.exit(1);
        }
        if (!options.without_js_doc && shouldIncludeJsDoc(variable_name, target, options)) {
            extract += target.js_doc + '\n';
        }
        if(options.without_prefix){
            extract += target.code;
        }else{
            if (target.code_include_declaration) {
                extract += indent + target.code;
            }else{
                extract += indent + 'let ' + target.code;
            }
        }
        return extract;
    },

    buildFunctionExtract: (file, function_name, options = {}) => {
        let extract = "",
            indent = options.indent || '    ',
            target = file.function_map[function_name];
        if (!target) {
            // console.error('Function ' + function_name + ' not found in ' + file.absolute_path);
            return "";
            process.exit(1);
        }
        if (!options.without_js_doc && shouldIncludeJsDoc(function_name, target, options)) {
            extract += target.js_doc + '\n';
        }
        let skip_name = options.without_prefix;
        if (utils.replaceAll(target.code, " ", "").indexOf(function_name + "(") === 0) {
            skip_name = true;
        }
        let prefix = options.without_prefix ? "" : indent + (skip_name ? "" : function_name + ': ');
        if (shouldOnlyIncludePrototype(file, 'function', function_name, options)) {
            let param_list = code_utils.getFunctionParamList(file, function_name);
            extract += prefix + '(' + param_list.join(', ') + ')';
        } else {
            if (options.target_function_code_override && isTargetFunction(file.absolute_path, function_name, options)) {
                extract += prefix + options.target_function_code_override;
            } else {
                extract += prefix + target.code;
            }
        }
        return extract;
    },

    buildInternalFunctionExtract: (file, function_name, options = {}) => {
        let extract = "",
            indent = options.indent || '',
            target = file.internal_function_map[function_name];
        if (!target) {
            // console.error('Internal function ' + function_name + ' not found in ' + file.absolute_path);
            return "";
            process.exit(1);
        }
        if (!options.without_js_doc && shouldIncludeJsDoc(function_name, target, options)) {
            extract += target.js_doc + '\n';
        }
        let skip_declarator = options.without_prefix;
        if (utils.replaceAll(target.code, " ", "").indexOf('function' + function_name + "(") === 0) {
            skip_declarator = true;
        }
        let prefix = options.without_prefix ? "" : indent + (skip_declarator ? "" : 'let ');
        if (shouldOnlyIncludePrototype(file, 'internal_function', function_name, options)) {
            let param_list = code_utils.getFunctionParamList(file, function_name, true);
            extract += prefix + '(' + param_list.join(', ') + ')';
        } else {
            extract += prefix + target.code;
        }
        return extract;
    },

    buildClassExtract: (file, class_name, options = {}) => {
        let extract = "",
            indent = options.indent || '    ',
            target = file.class_map[class_name];
        if (!target) {
            // console.error('Class ' + class_name + ' not found in ' + file.absolute_path);
            return "";
            process.exit(1);
        }
        if (!options.without_js_doc && shouldIncludeJsDoc(class_name, target, options)) {
            extract += target.js_doc + '\n';
        }
        let prefix = options.without_prefix ? "" : indent + (class_name + ': ');
        extract += prefix + target.code;
        return extract;
    },

    buildInternalClassExtract: (file, class_name, options = {}) => {
        let extract = "",
            indent = options.indent || '',
            target = file.internal_class_map[class_name];
        if (!target) {
            // console.error('Internal class ' + class_name + ' not found in ' + file.absolute_path);
            return "";
            process.exit(1);
        }
        if (!options.without_js_doc && shouldIncludeJsDoc(class_name, target, options)) {
            extract += target.js_doc + '\n';
        }
        let prefix = options.without_prefix ? "" : indent + (class_name + ': ');
        extract += prefix + target.code;
        return extract;
    },

    buildModuleExtract: (project, project_path, {function_list = [], class_list = [], variable_list = [], internal_function_list = [], internal_class_list = [], internal_variable_list = []}, options = {}) => {
        if(function_list.indexOf('.') > -1){
            return self.buildFunctionModuleExtract(project, project_path, function_list, variable_list, options);
        }
        let file = project.getFile(project_path),
            extract = "", 
            internal_blocks = [];
        for(let name of internal_variable_list){
            internal_blocks.push(self.buildInternalVariableExtract(file, name, options));
        }
        for(let name of internal_function_list){
            internal_blocks.push(self.buildInternalFunctionExtract(file, name, options));
        }
        for(let name of internal_class_list){
            internal_blocks.push(self.buildInternalClassExtract(file, name, options));
        }
        if(internal_blocks.length > 0){
            extract += internal_blocks.join('\n\n') + '\n\n';
        }
        // If contains at least one exported target
        if(variable_list.length || function_list.length || class_list.length){
            if(file.export_type === 'class'){
                extract += file.class_map[file.export_name].code + '\n\n';
                extract += 'module.exports = ' + file.export_name + ';';
            }else{
                let blocks = [];
                extract += 'const ' + file.export_name + ' = {\n\n';
                for (let variable_name of variable_list) {
                    blocks.push(self.buildVariableExtract(file, variable_name, options));
                }
                for (let function_name of function_list) {
                    blocks.push(self.buildFunctionExtract(file, function_name, options));
                }
                for (let class_name of class_list) {
                    blocks.push(self.buildClassExtract(file, class_name, options));
                }
                extract += blocks.join(',\n\n') + '\n\n';
                extract += '};\n\nmodule.exports = ' + file.export_name + ';';
            }
        }
        if (options.include_filename !== false) {
            if (file.external_module) {
                extract = '// ' + file.path.replace('node_modules/', '') + ' (external module)\n' + extract;
            } else {
                extract = '// ' + file.module_name + '.js\n' + extract;
            }
        }
        return extract;
    },

    buildFunctionModuleExtract: (project, project_path, function_name_list, variable_name_list, options) => {
        let file = project.getFile(project_path),
            extract = 'const ' + file.export_name + ' = ';
        extract += self.buildFunctionExtract(file, '.', Object.assign({}, options, {without_js_doc: true, without_prefix: true})) + ';\n\n'
        for (let variable_name of variable_name_list) {
            extract += file.export_name + '.' + variable_name + " = ";
            extract += self.buildVariableExtract(file, variable_name, Object.assign({}, options, {without_prefix: true}));
            extract += ',\n\n';
        }
        for (let function_name of function_name_list) {
            if(function_name !== '.'){
                extract += file.export_name + '.' + function_name + " = ";
                extract += self.buildFunctionExtract(file, function_name, Object.assign({}, options, {without_prefix: true}));
                extract += ';\n\n';
            }
        }
        extract += 'module.exports = ' + file.export_name + ';';
        if (options.include_filename) {
            if (file.external_module) {
                extract = '// ' + file.path.replace('node_modules/', '') + ' (external module)\n' + extract;
            } else {
                extract = '// ' + file.module_name + '.js\n' + extract;
            }
        }
        return extract;
    },

    buildDependencyExtract: (project, dependency, path, options) => {
        let extract = "",
            targets = {function_list: [], variable_list: [], class_list: [], 
                internal_function_list: [], internal_variable_list: [], internal_class_list: []},
                at_least_one = false;
        for (let target in dependency) {
            if(targets[dependency[target] + '_list'] !== undefined){
                targets[dependency[target] + '_list'].push(target);
                at_least_one = true;
            }
        }
        if (at_least_one) {
            options = options ? _.cloneDeep(options) : {};
            options.include_filename = true;
            extract = self.buildModuleExtract(project, path, targets, options);
        }
        return extract;
    },

    buildModuleTargetAndDependenciesExtract: (project, file, {name, type, internal}, options) => {
        let dependencies = module_parser.getModuleTargetDependenciesMap(project, file.project_path, {name, type, internal}, options);
        dependencies[file.project_path] = dependencies[file.project_path] || {};
        dependencies[file.project_path][name] = (internal ? 'internal_' : "") + type;
        let path_list = _.without(_.keys(dependencies), file.project_path);
        path_list.push(file.project_path);
        let file_extracts = [];
        for (let path of path_list) {
            file_extracts.push(self.buildDependencyExtract(project, dependencies[path], path, options));
        }
        return file_extracts.join('\n\n');
    },

    buildModuleFunctionAndDependenciesExtract: (project, file, function_name, options) => {
        return self.buildModuleTargetAndDependenciesExtract(project, file, 'function', function_name, { max_depth: options.max_depth });
    },

    extractTestFunction(content, name) {
        let start = content.indexOf(name ? 'it("' + name + '"' : 'it("'),
            function_opening_bracket = content.indexOf('{', start),
            stack = [],
            end;

        // Start from the opening bracket of the function
        for (let i = function_opening_bracket; i < content.length; i++) {
            if (content[i] === '{') {
                stack.push('{');
            } else if (content[i] === '}') {
                if (stack.length === 0) {
                    // Error: unbalanced brackets
                    return null;
                }
                stack.pop();
                if (stack.length === 0) {
                    // We've found the matching closing bracket
                    end = i;
                    break;
                }
            }
        }

        if (stack.length !== 0) {
            // Error: unbalanced brackets
            return null;
        }

        // Extract the function code
        let functionCode = content.slice(start, end + 3);

        return functionCode;
    }

}

module.exports = self;