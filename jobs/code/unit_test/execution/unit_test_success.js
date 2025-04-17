const Job = require('../../../../lib/jobs/Job');

class UnitTestSuccess extends Job {

    name = 'unit_test_success';

    description = 'Run unit test for a JS function and throw an error if it fails';

    inputs = {
        file: {
            type: 'File',
            description: "File object corresponding to the function's module"
        },
        test_code: {
            type: 'string',
            description: 'Code of the unit test'
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
        let test_results = (await this.jobs.run_unit_test(context)).test_results;
        if(!test_results.success && context.throw_if_fail){
            this.throw('Unit test failed', test_results);
        }
        return {success: test_results.success};
    }

}

module.exports = UnitTestSuccess;