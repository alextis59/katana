const Job = require('../../../../lib/jobs/Job'),
    target_model = require('../../../model/target_model'),
    _ = require('lodash'),
    { pipe } = require('../../../../lib/jobs/jobs');

class ImplementUnitTest extends Job {

    name = 'implement_unit_test';

    description = 'Implement, validate and fix unit test for a function or class';

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
        target_suffix: {
            type: 'string',
            description: 'Suffix of the target',
            optional: true
        },
        test_case: {
            type: 'string',
            description: 'Description of the test case'
        },
        additional_instructions: {
            type: 'array',
            description: 'Additional instructions to the AI',
            optional: true
        },
        test_index: {
            type: 'integer',
            description: 'Index of the test case',
            default_value: 0
        },
        test_framework: {
            type: 'string',
            description: 'Test framework to use',
            default_value: 'jest'
        },
        write_test_count: {
            type: 'integer',
            description: 'Number of test functions write to attempt',
            default_value: 3
        },
        fix_test_count: {
            type: 'integer',
            description: 'Number of test functions fix to attempt',
            default_value: 3
        },
    };

    outputs = {
        test_code: {
            type: 'string',
            description: 'Code of the unit test'
        },
        passing_test: {
            type: 'boolean',
            description: 'True if the test is passing'
        }
    };

    execute = async (context) => {
        let { write_test_count, fix_test_count } = context,
            strategy = [
                this.jobs.extract_module_target.set({
                    include_dependencies: true,
                    max_depth: 0,
                    // only_prototypes: true
                }),
                this.jobs.get_unit_test_template,
                this.jobs.write_unit_test_code.remote(),
                this.jobs.fix_unit_test_code.setFrom('job_id', 'fix_for').set({ fix_try_count: fix_test_count, retry_from: undefined }).remote()
            ], last_test_code = "", test_template;
        for (let i = 0; i < write_test_count; i++) {
            try {
                let {test_code, test_template} = (await pipe(strategy)(context));
                if (test_code) {
                    last_test_code = test_code;
                    try {
                        let result = await this.verifyAndReturnTestCode(context, test_code, i);
                        if (result.passing_test) return result;
                    } catch (err) {
                        
                    }
                }
            } catch (err) {
                
            }
        }
        if(!last_test_code || last_test_code === '' && test_template){
            console.log('Last test code is empty, using the last test template');
            last_test_code = test_template.content;
        }
        return { test_code: last_test_code, passing_test: false };
    }

    verifyAndReturnTestCode = async (context, test_code, try_count) => {
        let passing_test = false;
        try {
            await pipe([
                this.jobs.extract_module_target,
                this.jobs.get_unit_test_template,
                this.jobs.unit_test_success
            ])({
                ...context,
                test_code
            });
            passing_test = true;
        } catch (err) {
            // console.log(err);
        }
        return { test_code, passing_test, try_count };
    }

}

module.exports = ImplementUnitTest;