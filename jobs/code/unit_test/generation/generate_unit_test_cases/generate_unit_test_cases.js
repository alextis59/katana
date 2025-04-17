const AiJob = require('../../../../../lib/jobs/AiJob'),
    target_model = require('../../../../model/target_model'),
    _ = require('lodash'),
    fse = require('fs-extra'),
    path = require('path'),
    prompt = fse.readFileSync(path.join(__dirname, 'generate_unit_test_cases_prompt.txt'), 'utf8');

class GenerateUnitTestCases extends AiJob {

    constructor(props) {
        super();
        _.assign(this, props);
    }

    name = 'generate_unit_test_cases';

    description = 'Generate unit test cases for a JS function or class';

    chat_options = {
        prompt_name: 'generate_unit_test_cases',
        system_prompt: 'As a world-class software engineer, your task is to create unit test cases description for a specific JS function that must cover all of its lines and branches.',
        model: 'gpt-3.5-turbo',
        max_tokens: 2048,
        expect_json: true
    };

    prompt = prompt;

    inputs = {
        file: {
            type: 'File',
            description: 'File object'
        },
        target: target_model,
        target_suffix: {
            type: 'string',
            description: 'Suffix of the target',
            optional: true
        },
        code: {
            type: 'string',
            description: 'Code snippet of the function to test'
        },
        max_test_case_count: {
            type: 'integer',
            description: 'Maximum number of test cases to generate',
            default_value: 40
        },
        generate_count: {
            type: 'integer',
            description: 'Number of test cases lists to generate',
            default_value: 1
        }
    };

    outputs = {
        unit_test_cases: {
            type: 'array',
            description: 'List of test cases',
            optional: (result) => {
                return result.unit_test_cases_list !== undefined;
            }
        },
        unit_test_cases_list: {
            type: 'array',
            description: 'List of test cases lists',
            optional: (result) => {
                return result.unit_test_cases !== undefined;
            }
        }
    };

    execute = async (context, options = {}) => {
        let {file, generate_count, target, target_suffix, code, max_test_case_count} = context;
        let prompt_target_name = target.name + (target_suffix ? target_suffix : '');
        if(file.export_type !== 'class' || file.export_name !== target.name){
            prompt_target_name = file.module_name + '.' + prompt_target_name;
        }
        this.log(0, 'Generating unit test cases for target ' + target.name + '...');
        let prompt_context = {
            target_name: prompt_target_name,
            code: code
        };
        let prompt = this.buildPrompt(this.prompt, prompt_context),
            chat_options = _.assign({}, this.chat_options, context.chat_options || {}, options.chat_options_override || {});
        if (generate_count > 1) {
            chat_options.n = generate_count;
        }
        let results = (await this.jobs.get_chat_completion({
            messages: [{ role: 'user', content: prompt }],
            chat_options: chat_options
        })).completion;
        let test_cases_list = [],
            generated = generate_count === 1 ? [results] : results;
        for (let result of generated) {
            let test_cases = result.testCases;
            test_cases = _.uniq(test_cases);
            if (test_cases.length > max_test_case_count) {
                test_cases = test_cases.slice(0, max_test_case_count);
            }
            test_cases_list.push(test_cases);
        }
        return generate_count === 1 ? { unit_test_cases: test_cases_list[0] } : { unit_test_cases_list: test_cases_list };
    }

}

module.exports = GenerateUnitTestCases;