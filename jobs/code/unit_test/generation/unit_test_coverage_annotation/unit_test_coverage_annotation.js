const AiJob = require('../../../../../lib/jobs/AiJob'),
    target_model = require('../../../../model/target_model'),
    _ = require('lodash'),
    fse = require('fs-extra'),
    path = require('path'),
    code_utils = require('../../../../../lib/code_utils'),
    prompt = fse.readFileSync(path.join(__dirname, 'unit_test_coverage_annotation_prompt_2.txt'), 'utf8');

const suffix = '    });\n});',
    test_indent = '        ';

class UnitTestCoverageAnnotation extends AiJob {

    constructor(props) {
        super();
        _.assign(this, props);
    }

    name = 'unit_test_coverage_annotation';

    description = 'Annotate the unit test code with the coverage needed for the corresponding test case for a JS function or class';

    chat_options = {
        prompt_name: 'unit_test_coverage_annotation',
        model: 'gpt-4o-mini',
        max_tokens: 2048
    };

    prompt = prompt;

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
        generate_count: {
            type: 'integer',
            description: 'Number of test functions to generate',
            default_value: 1
        },
        chat_options: {
            type: 'object',
            description: 'Chat options for the prompt',
            optional: true
        }
    };

    outputs = {
        annoted_code: {
            type: 'string',
            description: 'Annotated code of the unit test',
            optional: (result) => {
                return result.test_code_list !== undefined;
            }
        },
        annoted_code_list: {
            type: 'array',
            description: 'List of annotated code of the unit test',
            optional: (result) => {
                return result.test_code !== undefined;
            }
        }
    };

    execute = async (context, options = {}) => {
        try{
            let {file, target, target_name, target_suffix, code, test_case, generate_count, chat_model} = context;
            let prompt_target_name = target.name + (target_suffix ? target_suffix : '');
            if (file.export_type !== 'class' || file.export_name !== target.name) {
                prompt_target_name = file.module_name + '.' + prompt_target_name;
            }
            let prompt_context = {
                    target_name: prompt_target_name,
                    code: code,
                    test_case: test_case
                },
                chat_options = _.assign({}, this.chat_options, context.chat_options || {}, options.chat_options_override || {}),
                prompt = this.buildPrompt(chat_options.prompt || this.prompt, prompt_context, {targets: ['target_name', 'code', 'test_case']});
            if (chat_model) {
                chat_options.model = chat_model;
            }
            let generate_context = {
                prompt: prompt,
                chat_options: chat_options,
                validate_code: false,
                generate_count: generate_count,
                options: {
                    extract_last_block: 'it'
                }
            }
    
            let result = await this.jobs.generate_code.setOutput({ code: 'annoted_code', code_list: 'annoted_code_list' })(generate_context);
            let code_list = [],
                result_code_list = result.test_code_list || [result.test_code];
            for (let code of result_code_list) {
                let processed_code = processCode(code, test_template, {
                    contains: [target_suffix ? target_suffix : target.name + '('],
                    does_not_contain: ["'" + target.name + "').mockImplementation"]
                });
                if (processed_code) {
                    code_list.push(processed_code);
                }
            }
            if(code_list.length === 0){
                return this.throw('No valid test code generated');
            }
            return generate_count === 1 ? { annoted_code: code_list[0] } : { annoted_code_list: code_list };
        }catch(err){
            console.log(err);
            throw err;
        }
        
    }

}

function processCode(code, template, options = {}) {
    return code;
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

module.exports = UnitTestCoverageAnnotation;