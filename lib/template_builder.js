const fse = require('fs-extra'),
      _ = require('lodash'),
      path = require('path'),
      extract = require('../parsing/extract'),
      module_parser = require('../parsing/module_parser'),
      code_utils = require('./code_utils'),
      utils = require('./utils');

const MOCHA_UNIT_TEST_PATH = path.join(__dirname, 'templates/mocha_unit_test.js'),
    JEST_UNIT_TEST_PATH = path.join(__dirname, 'templates/jest_unit_test.js'),
    MERGE_MOCHA_UNIT_TESTS_PATH = path.join(__dirname, 'templates/merge_mocha_unit_tests.js'),
    MERGE_JEST_UNIT_TESTS_PATH = path.join(__dirname, 'templates/merge_jest_unit_tests.js'),
    DEFAULT_MOCHA_UNIT_TEST_SETUP_CODE_PATH = path.join(__dirname, 'templates/default_mocha_unit_test_setup_code.txt'),
    DEFAULT_JEST_UNIT_TEST_SETUP_CODE_PATH = path.join(__dirname, 'templates/default_jest_unit_test_setup_code.txt');

const DEFAULT_MOCHA_UNIT_TEST_SETUP_CODE = fse.readFileSync(DEFAULT_MOCHA_UNIT_TEST_SETUP_CODE_PATH, 'utf8'),
    DEFAULT_JEST_UNIT_TEST_SETUP_CODE = fse.readFileSync(DEFAULT_JEST_UNIT_TEST_SETUP_CODE_PATH, 'utf8');

const SETUP_CODE_PLACEHOLDER = "    // SETUP CODE";

function isLibUsed(code, lib){
    if(lib.object){
        for(let obj of lib.object_list){
            if(code.indexOf(obj + ".") !== -1 || code.indexOf(obj + "(") !== -1){
                return true;
            }
        }
    }else{
        if(code.indexOf(lib.name + ".") !== -1 || code.indexOf(lib.name + "(") !== -1){
            return true;
        }
    }
    return false;
}

function formatLibRequireLine(lib){
    let require_line = "const ";
    if(lib.object){
        require_line += "{";
        for(let i = 0; i < lib.object_list.length; i++){
            let obj = lib.object_list[i];
            require_line += obj;
            if(i < lib.object_list.length - 1){
                require_line += ", ";
            }
        }
        require_line += "}";
    }else{
        require_line += lib.name;
    }
    if(lib.local && !lib.external){
        require_line += ' = require("[' + lib.path_placeholder + ']");';
    }else{
        require_line += ' = require("' + lib.path + '");';
    }
    return require_line;
}

