const fse = require('fs-extra'),
    path = require('path'),
    vscode = require('vscode'),
    state = require('../state'),
    Project = require('../../parsing/project'),
    plugin_utils = require('../utils'),
    plugin_config = require('../config'),
    { jobs, pipe } = require('../../autopilot'),
    token_utils = require('../../lib/ai/token_utils'),
    test_runner = require('../../lib/test_runner'),
    bin_utils = require('./bin_utils'),
    generateTargetUnitTestSuite = require('./generate_target_unit_test_suite');

function getAllTargets(project, file) {
    let target_types = ['function', 'class'],
        targets = [];
    for (let type of target_types) {
        let target_map = file[type + '_map'];
        for (let name in target_map) {
            let target = target_map[name];
            if (target.function_map) {
                for (let method in target.function_map) {
                    targets.push({
                        type,
                        name,
                        method
                    })
                }
            } else {
                targets.push({
                    type,
                    name
                })
            }
        }
    }
    return targets.filter((target) => {
        let output_name = target.name + (target.method ? "." + target.method : ""),
            output_path = getOutputPath(project, file, output_name);
        return !fse.existsSync(output_path);
    })
}

const self = async () => {

    try {
        if ((await bin_utils.beforeJob('generate_unit_test_suite')) === false) {
            return;
        }

        token_utils.resetSessionTokenUsage();
        let ctx = await plugin_utils.getRightClickContext();

        let package_path = path.join(ctx.projectPath, 'package.json');
        if (!fse.existsSync(package_path)) {
            vscode.window.showErrorMessage('No package.json found in project root: ' + ctx.projectPath + ', cannot generate Unit Tests...');
            return;
        }

        let project = new Project("my_project", ctx.projectPath),
            test_framework = plugin_config.config.test_framework;

        let err = project.matchTestFrameworkRequirements(test_framework, false);
        if (err) {
            vscode.window.showErrorMessage(err);
            return;
        }
        if (!(await test_runner.verifyTestFramework(test_framework, project.root_path))) {
            vscode.window.showErrorMessage('Test framework not installed: ' + test_framework);
            return;
        }

        let file_path = ctx.filePath.replace(ctx.projectPath + '/', ''),
            file = project.loadFile(file_path, { parse_loaded_files: true });
        if (file.parsing_error) {
            vscode.window.showErrorMessage(`Error parsing file: ${file_path}.
            Verify the file is valid and try again.
            (Reminder: Katana supports only CommonJS files for now)`);
            return;
        }

        let targets = getAllTargets(project, file);

        for(let target of targets){
            await generateTargetUnitTestSuite(project, file, target);
        }
    } catch (e) {
        console.log(e);
        await bin_utils.afterJob('generate_unit_test_suite');
        vscode.window.showErrorMessage('Error generating All Unit Tests...');
    }

}

function getOutputPath(project, file, target_name) {
    let unit_test_output_path = plugin_utils.getUnitTestsOutputPath(project, file, target_name, false);
    return project.root_path + '/' + unit_test_output_path;
}

module.exports = self;