const _ = require('lodash'),
    fse = require('fs-extra'),
    config = require('../config'),
    module_parser = require('./module_parser'),
    utils = require('../lib/utils'),
    File = require('./file');

const test_lib_map = {
    mocha: ['sinon', 'sinon-chai', 'chai'],
    jest: ['jest']
}

class Project {

    name = '';

    root_path = '';

    entry_point = '';

    project_files = [];

    debug = false;

    constructor(name, root_path, options = {}) {
        this.name = name;
        this.root_path = root_path;
        this.debug = options.debug || false;
        // Check if the project contains a package.json file
        let package_json_path = this.root_path + '/package.json';
        if (!fse.existsSync(package_json_path)) {
            console.log('Error: Project does not contain a package.json file.');
            process.exit(1);
        }
    }

    load = (entry_point) => {
        this.entry_point = entry_point;
        this.loadFile(entry_point);
        this.parseProjectFiles();
    }

    log = (msg) => {
        if (this.debug) {
            console.log('Project: ', msg);
        }
    }

    getFiles = () => {
        return this.project_files;
    }

    printLoadedFilesPath = () => {
        for (let file of this.project_files) {
            console.log(file.project_path);
        }
    }

    matchTestFrameworkRequirements = (test_framework = 'jest', exit = true) => {
        if(!['mocha', 'jest'].includes(test_framework)){
            console.log('Error: Invalid test framework: ' + test_framework + '. Supported test frameworks: jest, mocha');
            if(exit){
                process.exit(1);
            }else{
                return "Invalid test framework: " + test_framework + ". Supported test frameworks: jest, mocha";
            }
        }
        let required_libs = test_lib_map[test_framework],
            missing_package_libs = [],
            missing_module_libs = [],
            package_json = getPackageJson(this.root_path);
        for (let lib of required_libs) {
            if (!isLibInPackage(package_json, { name: lib }).installed) {
                missing_package_libs.push(lib);
            }
            if(!isLibInstalled(this, { name: lib })){
                missing_module_libs.push(lib);
            }
        }
        if (missing_package_libs.length > 0) {
            console.log('WARNING: Missing test framework libs in package.json: ' + missing_package_libs.join(', '));
            if(exit){
                process.exit(1);
            }else{
                return "Missing test framework libs in package.json: " + missing_package_libs.join(', ');
            }
        }
        if (missing_module_libs.length > 0) {
            console.log('WARNING: Missing test framework libs in node_modules: ' + missing_module_libs.join(', '));
            if(exit){
                process.exit(1);
            }else{
                return "Missing test framework libs in node_modules: " + missing_module_libs.join(', ');
            }
        }
    }

    getFile = (path, options = {}) => {
        this.log('loadFile: ' + path);
        let file = this.getFileFromRequestedPath(path);
        if (file) {
            this.log('File already loaded: ' + path);
            return file;
        } else {
            file = this.loadFile(path, options);
            return file;
        }
    }

    getFileFromProjectPath = (project_path) => {
        for (let file of this.project_files) {
            if (file.project_path === project_path) {
                return file;
            }
        }
    }

    getFileFromRequestedPath = (path) => {
        for (let file of this.project_files) {
            if (file.requested_path_list.includes(path)) {
                return file;
            }
        }
    }

    loadFile = (path, options = {}, try_count = 0) => {
        this.log('Get file: ' + path);
        try {
            let existing_file = this.getFileFromProjectPath(path),
                requested_path = options.requested_path;
            if (existing_file) {
                this.log('File already loaded: ' + path);
                if (requested_path && !existing_file.requested_path_list.inludes(requested_path)) {
                    existing_file.requested_path_list.push(requested_path);
                }
                return existing_file;
            }
            
            let file = new File(this.root_path, path, requested_path, options.disable_parsing);
            this.project_files.push(file);

            let {libs, error} = module_parser.extractRequires(file);
            file.libs = libs;
            if(error){
                file.parsing_error = true;
            }

            for (let lib of file.libs) {
                if (lib.local) {
                    let lib_file = this.getFile(lib.project_path);
                    lib.project_path = lib_file.project_path;
                    if (lib.external) {
                        lib_file.external_module = true;
                    }
                }
            }

            if (options.parse_loaded_files) {
                this.parseProjectFiles();
            }

            return file;
        } catch (e) {
            if (e.message.includes('ENOENT') || e.message.includes('EISDIR')) {
                try_count++;
                this.log('Error while opening file: ' + path);
                options = _.cloneDeep(options);
                options.requested_path = options.requested_path || path;
                if (try_count === 1 && path.indexOf('.js') === -1) {
                    this.log('Error while opening file, trying to add .js to path...');
                    return this.loadFile(path + '.js', options, try_count);
                } else if (try_count === 2) {
                    this.log('Still error while opening file, trying to target index.js instead...');
                    return this.loadFile(path.replace('.js', '/index.js'), options, try_count);
                } else if (options.exit_on_failure !== false) {
                    this.loading_file = false;
                    this.log('Error while opening file: ' + path + ' (' + options.requested_path + ')');
                    console.log(e);
                    process.exit(1);
                } else {
                    throw e;
                }
            } else {
                throw e;
            }
        }
    }

    shouldParseFile = (file) => {
        if (file.disable_parsing || config.disable_parsing_file_list.indexOf(file.project_path) > -1) {
            return false;
        } else {
            return true;
        }
    }

    parseProjectFiles = () => {
        for (let file of this.project_files) {
            if (!file.parsed) {
                try {
                    if (this.shouldParseFile(file)) {
                        module_parser.parseModule(file);
                    }
                } catch (err) {
                    this.log('Error while parsing module: ' + file.project_path);
                    console.log(err);
                    // file.parsing_error = true;
                    // process.exit(1);
                }
                file.parsed = true;
            }
        }
        this.loadFilesDependencies();
    }

