const plugin_utils = require('../utils'),
    state = require('../state'),
    fse = require('fs-extra'),
    plugin_config = require('../config'),
    { jobs } = require('../../autopilot'),
    token_utils = require('../../lib/ai/token_utils'),
    Project = require('../../parsing/project'),
    vscode = require('vscode');

const self = async () => {

    let ctx = await plugin_utils.getRightClickContext();

    let project = new Project("my_project", ctx.projectPath),
        file_path = ctx.filePath.replace(ctx.projectPath + '/', ''),
        file = project.loadFile(file_path, { parse_loaded_files: true }),
        target = file.getTargetFromLineIndex(ctx.lineNumber - 1);

    let debug_path = project.root_path + '/debug.txt';

    let file_data = {
        class_map: file.class_map,
        function_map: file.function_map,
        variable_map: file.variable_map,
        internal_class_map: file.internal_class_map,
        internal_function_map: file.internal_function_map,
        internal_variable_map: file.internal_variable_map,
        libs: file.libs,
        module_name: file.module_name,
        export_type: file.export_type,
        export_name: file.export_name
    }

    // fse.writeFileSync(debug_path, JSON.stringify(file_data, null, 2));
    // vscode.window.showInformationMessage('File data written to ' + debug_path);
    // return;

    vscode.window.showInformationMessage('Target: ' + JSON.stringify(target));

    let context = {
        project: project,
        file: file,
        target: target
    };
    let result = await jobs.extract_module_target.set({
        include_dependencies: true,
        max_depth: 0
    })(context);

    // console.log(result.code);

    let extract_path = project.root_path + '/extract.txt';

    fse.writeFileSync(extract_path, result.code);

    return;

    context.code = result.code;
    // context.test_case = "Should return false when type is string and value is a string that matches options.length but not options.regexp";
    context.test_case = "Basic test";

    result = await jobs.unit_test_coverage_annotation(context);

    console.log(result.annoted_code);

    let annoted_path = project.root_path + '/annoted.txt';

    fse.writeFileSync(annoted_path, result.annoted_code);

}

module.exports = self;