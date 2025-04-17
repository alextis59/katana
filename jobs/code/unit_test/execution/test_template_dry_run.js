const Job = require('../../../../lib/jobs/Job');

class TestTemplateDryRun extends Job {

    name = 'test_template_dry_run';

    description = 'Run unit test for an empty JS function test template and throw an error if it fails';

    inputs = {
        project: {
            type: 'Project',
            description: 'Target project'
        },
        file: {
            type: 'File',
            description: "File object corresponding to the function's module"
        },
        test_template: {
            type: 'object',
            description: 'Template of the unit test',
            auto_fill: true
        },
        throw_if_fail: {
            type: 'boolean',
            description: 'If true, throw an error if the test fails',
            default_value: true
        }
    };

    outputs = {
        success: {
            type: 'boolean',
            description: 'True if the test is passing'
        }
    };

    execute = async (context) => {
        let test_context = {...context};
        test_context.test_code = context.test_template.content;
        test_context.fails_for_empty_coverage = false;
        let test_results = (await this.jobs.run_unit_test(test_context)).test_results;
        if(!test_results.success && context.throw_if_fail){
            this.throw('Unit test failed', test_results);
        }
        return {success: test_results.success};
    }

}

module.exports = TestTemplateDryRun;