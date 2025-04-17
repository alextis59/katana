const Job = require('../../../../lib/jobs/Job'),
    test_runner = require('../../../../lib/test_runner'),
    template_builder = require('../../../../lib/template_builder'),
    target_model = require('../../../../jobs/model/target_model');

class RunUnitTest extends Job {

    name = 'run_unit_test';

    description = 'Run unit test for a JS function';

    inputs = {
        project: {
            type: 'Project',
            description: 'Target project'
        },
        file: {
            type: 'File',
            description: "File object corresponding to the function's module"
        },
        target: target_model,
        test_template: {
            type: 'object',
            description: 'Template of the unit test'
        },
        test_code: {
            type: 'string',
            description: 'Code of the unit test'
        },
        test_framework: {
            type: 'string',
            description: 'Test framework to use',
            default_value: 'jest'
        },
        with_coverage: {
            type: 'boolean',
            description: 'Whether to run the unit test for coverage or not',
            default_value: true
        },
        fails_for_empty_coverage: {
            type: 'boolean',
            description: 'Whether to fail the test if the coverage is empty',
            default_value: true
        }
    };

    outputs = {
        test_results: {
            type: 'object',
            description: 'Results of the unit test'
        },
        coverage: {
            type: 'object',
            description: 'Coverage results',
            optional: true
        }
    };

    execute = async (context) => {
        let {project, file, target, test_code, test_template, test_framework, with_coverage} = context,
            file_path = file.absolute_path,
            run_code = template_builder.fillTemplateCodePaths(test_code, test_template.libs, file_path);
        let results = await test_runner.runTestCode(project, run_code, { 
            include_output: true, 
            test_framework, 
            coverage: with_coverage,
            target_file_path: file.absolute_path
        }), coverage;
        if(with_coverage){
            coverage = {
                executed: [],
                not_executed: []
            };
            let coverage_lines = results.coverage.lines,
                target_data = file.getTarget(target);
            if(target_data && target_data.lines_indexes){
                let start = target_data.lines_indexes.start + 2,
                    end = target_data.lines_indexes.end,
                    j = 1;
                if(target_data.js_doc_lines_indexes){
                    start = target_data.js_doc_lines_indexes.end + 3;
                }
                for(let i = start; i <= end; i++){
                    if(coverage_lines.includes(i)){
                        coverage.executed.push(j);
                    } else {
                        coverage.not_executed.push(j);
                    }
                    j++;
                }
            }
            if(results.success && coverage.executed.length === 0 && context.fails_for_empty_coverage){
                results.success = false;
                results.output = 'Error: No coverage for the target function (tested function was not executed)';
            }
        }
        return { test_results: results, coverage };
    }

}

module.exports = RunUnitTest;