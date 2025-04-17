const AiJob = require('../../../../../lib/jobs/AiJob'),
    target_model = require('../../../../model/target_model'),
    _ = require('lodash'),
    fse = require('fs-extra'),
    path = require('path'),
    code_utils = require('../../../../../lib/code_utils'),
    prompt = fse.readFileSync(path.join(__dirname, 'write_unit_test_code_prompt.txt'), 'utf8'),
    prompt_with_annotation = fse.readFileSync(path.join(__dirname, 'write_unit_test_code_prompt_with_annotation.txt'), 'utf8');

const suffix = '    });\n});',
    test_indent = '        ';

class WriteUnitTestCode extends AiJob {

    constructor(props) {
        super();
        _.assign(this, props);
    }

    name = 'write_unit_test_code';

    description = 'Write unit test code for the corresponding test case for a JS function or class';

    chat_options = {
        prompt_name: 'write_unit_test_code',
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
        annoted_code: {
            type: 'string',
            description: 'Annotated code snippet of the function to test',
            optional: true
        },
        test_case: {
            type: 'string',
            description: 'Description of the test case'
        },
        test_template: {
            type: 'object',
            description: 'Template of the unit test'
        },
        additional_instructions: {
            type: 'array',
            description: 'Additional instructions to the AI',
            optional: true
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
        generate_count: {
            type: 'integer',
            description: 'Number of test functions to generate',
            default_value: 1
        },
        chat_options: {
            type: 'object',
            description: 'Chat options for the prompt',
            optional: true
        },
        extract_options: {
            type: 'object',
            description: 'Options for extracting the code',
            optional: true
        },
        retry_from: {
            type: 'string',
            description: 'Job ID to retry from',
            optional: true
        }
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
        let {file, target, target_suffix, code, annoted_code, test_case, test_template, additional_instructions, validate_code, test_function_count, generate_count, chat_model} = context;
        let prompt_target_name = target.name + (target_suffix ? target_suffix : '');
        if (file.export_type !== 'class' || file.export_name !== target.name) {
            prompt_target_name = file.module_name + '.' + prompt_target_name;
        }
        let prompt_context = {
                target_name: prompt_target_name,
                code: code,
                test_case: test_case,
                additional_instructions: additional_instructions,
                test_template: test_template.filled_content
            },
            chat_options = _.assign({}, this.chat_options, context.chat_options || {}, options.chat_options_override || {}),
            target_prompt = chat_options.prompt || (annoted_code ? prompt_with_annotation : this.prompt);
        if(annoted_code){
            prompt_context.annoted_code = annoted_code;
        }
        let prompt = this.buildPrompt(target_prompt, prompt_context);
        if (chat_model) {
            chat_options.model = chat_model;
        }
        let generate_context = {
            prompt: prompt,
            chat_options: chat_options,
            validate_code: validate_code,
            test_function_count: test_function_count,
            generate_count: generate_count,
            options: {
                extract_last_block: 'it'
            }
        }
        if(context.extract_options){
            Object.assign(generate_context.options, context.extract_options);
        }
        let result = await this.jobs.generate_code.setOutput({ code: 'test_code', code_list: 'test_code_list' })(generate_context);
        let code_list = [],
            result_code_list = result.test_code_list || [result.test_code];
        for (let code of result_code_list) {
            let processed_code = processCode(code, test_template, {
                contains: [target_suffix ? target_suffix : target.name + '('],
                does_not_contain: ["'" + target.name + "').mockImplementation"]
            });
            if (processed_code) {
                code_list.push(processed_code);
            }else {
                code_list.push(generateUnimplementedTestCode(test_template, test_case));
            }
        }
        if(code_list.length === 0){
            return this.throw('No valid test code generated');
        }
        return generate_count === 1 ? { test_code: code_list[0] } : { test_code_list: code_list };
    }

}

function processCode(code, template, options = {}) {
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

module.exports = WriteUnitTestCode;