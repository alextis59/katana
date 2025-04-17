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
    bin_utils = require('./bin_utils');

async function generateTargetUnitTestSuite(project, file, target) {
    let output_name = target.name + (target.method ? "." + target.method : ""),
        display_name = file.path + " => " + target.name + (target.method ? "." + target.method : ""),
        output_path = getOutputPath(project, file, output_name);

    vscode.window.showInformationMessage('Generating Unit tests for ' + display_name);

    try {
        await verifyTestTemplateBuild(project, file, target);
    } catch (err) {
        console.log(err);
        vscode.window.showErrorMessage('Error building Unit Test template...');
        return;
    }

    let unit_test_cases = await getTestCases(project, file, target);
    
    if (!unit_test_cases) {
        vscode.window.showErrorMessage('Error generating Unit Test cases...');
        return;
    } else {
        vscode.window.showInformationMessage('Generated Unit Test cases: ' + unit_test_cases.length);
    }

    let generated_count = 0;

    let context = {
        project: project,
        file: file,
        target: target,
        unit_test_cases,
        chat_options: plugin_config.config.chat_options.write_unit_test,
        async: plugin_config.config.write_unit_test.async,
        skip_failed_tests: true,
        on_test_implemented: () => {
            generated_count++;
            vscode.window.showInformationMessage('Generated ' + generated_count + ' / ' + unit_test_cases.length + ' Unit Tests');
        }
    };

    if (target.method) {
        context.target_suffix = "." + target.method;
    }

    let result;

    try {
        result = await jobs.implement_unit_test_suite(context);
    } catch (err) {
        vscode.window.showErrorMessage('Error generating Unit Tests...');
        return;
    }

    let test_code = result.test_code,
        failed_count = 0;

    for (let i = 0; i < unit_test_cases.length; i++) {
        let passing = result.passing_test_list[i];
        if (!passing) {
            failed_count++;
        }
    }

    await applyUnitTests(output_path, test_code);

    let cost = token_utils.computeSessionTotalCost(),
        info_text = 'All Unit Tests generated (' + (unit_test_cases.length - failed_count) + ' / ' + unit_test_cases.length + ' passing)';
    info_text += ' (Cost: ' + cost + '$)';
    vscode.window.showInformationMessage(
        info_text,
        'Show'
    ).then(selection => {
        if (selection === 'Show') {
            openFile(output_path);
        }
    });

    await bin_utils.afterJob('generate_unit_test_suite');
}

async function verifyTestTemplateBuild(project, file, target) {
    let context = {
        project: project,
        file: file,
        target: target
    };
    if (target.method) {
        context.target_suffix = "." + target.method;
    }
    let result = await pipe([
        jobs.extract_module_target.set({
            include_dependencies: true,
            max_depth: 0,
            only_prototypes: true
        }),
        jobs.get_unit_test_template,
        jobs.test_template_dry_run
    ])(context);
}

async function getTestCases(project, file, target) {
    console.log('Generating Unit Test cases...');
    let context = {
        project: project,
        file: file,
        target: target,
        chat_options: plugin_config.config.chat_options.generate_unit_test_cases
    };
    if (target.method) {
        context.target_suffix = "." + target.method;
    }
    let result = await pipe([
        jobs.extract_module_target.set({
            include_dependencies: true,
            max_depth: 0,
            // only_prototypes: true
        }),
        jobs.generate_unit_test_cases.remote()
    ])(context);
    let test_cases = result.unit_test_cases;
    return test_cases;
}

async function applyUnitTests(path, test_code) {
    fse.outputFileSync(path, test_code);
}

function getOutputPath(project, file, target_name) {
    let unit_test_output_path = plugin_utils.getUnitTestsOutputPath(project, file, target_name, false);
    return project.root_path + '/' + unit_test_output_path;
}

async function openFile(filePath) {
    let document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
}

module.exports = generateTargetUnitTestSuite;