const self = {

    initializeModuleFunctionUnitTestTemplate: (project, file, code, target_type, target_name, options = {}) => {
        let test_framework = options.test_framework || 'jest',
            template = utils.getFile(test_framework === 'mocha' ? MOCHA_UNIT_TEST_PATH : JEST_UNIT_TEST_PATH),
            test_code = template.content,
            libs = _.cloneDeep(file.libs),
            dependencies_map = module_parser.getModuleTargetDependenciesMap(project, file.project_path, {type: target_type, name: target_name}, {use_filter: false}),
            depency_libs = [],
            include_dependency_libs = options.include_dependency_libs || false;
        dependencies_map[file.project_path] = dependencies_map[file.project_path] || {};
        dependencies_map[file.project_path][target_name] = 'target_type';
       
        for(let path in dependencies_map){
            if(!_.find(libs, {project_path: path}) && (path === file.project_path || include_dependency_libs)){
                let lib_file = project.getFile(path),
                    lib = {
                        name: lib_file.export_type === 'class' ? lib_file.export_name : lib_file.module_name,
                        path: utils.getRelativePath(path, file.project_path),
                        project_path: path,
                        local: true,
                        path_placeholder: 'LIB_' + libs.length
                    };
                libs.push(lib);
                depency_libs.push(lib);
            }
        }

        let duplicated_lib_name = _.find(file.libs, {name: file.module_name});
        // Check if libs contains a lib with the same name as the module being tested
        if(duplicated_lib_name){
            // If so, fix the name of the lib being tested
            let test_lib = _.find(libs, {project_path: file.project_path});
            test_lib.name = 'test_' + test_lib.name;
        }
        
        template.libs = libs;
        test_code = utils.replaceAll(test_code, '[MODULE_NAME]', duplicated_lib_name ? 'test_' + file.module_name : file.module_name);
        test_code = utils.replaceAll(test_code, '[FUNCTION_NAME]', target_name);
        let require_lines = [],
            included_libs = [];
        for(let lib of libs){
            if(isLibUsed(code, lib) || depency_libs.indexOf(lib) !== -1){
                require_lines.push(formatLibRequireLine(lib));
                included_libs.push(lib);
            }
        }
        template.included_libs = included_libs;
        template.require_lines = require_lines;
        test_code = utils.replaceAll(test_code, '[REQUIRE_LINES]', require_lines.join('\n'));
        template.content = test_code;
        return template;
    },

    getFilledModuleFunctionUnitTestTemplateClone: (template, test_case, index, options = {}) => {
        let filled_template = _.cloneDeep(template),
            test_code = filled_template.content;
        test_code = utils.replaceAll(test_code, '[TEST_CASE]', test_case);
        test_code = utils.replaceAll(test_code, '[TEST_INDEX]', index);
        filled_template.content = test_code;
        self.fillTemplateSetupCode(filled_template, options.setup_code, options);
        filled_template.filled_content = self.fillTemplateCodeDummyPaths(filled_template.content, filled_template.libs);
        filled_template.content_start = utils.getFileContentUntilLine(filled_template.content, 'it("' + test_case);
        filled_template.filled_content_start = self.fillTemplateCodeDummyPaths(filled_template.content_start, filled_template.libs);
        return filled_template;
    },

    fillTemplateSetupCode: (template, setup_code, options = {}) => {
        let test_code = template.content,
            test_framework = options.test_framework || 'jest';
        if(!setup_code || setup_code === ''){
            setup_code = test_framework === 'mocha' ? DEFAULT_MOCHA_UNIT_TEST_SETUP_CODE : DEFAULT_JEST_UNIT_TEST_SETUP_CODE;
        }
        test_code = test_code.replace(SETUP_CODE_PLACEHOLDER, setup_code);
        template.content = test_code;
        return template;
    },

    fillTemplateCodePaths: (code, libs, module_path) => {
        for(let lib of libs){
            if(code.indexOf(lib.path_placeholder) !== -1){
                let lib_path = utils.recomputePath(lib.path, module_path);
                code = utils.replaceAll(code, '[' +  lib.path_placeholder + ']', lib_path);
            }
        }
        return code;
    },

    fillTemplateCodeDummyPaths: (code, libs) => {
        for(let lib of libs){
            if(code.indexOf(lib.path_placeholder) !== -1){
                code = utils.replaceAll(code, '[' +  lib.path_placeholder + ']', './' + (lib.name || lib.filename));
            }
        }
        return code;
    },

    getMergedTestsFile: (project, file, target_type, target_name, test_code_list, module_path, options = {}) => {
        let test_framework = options.test_framework || 'jest',
            code_extract = extract.extractModuleTarget(project, file, {name: target_name, type: target_type}),
            test_template = self.initializeModuleFunctionUnitTestTemplate(project, file, code_extract, target_type, target_name, {test_framework: test_framework}),
            merge_template = fse.readFileSync(test_framework === 'mocha' ? MERGE_MOCHA_UNIT_TESTS_PATH : MERGE_JEST_UNIT_TESTS_PATH, 'utf8'),
            setup_code = options.setup_code || '',
            skip_tests = options.skip_tests || [];
        let extracted_test_functions = [];
        for(let i = 0; i < test_code_list.length; i++){
            let test_code = test_code_list[i],
                test_function = code_utils.getCodeBlockContent(test_code, 'it');
            if(skip_tests.indexOf(i) !== -1){
                test_function = test_function.replace('it(', 'xit(');
            }
            extracted_test_functions.push(test_function);
        }
        if(!setup_code || setup_code === ''){
            setup_code = test_framework === 'mocha' ? DEFAULT_MOCHA_UNIT_TEST_SETUP_CODE : DEFAULT_JEST_UNIT_TEST_SETUP_CODE;
        }
        merge_template = merge_template.replace(SETUP_CODE_PLACEHOLDER, setup_code);
        merge_template = utils.replaceAll(merge_template, '[MODULE_NAME]', file.module_name);
        merge_template = utils.replaceAll(merge_template, '[FUNCTION_NAME]', target_name);
        merge_template = merge_template.replace('[REQUIRE_LINES]', test_template.require_lines.join('\n'));
        merge_template = merge_template.replace('    // CODE HERE', extracted_test_functions.join('\n\n'));
        for(let lib of test_template.libs){
            if(merge_template.indexOf(lib.path_placeholder) !== -1){
                let lib_path = utils.recomputePath(lib.path, module_path);
                merge_template = utils.replaceAll(merge_template, '[' +  lib.path_placeholder + ']', lib_path);
            }
        }
        return merge_template;
    }

}

module.exports = self;