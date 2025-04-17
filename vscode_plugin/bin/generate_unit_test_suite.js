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

        let target = file.getTargetFromLineIndex(ctx.lineNumber - 1);
        if (!target) {
            vscode.window.showErrorMessage('No target found at line ' + ctx.lineNumber);
            return;
        } else if (target.type !== 'function' && target.type !== 'class') {
            vscode.window.showErrorMessage('Target is not a function or class');
            return;
        } else if (target.internal) {
            vscode.window.showErrorMessage('Target is not exported, cannot generate Unit Tests');
            return;
        }

        await generateTargetUnitTestSuite(project, file, target);
    } catch (e) {
        console.log(e);
        await bin_utils.afterJob('generate_unit_test_suite');
        vscode.window.showErrorMessage('Error generating Unit Tests...');
    }

}

module.exports = self;