const Job = require('../../../../lib/jobs/Job'),
    _ = require('lodash'),
    utils = require('../../../../lib/utils'),
    target_model = require('../../../model/target_model');

class SelectBestTestCode extends Job {

    name = 'select_best_test_code';

    description = 'Select the best test code from a list of test codes';

    inputs = {
        project: {
            type: 'Project',
            description: 'Project class'
        },
        file: {
            type: 'File',
            description: "File object corresponding to the function's module"
        },
        target: target_model,
        test_case: {
            type: 'string',
            description: 'Test case description'
        },
        test_template: {
            type: 'object',
            description: 'Template of the unit test'
        },
        test_code_list: {
            type: 'array',
            description: 'Code of the unit test'
        },
        agent_evaluation: {
            type: 'boolean',
            description: 'Whether to evaluate the test code using the agent or not',
            default_value: false
        },
        agent_evaluation_max_count: {
            type: 'integer',
            description: 'Maximum number of test codes to evaluate using the agent',
            default_value: 3
        }
    };

    outputs = {
        test_code: {
            type: 'string',
            description: 'Code of the unit test'
        },
        passing_test: {
            type: 'boolean',
            description: 'Whether the returned test passes or not'
        }
    };

    execute = async (context) => {
        let test_code_list = utils.sortByLineCount(context.test_code_list),
            passing_test_code_list = [];
        for (let index = 0; index < test_code_list.length; index++) {
            let test_code = test_code_list[index];
            try {
                await this.jobs.unit_test_success({ 
                    project: context.project, 
                    file: context.file,
                    target: context.target,
                    test_template: context.test_template,
                    test_code 
                });
                passing_test_code_list.push(test_code);
            } catch (err) {}
        }
        if (passing_test_code_list.length > 0) {
            return {
                test_code: passing_test_code_list[0],
                passing_test: true
            }
        }
        if (context.agent_evaluation) {
            let target_code_list = passing_test_code_list.length > 0 ? passing_test_code_list : test_code_list;
            if (target_code_list.length > 1) {
                try {
                    let evaluate_code_list = target_code_list.slice(0, context.agent_evaluation_max_count);
                    let best_test_code = (await this.jobs.evaluate_best_test_code({
                        file: context.file,
                        target: context.target,
                        test_case: context.test_case,
                        test_code_list: evaluate_code_list
                    })).test_code;
                    return {
                        test_code: best_test_code,
                        passing_test: passing_test_code_list.length > 0
                    }
                } catch (err) {
                    console.log(err);
                }
            }
        }
        return {
            test_code: passing_test_code_list.length > 0 ? passing_test_code_list[0] : _.sample(test_code_list),
            passing_test: passing_test_code_list.length > 0
        }
    }

}

module.exports = SelectBestTestCode;