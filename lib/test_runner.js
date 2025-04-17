const { exec } = require('child_process'),
    fse = require('fs-extra'),
    _ = require('lodash'),
    logger = require('./log'),
    utils = require('./utils'),
    code_utils = require('./code_utils'),
    xml2js = require('xml2js'),
    config = require('../config');

function execCmd(cmd) {
    return new Promise((resolve, reject) => {
        let output = '';

        const process = exec(cmd);

        process.stdout.on('data', (data) => {
            output += data;
        });

        process.stderr.on('data', (data) => {
            output += data;
        });

        process.on('close', (code) => {
            if (code !== 0) {
                resolve({ error: new Error(`Command failed with code ${code}`), output });
            } else {
                resolve({ output });
            }
        });
    });
}

function log(level, ...args) {
    logger.log(level, 'test_runner: ', ...args);
}

// Commands to verify if test framework is installed
const verify_cmd_map = {
    'mocha': 'npx mocha --version',
    'jest': 'npx jest --version'
}

// Commands to run a test file for different test frameworks
const run_cmd_map = {
    'mocha': 'npx mocha {path} --exit --timeout=5s',
    'jest': 'npx jest {path} --testTimeout=2000 --forceExit'
}

let run_index = 0;

let running_tests = false;

const self = {

    verifyTestFramework: async (framework, project_root_path) => {
        log(5, 'verifyTestFramework', framework);
        try {
            let cmd = verify_cmd_map[framework];
            cmd = 'cd ' + project_root_path + ' && ' + cmd;
            let { error, output } = await execCmd(cmd);
            if (error) {
                return false;
            }
            return true;
        } catch (e) {
            console.log('Unexpected error while verifying test framework:', e);
            return false;
        }
    },

    runTestCode: async (project, code, options = {}) => {
        log(5, 'runTestCode', code.length);
        try {
            while (running_tests) {
                await utils.wait(20);
            }
            running_tests = true;
            let target_path = project.root_path + '/' + (options.test_run_file_path || config.project.test_run_file_path);
            fse.outputFileSync(target_path, code);
            let results = await self.runTestFile(project, target_path, options);
            running_tests = false;
            return results;
        } catch (e) {
            console.log('Unexpected error while running tests:', e);
            running_tests = false;
            throw e;
        }
    },

    runTestFile: async (project, path, options = {}) => {
        log(5, 'runTestFile', path);
        let test_framework = options.test_framework || 'jest',
            cmd = run_cmd_map[test_framework].replace('{path}', path);
        try {
            cmd = 'cd ' + project.root_path + ' && ' + cmd;
            if (options.coverage) {
                cmd += ' --coverage';
            }
            console.log('Executing test cmd');
            let { error, output } = await execCmd(cmd);
            console.log('Test cmd executed');
            let results = parseOutputResults(output, test_framework);
            results.success = results.count > 0 && results.failed === 0;
            if (options.include_output) {
                if (!results.success) {
                    results.first_error_line = parseFirstErrorLine(output);
                }
                output = fillTestRunResults(output);
                output = filterResults(output);
                results.output = output;
            }
            let code = fse.readFileSync(path, 'utf8');
            logger.logFile(1, 'test_run/' + run_index + '.txt', output + '\n\nFirst error line: ' + results.first_error_line + '\n\n\n' + code);
            if (error) {
                //console.log('Error while running tests:', error);
                results.error = error;
                // logger.logFile(5, 'test_run/' + run_index + '_error.txt', error.toString());
            }
            run_index++;

            if (!results.success) {
                // console.log('Failed test file: ' + path);
                // console.log(results);
            }
            if(options.coverage && options.target_file_path){
                let coverage_file = project.root_path + '/coverage/clover.xml';
                console.log('Parsing coverage');
                if(fse.existsSync(coverage_file)){
                    let coverage = await parseCloverXml(coverage_file, options.target_file_path);
                    // results.coverage = coverage;
                    results.coverage = coverage;
                }
            }
            return results;
        } catch (e) {
            console.log('Unexpected error while running tests:', e);
            // If there's any unexpected error, you might want to throw it further
            throw e;
        }
    }

}