    loadFilesDependencies = () => {
        for (let file of this.project_files) {
            this.loadFileDependenciesType(file);
        }
        for (let file of this.project_files) {
            if (!file.dependencies_parsed) {
                this.loadFileSubDependencies(file);
                file.dependencies_parsed = true;
            }
        }
        for (let file of this.project_files) {
            if (!file.parent_dependencies_parsed) {
                this.computeFileParentDependencies(file);
                file.parent_dependencies_parsed = true;
            }
        }
    }

    loadFileDependenciesType = (file) => {
        for (let name in file.function_map) {
            let func = file.function_map[name];
            for (let dep of func.dependencies) {
                if (dep.local && dep.type === 'unknown') {
                    let dep_file = this.getFile(dep.project_path),
                        type = 'unknown';
                    if (dep_file.function_map && dep_file.function_map[dep.target]) {
                        type = 'function';
                    } else if (dep_file.variable_map && dep_file.variable_map[dep.target]) {
                        type = 'variable';
                    }
                    dep.type = type;
                }
            }
            func.root_dependencies = _.cloneDeep(func.dependencies);
        }
    }

    loadFileSubDependencies = (file) => {
        for (let name in file.function_map) {
            let func = file.function_map[name],
                dependencies = func.dependencies,
                sub_dependencies = this.getSubDependencies(dependencies);
            for (let dep of sub_dependencies) {
                if (!_.find(dependencies, { project_path: dep.project_path, target: dep.target })) {
                    dependencies.push(_.cloneDeep(dep));
                }
            }
        }
    }

    getSubDependencies = (dependencies, sub_dependencies = [], roamed_dependencies = [], depth = 1) => {
        if (depth > 10) {
            this.log('getSubDependencies: depth > 10');
            process.exit(1);
        }
        for (let dep of dependencies) {
            if (dep.local && dep.type === 'function') {
                let dep_file = this.getFile(dep.project_path);
                if (dep_file) {
                    let dep_func = dep_file.function_map[dep.target];
                    if (dep_func) {
                        roamed_dependencies.push({ project_path: dep_file.project_path, target: dep.target });
                        let sub_deps = dep_func.root_dependencies || [];
                        for (let sub_dep of sub_deps) {
                            let existing_dep = _.find(sub_dependencies, { project_path: sub_dep.project_path, target: sub_dep.target });
                            if (existing_dep) {
                                if (existing_dep.depth > depth) {
                                    existing_dep.depth = depth;
                                }
                            } else {
                                let add_dep = _.cloneDeep(sub_dep);
                                add_dep.depth = depth;
                                sub_dependencies.push(add_dep);
                            }
                        }
                        sub_deps = _.filter(sub_deps, (dep) => {
                            return !_.find(roamed_dependencies, { project_path: dep.project_path, target: dep.target });
                        });
                        this.getSubDependencies(sub_deps, sub_dependencies, roamed_dependencies, depth + 1);
                    }
                }
            }
        }
        return sub_dependencies;
    }

    computeFileParentDependencies = (file) => {
        this.computeFileTargetsParentDependencies(file, 'function');
        this.computeFileTargetsParentDependencies(file, 'variable');
    }

    computeFileTargetsParentDependencies = (file, target_type) => {
        for (let target_name in file[target_type + '_map']) {
            let target = file[target_type + '_map'][target_name],
                dependencies = target.dependencies,
                parent_dep = {
                    name: file.export_name,
                    local: true,
                    project_path: file.project_path,
                    type: target_type,
                    target: target_name
                };
            for (let dep of dependencies) {
                if (dep.type !== 'unknown' && dep.local && dep.depth >= 0) {
                    this.addParentDependency(dep, parent_dep);
                }
            }
        }
    }

    addParentDependency = (target, parent) => {
        let file = this.getFile(target.project_path);
        if (file) {
            try {
                let target_type = target.type,
                    target_name = target.target;
                if(target_name === '.' && file.export_type === 'class'){
                    target_name = file.export_name;
                }
                let target_dependencies = file[target_type + '_map'][target_name].dependencies,
                    origin_depth = target.depth,
                    parent_depth = - (origin_depth + 1),
                    existing_dep = _.find(target_dependencies, { project_path: parent.project_path, target: parent.target });
                if (existing_dep) {
                    if (existing_dep.depth > parent_depth) {
                        existing_dep.depth = parent_depth;
                    }
                } else {
                    parent = _.cloneDeep(parent);
                    parent.depth = parent_depth;
                    target_dependencies.push(parent);
                }
            } catch (e) {
                // console.log(e);
                this.log('Error for target: ' + target.project_path + ' - ' + target.target);
                // console.log('Error for target: ' + target.project_path + ' - ' + target.target);
                // console.log(target);
                // throw e;
            }
        }
    }

}

function getPackageJson(project_path) {
    let package_json_path = project_path + '/package.json';
    return fse.readFileSync(package_json_path, 'utf-8');
}

function isLibInPackage(pck, lib) {
    let lib_line = utils.getFirstMatchingLine(pck, lib.name);
    if (lib_line) {
        let version = lib_line.split(':')[1].trim().replace(/"/g, '').replace(',', '');
        return { installed: true, version: version };
    } else {
        return { installed: false, version: null };
    }
}

function isLibInstalled(project, lib) {
    let node_modules_path = project.root_path + '/node_modules',
        lib_path = node_modules_path + '/' + lib.name;
    return fse.existsSync(lib_path);
}

module.exports = Project;