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
        context.project.matchTestFrameworkRequirements(context.test_framework);
        let strategies = [
            {
                jobs: [
                    this.jobs.extract_module_target.set({
                        include_dependencies: false,
                        max_depth: 0,
                        // only_prototypes: true
                    }),
                    this.jobs.get_unit_test_template,
                    // this.jobs.test_template_dry_run,
                    this.jobs.write_unit_test_code.set({ generate_count: 1}).remote(),
                    this.jobs.fix_unit_test_code.set({ fix_try_count: 1}).remote()
                ],
                try_count: 1
            },
            // {
            //     jobs: [
            //         this.jobs.extract_module_target.set({
            //             include_dependencies: true,
            //             max_depth: 0,
            //             only_prototypes: true
            //         }),
            //         this.jobs.get_unit_test_template,
            //         // this.jobs.test_template_dry_run,
            //         this.jobs.write_unit_test_code.set({ generate_count: 1, chat_options: context.chat_options || {provider: 'openai', model: 'gpt-4o-mini'}  }),
            //         this.jobs.fix_unit_test_code
            //     ],
            //     try_count: 3
            // },
            // {
            //     jobs: [
            //         this.jobs.extract_module_target.set({
            //             include_dependencies: true,
            //             max_depth: 0,
            //             only_prototypes: true
            //         }),
            //         this.jobs.get_unit_test_template,
            //         // this.jobs.test_template_dry_run,
            //         this.jobs.write_unit_test_code.set({ generate_count: 1, chat_options: {provider: 'openai', model: 'gpt-4o'}  }),
            //     ],
            //     try_count: 1
            // }
        ];

        let last_test_code = "";
        for (let index = 0; index < strategies.length; index++) {
            let strategy = strategies[index];
            for (let i = 0; i < strategy.try_count; i++) {
                try {
                    let test_code = (await pipe(strategy.jobs)(context)).test_code;
                    if (test_code) {
                        last_test_code = test_code;
                        try {
                            let result = await this.verifyAndReturnTestCode(context, test_code, index, i);
                            if(result.passing_test) return result;
                        } catch (err) {

                        }
                    }
                } catch (err) {
                    console.log(err);
                }
            }
        }
        return await this.verifyAndReturnTestCode(context, last_test_code, strategies.length, _.last(strategies).try_count - 1);
    }

    verifyAndReturnTestCode = async (context, test_code, strategy_index, try_count) => {
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
        return { test_code, passing_test, strategy_index, try_count };
    }

}

module.exports = ImplementUnitTest;