function parseMochaRunResults(test_output) {
    let output_lines = test_output.split('\n'),
        result_lines = [],
        first_result_line_found = false;
    for (let line of output_lines) {
        if (line.includes('passing (') && line.includes('ms)')) {
            first_result_line_found = true;
            result_lines.push(line);
        } else if (first_result_line_found) {
            if (line.trim() !== '') {
                result_lines.push(line);
            } else {
                break;
            }
        }
    }
    let results = { count: 0, passed: 0, failed: 0 };
    for (let line of result_lines) {
        if (line.indexOf('passing') > -1) {
            let parts = line.split(' '),
                count = parseInt(parts[2]);
            results.count += count;
            results.passed += count;
        } else if (line.indexOf('failing') > -1) {
            let parts = line.split(' '),
                count = parseInt(parts[2]);
            results.count += count;
            results.failed += count;
        }
    }
    return results;
}

function getJestResult(result_line, target) {
    if (result_line.includes(target)) {
        return parseInt(_.last(result_line.split(' ' + target)[0].split(' ')));
    } else {
        return 0;
    }
}

function parseJestRunResults(test_output) {
    let result_line = utils.getFirstMatchingLine(test_output, ['Tests:', 'total'], true) || "",
        results = {
            count: getJestResult(result_line, 'total'),
            passed: getJestResult(result_line, 'passed'),
            failed: getJestResult(result_line, 'failed')
        };
    return results;
}

function parseOutputResults(test_output, test_framework) {
    if (test_framework === 'mocha') {
        return parseMochaRunResults(test_output);
    } else if (test_framework === 'jest') {
        return parseJestRunResults(test_output);
    } else {
        return {};
    }
}

function filterResults(output){
    let lines = output.split('\n'),
        split_index = code_utils.findLineIndex(lines, ['File', '% Stmts', '% Branch', '% Funcs', '% Lines']) - 1;
    if(split_index >= 0){
        lines = lines.slice(0, split_index);
    }
    return lines.join('\n');
}

function fillTestRunResults(test_run_results) {
    let result_lines = test_run_results.split('\n'),
        processed = result_lines;
    if (processed.length > 100) {
        processed = processed.slice(0, 100);
    }
    return processed.join('\n');
}

function parseFirstErrorLine(output) {
    let lines = output.split('\n'),
        first_error_line = '';
    for (let line of lines) {
        line = line.trim();
        if (line.indexOf(':') > -1) {
            let start = line.split(':')[0];
            if (start.split(' ').length === 1 && start.indexOf('Error') > -1) {
                first_error_line = line;
                break;
            }
        }
    }
    return first_error_line;
}

function parseCloverXml(coverageFilePath, target_file_path) {

    return new Promise((resolve, reject) => {
        fse.readFile(coverageFilePath, 'utf-8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }

            xml2js.parseString(data, (parseErr, result) => {
                if (parseErr) {
                    reject(parseErr);
                    return;
                }

                const file = findCoverageTargetFile(result.coverage, target_file_path);
                if(!file){
                    resolve({
                        lines: []
                    });
                    return;
                }
                const lines = file.line;

                const coveredLines = lines
                    .filter(line => parseInt(line.$.count) > 0)
                    .map(line => parseInt(line.$.num));

                resolve({
                    lines: coveredLines
                });
            });
        });
    });
}

function findCoverageTargetFile(coverage, target_path) {
    if(coverage.file){
        for(let file of coverage.file){
            if(file.$.path === target_path){
                return file;
            }
        }
    }
    if(coverage.package){
        for(let package of coverage.package){
            let match = findCoverageTargetFile(package, target_path);
            if(match){
                return match;
            }
        }
    }
    if(coverage.project){
        for(let project of coverage.project){
            let match = findCoverageTargetFile(project, target_path);
            if(match){
                return match;
            }
        }
    }
    return undefined;
}

module.exports = self;