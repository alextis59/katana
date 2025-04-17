const AiJob = require('../../../lib/jobs/AiJob'),
    _ = require('lodash'),
    utils = require('../../../lib/utils'),
    code_utils = require('../../../lib/code_utils');

class GenerateCode extends AiJob {

    constructor(props) {
        super();
        _.assign(this, props);
    }

    name = 'generate_code';

    description = 'Generate JS code from a prompt';

    chat_options = {
        prompt_name: 'generate_code',
        model: 'gpt-3.5-turbo'
    };

    inputs = {
        prompt: {
            type: 'string',
            description: 'Prompt to generate code from'
        },
        chat_options: {
            type: 'object',
            description: 'Chat options for the prompt',
            optional: true
        },
        prefix: {
            type: 'string',
            description: 'Prefix to add to the generated code',
            default_value: ''
        },
        suffix: {
            type: 'string',
            description: 'Suffix to add to the generated code',
            default_value: ''
        },
        validate_code: {
            type: 'boolean',
            description: 'Whether to validate the code or not',
            default_value: true
        },
        test_function_count: {
            type: 'integer',
            description: 'Number of test functions to write',
            optional: true
        },
        generate_count: {
            type: 'integer',
            description: 'Number of test functions to generate',
            default_value: 1
        },
        options: {
            type: 'object',
            description: 'Options',
            optional: true
        }
    };

    outputs = {
        code: {
            type: 'string',
            description: 'Generated code',
            optional: (result) => {
                return result.code_list !== undefined;
            }
        },
        code_list: {
            type: 'array',
            description: 'List of generated code',
            optional: (result) => {
                return result.code !== undefined;
            }
        }
    };

    execute = async (context) => {
        let prompt = context.prompt,
            generate_count = context.generate_count,
            chat_options = _.merge({}, this.chat_options, context.chat_options || {}),
            prefix = context.prefix || '',
            suffix = context.suffix || '',
            options = context.options || {};
        chat_options.n = generate_count;
        let completion_context = {
            chat_options: chat_options
        };
        if (chat_options.completion) {
            completion_context.prompt = prompt;
        } else {
            completion_context.messages = [{ role: 'user', content: prompt }];
        }
        let results = (await this.jobs.get_chat_completion(completion_context)).completion;
        let code_list = [],
            generated = generate_count === 1 ? [results] : results;
        for (let result of generated) {
            let code = cleanCode(prefix + result + suffix, options);
            if (context.validate_code) {
                try {
                    await this.jobs.is_valid_code({ code: code, test_function_count: context.test_function_count });
                    code_list.push(code);
                } catch (err) {
                    if (generate_count === 1) {
                        return this.throw('Invalid code generated', err);
                    }
                }
            } else {
                code_list.push(code);
            }
        }
        return generate_count === 1 ? { code: code_list[0] } : { code_list };
    }

}

function cleanCode(code, options = {}) {
    if(code && options.extract_xml){
        let data = code_utils.extractXmlToJson(code);
        if(data.code){
            code = data.code;
        }else{
            code = code_utils.extractCode(code);
        }
    }else if(code){
        code = code_utils.extractCode(code);
    }
    if (options.extract_block) {
        code = code_utils.getCodeBlockContent(code, options.extract_block, true);
    } else if (options.extract_last_block) {
        code = code_utils.getLastCodeBlockContent(code, options.extract_last_block, true);
    } else if (code && code.includes('```')) {
        let start_index = code.indexOf('```'),
            end_index = code.indexOf('```', start_index + 3);
        code = code.substring(start_index, end_index + 3);
        code = utils.removeMatchingLines(code, "```");
    }
    return code;
}

module.exports = GenerateCode;