const AiJob = require('../../../../../lib/jobs/AiJob'),
    target_model = require('../../../../model/target_model'),
    _ = require('lodash'),
    fse = require('fs-extra'),
    path = require('path'),
    code_utils = require('../../../../../lib/code_utils'),
    prompt = fse.readFileSync(path.join(__dirname, 'fix_unit_test_code_prompt.txt'), 'utf8');

const suffix = '    });\n});',
    test_indent = '        ';

class FixUnitTestCode extends AiJob {

    constructor(props) {
        super();
        _.assign(this, props);
    }

    name = 'fix_unit_test_code';

    description = 'Fix unit test code for the corresponding test case for a JS function using test results';

    prompt = prompt;

    chat_options = {
        prompt_name: 'fix_unit_test_code',
        model: 'gpt-4o-mini',
        max_tokens: 2048
    };

    inputs = {
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
        test_case: {
            type: 'string',
            description: 'Description of the test case'
        },
        test_index: {
            type: 'integer',
            description: 'Index of the test case',
            optional: true,
            default_value: 0
        },
        test_code: {
            type: 'string',
            description: 'Code of the unit test'
        },
        test_template: {
            type: 'object',
            description: 'Template of the unit test',
            auto_fill: true
        },
        validate_code: {
            type: 'boolean',
            description: 'Whether to validate the code or not',
            default_value: true
        },
        test_function_count: {
            type: 'integer',
            description: 'Number of test functions to write',
            default_value: 1
        },
        analysis_generate_count: {
            type: 'integer',
            description: 'Number of test failure analysis to generate',
            default_value: 1
        },
        fix_generate_count: {
            type: 'integer',
            description: 'Number of fixed code to generate',
            default_value: 1
        },
        fix_chat_model: {
            type: 'string',
            description: 'Chat model to use',
            optional: true
        },
        pick_count: {
            type: 'integer',
            description: 'Number of test functions to randomly pick',
            optional: true
        },
        fix_try_count: {
            type: 'integer',
            description: 'Number of tries to fix the test code',
            default_value: 1
        },
        retry_from: {
            type: 'string',
            description: 'Job ID to retry from',
            optional: true
        },
        fix_for: {
            type: 'string',
            description: 'Job ID to fix for',
            optional: true
        },
    };

    outputs = {
        test_code: {
            type: 'string',
            description: 'Code of the unit test',
            optional: (result) => {
                return result.test_code_list !== undefined;
            }
        },
        test_code_list: {
            type: 'array',
            description: 'List of code of the unit test',
            optional: (result) => {
                return result.test_code !== undefined;
            }
        }
    };

    execute = async (context, options = {}) => {
        let test_code = context.test_code,
            test_context = Object.assign({}, context);
        test_context.test_code = test_code;
        let test_results = (await this.jobs.run_unit_test(test_context)).test_results;
        if (test_results.success) {
            return { test_code: test_code, passing_test: true };
        } else {
            try{
                let result = await this.fixTestCode(test_code, test_results, context, 0, options);
                if(!result.test_code){
                    return { test_code: test_code, passing_test: false };
                }else {
                    return result;
                }
            }catch(err){
                console.log(err);
                return { test_code: test_code, passing_test: false };
            }
        }
    }

    fixTestCode = async (test_code, test_results, context, try_count = 0, options) => {
        let result_test_code_list = [];
        console.log('Try number: ' + (try_count + 1) + " on max: " + context.fix_try_count);
        let fix_result = await this.generateCode(test_code, test_results, context, options);
        let test_code_list = fix_result.code_list,
            select_context = _.cloneDeep(context);
        select_context.test_code_list = test_code_list;
        let result = await this.jobs.select_best_test_code(select_context);
        if (result.passing_test) {
            return { test_code: result.test_code, passing_test: true };
        } else {
            result_test_code_list.push(result.test_code);
        }
        try_count++;
        if (try_count < context.fix_try_count) {
            for (let result_test_code of result_test_code_list) {
                let test_context = Object.assign({}, context);
                test_context.test_code = result_test_code;
                let new_test_results = (await this.jobs.run_unit_test(test_context)).test_results;
                context.retry_from = fix_result.job_id;
                return await this.fixTestCode(result_test_code, new_test_results, context, try_count, options);
            }
        }
        return { test_code: _.sample(result_test_code_list), passing_test: false, try_count: try_count };
    }

    generateCode = async (test_code, test_results, context, options) => {
        let template = context.test_template,
            generate_count = context.fix_generate_count,
            target = context.target,
            target_suffix = context.target_suffix,
            chat_model = context.fix_chat_model;
        let prompt_context = {
            code: context.code,
            test_results: test_results.output,
            test_code: test_code
        };
        let job_prompt = this.buildPrompt(this.prompt, prompt_context),
            chat_options = _.assign({}, this.chat_options, context.chat_options || {});
        chat_options.n = generate_count;
        if (chat_model) {
            chat_options.model = chat_model;
        }

        let generate_context = {
            prompt: job_prompt,
            chat_options: chat_options,
            validate_code: context.validate_code,
            test_function_count: context.test_function_count,
            generate_count: generate_count,
            options: {
                extract_last_block: 'it'
            }
        }

        let result = await this.jobs.generate_code.setOutput({ code: 'test_code', code_list: 'test_code_list' })(generate_context);
        let code_list = [],
            result_code_list = result.test_code_list || [result.test_code];
        for (let code of result_code_list) {
            let processed_code = processCode(code, template, {
                contains: [target_suffix ? target_suffix : target.name + '('],
                does_not_contain: ["'" + target.name + "').mockImplementation"]
            });
            if (processed_code) {
                code_list.push(processed_code);
            }else{
                code_list.push(generateUnimplementedTestCode(template, context.test_case));
            }
        }
        return {code_list};
    }

}

function processCode(code, template, options = {}, verify_contains = []) {
    let test_function_code = code_utils.getCodeBlockContent(code, 'it', false),
        indent = code_utils.getFirstLineIndent(test_function_code),
        missing_indent = code_utils.computeMissingIndent(indent, test_indent);
    if (missing_indent.length > 0) {
        test_function_code = code_utils.addLinesIndent(test_function_code, missing_indent);
    }
    if (test_function_code) {
        for (let content of (options.contains || [])) {
            if (content !== '.constructor' && !test_function_code.includes(content)) {
                // console.log('Test function does not contain: ' + content);
                return null;
            }
        }
        for (let content of (options.does_not_contain || [])) {
            if (test_function_code.includes(content)) {
                // console.log('Test function contains: ' + content);
                return null;
            }
        }
        return template.content_start + '\n' + test_function_code + '\n' + suffix;
    }
    return null;
}

function generateUnimplementedTestCode(template, test_case){
    return template.content_start + '\n' + test_indent + "it('" + test_case + "', () => {\n" + test_indent + "    throw new Error('Test not implemented');\n" + test_indent + "});\n" + suffix;
}

module.exports = FixUnitTestCode;