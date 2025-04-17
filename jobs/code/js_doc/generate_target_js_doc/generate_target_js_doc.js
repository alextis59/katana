const AiJob = require('../../../../lib/jobs/AiJob'),
    fse = require('fs-extra'),
    path = require('path'),
    _ = require('lodash'),
    target_model = require('../../../model/target_model'),
    function_prompt = fse.readFileSync(path.join(__dirname, 'generate_function_js_doc_prompt.txt'), 'utf8'),
    class_prompt = fse.readFileSync(path.join(__dirname, 'generate_class_js_doc_prompt.txt'), 'utf8'),
    variable_prompt = fse.readFileSync(path.join(__dirname, 'generate_variable_js_doc_prompt.txt'), 'utf8');

function getPrompt(target_type){
    if(target_type === 'function'){
        return function_prompt;
    } else if(target_type === 'class'){
        return class_prompt;
    }else if(target_type === 'variable'){
        return variable_prompt;
    } else {
        throw new Error('Invalid target type: ' + target_type);
    }
}

class GenerateTargetJsDoc extends AiJob {

    constructor(props) {
        super();
        _.assign(this, props);
    }

    name = 'generate_target_js_doc';

    description = 'Generate JSDoc for a JS function/class/variable';

    chat_options = {
        prompt_name: 'generate_target_js_doc',
        model: 'gpt-3.5-turbo',
        max_tokens: 2048
    };

    prompt = function_prompt;

    inputs = {
        file: {
            type: 'File',
            description: 'File object containing the target function/class/variable'
        },
        target: target_model,
        target_suffix: {
            type: 'string',
            description: 'Suffix of the target',
            optional: true
        },
        code: {
            type: 'string',
            description: 'Code snippet of the target'
        },
        validate_js_doc: {
            type: 'boolean',
            description: 'Whether to validate the JSDoc or not',
            default_value: false
        },
        generate_count: {
            type: 'integer',
            description: 'Number of JSDoc to generate',
            default_value: 1
        },
        chat_options: {
            type: 'object',
            description: 'Chat options for the prompt',
            optional: true
        },
        prompt_target_type: {
            type: 'string',
            description: 'Type of the target',
            optional: true
        }
    };

    outputs = {
        js_doc: {
            type: 'string',
            description: 'Generated JSDoc',
            optional: (result) => {
                return result.js_doc_list !== undefined;
            }
        },
        js_doc_list: {
            type: 'array',
            description: 'Generated JSDoc list',
            optional: (result) => {
                return result.js_doc !== undefined;
            }
        }
    };


    execute = async (context, options) => {
        let {file, target, target_suffix, code, validate_js_doc, generate_count} = context,
            prompt_target_name = target.name + (target_suffix ? target_suffix : '');
        if (file.export_type !== 'class' || file.export_name !== target.name) {
            prompt_target_name = file.module_name + '.' + prompt_target_name;
        }
        let prompt_context = {
            target_name: prompt_target_name,
            code: context.code
        };
        let job_prompt = this.buildPrompt(getPrompt(context. prompt_target_type || target.type), prompt_context),
            chat_options = _.assign({}, this.chat_options, context.chat_options || {}, options.chat_options_override || {});

        if (generate_count > 1) {
            chat_options.n = generate_count;
        }
        let results = (await this.jobs.get_chat_completion({
            prompt: job_prompt,
            chat_options: chat_options
        })).completion;

        let js_doc_list = [],
            generated = generate_count === 1 ? [{ result: results }] : results;
        for (let result of generated) {
            let js_doc = processResult(result.result);
            if (validate_js_doc) {
                try {
                    await this.jobs.is_valid_js_doc({ file: context.file, target: target, js_doc: js_doc });
                    js_doc_list.push(js_doc);
                } catch (err) { 
                    console.log('Error validating JSDoc...');
                    console.log(err);
                }
            } else {
                js_doc_list.push(js_doc);
            }
        }
        if (js_doc_list.length === 0) {
            this.throw('No valid JSDoc generated');
        } else {
            return generate_count === 1 ? { js_doc: js_doc_list[0] } : { js_doc_list: js_doc_list };
        }
    }

}

function processResult(result){
    let start_index = result.indexOf('/**'),
        end_index = result.indexOf('*/');
    if (start_index === -1){
        start_index = result.indexOf('/*');
        end_index = result.indexOf('*/', start_index + 2);
    }
    if (start_index === -1){
        start_index = result.indexOf('//');
        end_index = result.indexOf('\n', start_index);
    }
    let js_doc = result.substring(start_index, end_index + 2);
    return js_doc;
}

module.exports = GenerateTargetJsDoc;