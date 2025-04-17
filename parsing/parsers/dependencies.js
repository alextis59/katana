const _ = require('lodash'),
    config = require('../../config'),
    esprima = require('esprima-next'),
    utils = require('../../lib/utils');

const attr_regex = /\.(\w+)[\(\)\n\t=;.,"' \[\]]/;

const lib_usage_search_suffix_list = [' ', '(', '[', ';', ',', '\n', '\t', '=', '!'];

const self = {

    extractRequires(file) {
        try {
            let code = file.content;
            const ast = esprima.parseScript(code, { comment: true });
            const requires = ast.body
                .filter(node => node.type === 'VariableDeclaration')
                .flatMap(declaration => declaration.declarations)
                .filter(declarator => declarator.init && declarator.init.type === 'CallExpression' && declarator.init.callee.name === 'require');
            let lib_index = 0;
            return {libs: requires.flatMap(req => {
                const path = req.init.arguments[0].value;
                if (req.id.type === 'Identifier') {
                    let lib = {
                        name: req.id.name,
                        path: path,
                        local: path.startsWith('.'),
                        path_placeholder: 'LIB_' + lib_index++
                    };
                    if (lib.local) {
                        lib.project_path = utils.recomputePath(path, file.project_path);
                    } else if (self.includeExternalLibrary(lib)) {
                        lib.local = true;
                        lib.external = true;
                        lib.project_path = 'node_modules/' + path;
                    }
                    lib.filename = path.split('/').pop();
                    return [lib];
                } else if (req.id.type === 'ObjectPattern') {
                    let lib = {
                        object: true,
                        object_list: [],
                        path: path,
                        local: path.startsWith('.'),
                        path_placeholder: 'LIB_' + lib_index++
                    }
                    if (lib.local) {
                        lib.project_path = utils.recomputePath(path, file.project_path);
                    } else if (self.includeExternalLibrary(lib)) {
                        lib.local = true;
                        lib.external = true;
                        lib.project_path = 'node_modules/' + path;
                    }
                    lib.filename = path.split('/').pop();
                    for (let prop of req.id.properties) {
                        lib.object_list.push(prop.key.name);
                    }
                    return [lib];
                }
            })};
        } catch (err) {
            console.log('Error while extracting requires for file: ' + file.project_path);
            console.log(err);
            // process.exit(1);
            return {libs: [], error: true};
        }
    },

    includeExternalLibrary: (lib) => {
        let included_external_depencies = config.include_external_dependencies || [];
        for (let dependency_path of included_external_depencies) {
            if(dependency_path === lib.path || _.startsWith(lib.path, dependency_path)){
                return true;
            }
        }
        return false;
    },

    computeCodeLibsDependencies(code, libs) {
        let dependencies = [];
        for (let lib of libs) {
            if (self.includeDependency(lib)) {
                let lib_dependencies = self.computeCodeLibDependencies(code, lib);
                for (let dependency of lib_dependencies) {
                    if (!_.find(dependencies, dependency)) {
                        dependencies.push(dependency);
                    }
                }
            }
        }
        return _.uniq(dependencies);
    },

    computeCodeLibDependencies(code, lib) {
        let dependencies = [],
            lib_targets = lib.object ? lib.object_list : [lib.name];
        for (let target of lib_targets) {
            let search_index = 0,
                next_index;
            while ((next_index = self.findLibUsageIndex(code, target, search_index)) !== null) {
                try {
                    if (next_index.type === 'attr') {
                        let index = next_index.index,
                            following_code = code.substr(index),
                            lib_attr_match = following_code.match(attr_regex),
                            lib_attr = lib_attr_match ? lib_attr_match[1] : undefined,
                            next_char = lib_attr ? following_code[target.length + 1 + lib_attr.length] : undefined,
                            corresponding_line = utils.findLineByCharIndex(code, index);
                        if (lib_attr && lib_attr.length < 50 && following_code.indexOf(lib_attr) === (target.length + 1)
                            && ["'", '"'].indexOf(next_char) === -1 && !utils.isCommentLine(corresponding_line)) {
                            let dependency = {
                                name: lib.name,
                                local: lib.local,
                                target: lib_attr,
                                type: next_char === '(' ? 'function' : 'unknown',
                                depth: 0
                            };
                            if (lib.local || lib.include) {
                                dependency.project_path = lib.project_path;
                            }
                            if (!_.find(dependencies, dependency)) {
                                dependencies.push(dependency);
                            }
                        }
                    } else if (next_index.type === 'call') {
                        let dependency = {
                            name: lib.name,
                            local: lib.local,
                            target: lib.object ? target : ".",
                            type: next_index.new_class ? 'class' : 'function',
                            depth: 0
                        };
                        if (lib.local || lib.include) {
                            dependency.project_path = lib.project_path;
                        }
                        if (!_.find(dependencies, dependency)) {
                            dependencies.push(dependency);
                        }
                    }
                    search_index = next_index.index + 1;
                } catch (e) {
                    console.log('Error while parsing lib attr for lib target: ' + target);
                    console.log(e);
                    // process.exit(1);
                }
            }
        }
        return dependencies;
    },

    computeClassLibsDependencies(class_info, libs) {
        let dependencies = self.computeCodeLibsDependencies(class_info.code, libs);
        for(let class_name of class_info.extends){
            for (let lib of libs) {
                if (self.includeDependency(lib)) {
                    let lib_dependencies = self.computeClassNameLibDependencies(class_name, lib);
                    dependencies = [...dependencies, ...lib_dependencies];
                }
            }
        }
        return _.uniq(dependencies);
    },

    computeClassNameLibDependencies(class_name, lib){
        let dependencies = [],
            lib_targets = lib.object ? lib.object_list : [lib.name];
        for (let target of lib_targets) {
            if(target === class_name){
                let dependency = {
                    name: lib.name,
                    local: lib.local,
                    target: target,
                    type: 'class',
                    depth: 0
                };
                if (lib.local || lib.include) {
                    dependency.project_path = lib.project_path;
                }
                if (!_.find(dependencies, dependency)) {
                    dependencies.push(dependency);
                }
            }
        }
        return dependencies;
    },

    findLibUsageIndex(code, target, search_index = 0) {
        let index = code.indexOf(target, search_index);
        if (index === -1) {
            return null;
        } else {
            let previous_char = code[index - 1] || '',
                next_char = code[index + target.length] || '',
                is_instanceof_call = self.stringBeforeIs(code, index, ' instanceof');
            if (!lib_usage_search_suffix_list.includes(previous_char) || (next_char !== '.' && next_char !== '(' && !is_instanceof_call)) {
                return self.findLibUsageIndex(code, target, index + 1);
            }
            let type = next_char === '.' ? 'attr' : 'call',
                new_class = type === 'call' ? is_instanceof_call || self.stringBeforeIs(code, index, 'new') : false;
            return {
                index: index,
                type: type,
                new_class: new_class
            }
        }
    },

    stringBeforeIs: (code, index, str) => {
        let i = index - 1;
        while (i >= 0 && code[i] === ' ') {
            i--;
        }
        return code.substr(i - str.length + 1, str.length) === str;
    },

    checkForNewInPreviousChars(code, index) {
        let find_chars = ['w', 'e', 'n'],
            find_index = 0;
        while(--index >= 0){
            let c = code[index];
            if(c !== ' '){
                if(c === find_chars[find_index]){
                    find_index++;
                    if(find_index === find_chars.length){
                        return true;
                    }
                }else{
                    return false;
                }
            }
        }
    },

    includeDependency(lib) {
        if (lib.local) {
            return true;
        } else {
            return false;
        }
    }

}

module.exports = self;