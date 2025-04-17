const AiJob = require('../../../../lib/jobs/AiJob'),
    target_model = require('../../../model/target_model'),
    _ = require('lodash'),
    fse = require('fs-extra'),
    path = require('path'),
    code_utils = require('../../../../lib/code_utils'),
    prompt = fse.readFileSync(path.join(__dirname, 'unit_test_coverage_annotation_prompt.txt'), 'utf8');

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
        chat_options: {
            type: 'object',
            description: 'Chat options for the prompt',
            optional: true
        },
        get_prompt: {
            type: 'boolean',
            description: 'Return the prompt instead of executing the job',
            optional: true
        },
    };

    outputs = {
        annoted_code: {
            type: 'string',
            description: 'Annotated code of the unit test'
        },
        coverage: {
            type: 'object',
            description: 'Coverage of the test case',
            properties: {
                executed: {
                    type: 'array',
                    description: 'Index list of executed lines'
                },
                not_executed: {
                    type: 'array',
                    description: 'Index list of not executed lines'
                }
            }
        },
        prompt: {
            type: 'string',
            description: 'Prompt for the job',
            optional: true
        }
    };

    execute = async (context, options = {}) => {
        try{
            let {file, target, target_suffix, code, test_case, chat_model} = context;
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
            if(context.get_prompt){
                return {
                    prompt: prompt
                }
            }
            let generate_context = {
                prompt: prompt,
                chat_options: chat_options,
                validate_code: false
            }
    
            let annoted_code = (await this.jobs.generate_code(generate_context)).code,
                orginal_code = file.getTarget(target).code,
                coverage = processAnnotedCoverage(orginal_code, annoted_code);
            return {
                annoted_code: annoted_code,
                coverage: coverage
            }
        }catch(err){
            console.log(err);
            throw err;
        }
        
    }

}

function processAnnotedCoverage(original_code, annoted_code) {
    let original_data = parseCodeLines(original_code),
        annoted_data = parseCodeLines(annoted_code);
    matchCodeLines(original_data, annoted_data);
    let coverage = {
        executed: [],
        not_executed: []
    };
    for(let i = 1; i < original_data.length - 1; i++){
        let line = original_data[i];
        if(line.coverage.executed){
            coverage.executed.push(i);
        }else if(line.coverage.not_executed){
            coverage.not_executed.push(i);
        }
    }
    return coverage;
}

function matchCodeLines(original_data, annoted_data){
    let i = 1, j = 1;
    while(i < original_data.length - 1 && j < annoted_data.length - 1){
        let original_code_line = original_data[i],
            annoted_code_line = annoted_data[j];
        if(original_code_line.is_comment){
            i++;
            continue;
        }
        if(annoted_code_line.is_comment){
            j++;
            continue;
        }
        if(original_code_line.code_without_comment === annoted_code_line.code_without_comment){
            original_code_line.coverage = annoted_code_line.coverage;
        }else{
            throw new Error('Code lines do not match: ' + original_code_line.code_without_comment + ' != ' + annoted_code_line.code_without_comment);
        }
        i++;
        j++;
    }
}

function processAnnotedCoverageOld(annoted_code, original_code) {
    let lines = code.split('\n');
    let coverage = {
        executed: [],
        not_executed: []
    };
    for (let i = 1; i < lines.length - 1; i++) {
        let line = lines[i],
            comment = line.split('//')[1],
            code_line = line.split('//')[0].trim();
        if(code_line === '{' || code_line === '}'){
            continue;
        }
        if (comment) {
            if (comment.includes('#executed')) {
                coverage.executed.push(i);
            } else if (comment.includes('#not-executed')) {
                coverage.not_executed.push(i);
            }
        }
    }
    return coverage;
}

function parseCodeLines(code){
    let lines_data = [],
        lines = code.split('\n');
    for(let line of lines){
        let data = {code: line, coverage: {}};
        if(code_utils.isCommentLine(line)){
            data.is_comment = true;
        }else{
            let trimmed = line.trim();
            if(code_utils.hasComment(trimmed)){
                data.has_comment = true;
                let splitted = trimmed.split(trimmed.includes('//') ? '//': '/*');
                data.code_without_comment = splitted[0].trim();
                let comment = splitted[1].trim();
                data.comment = comment;
                if(data.code_without_comment !== '{' && data.code_without_comment !== '}'){
                    if (comment.includes('#executed')) {
                        data.coverage.executed = true;
                    } else if (comment.includes('#not-executed')) {
                        data.coverage.not_executed = true;
                    }
                }
            }else{
                data.code_without_comment = trimmed;
            }
        }
        lines_data.push(data);
    }
    return lines_data;
}

function getNextMatchingIndexes(original_code, annoted_code, index){
    let matching_index = index,
        code_line_to_match = getUncommentedLine(original_code[index]);
    while(i < annoted_code.length - 1 && j < original_code.length - 1){
        let annoted_code_line = getUncommentedLine(annoted_code[i]),
            original_code_line = getUncommentedLine(original_code[j]);
        
    }
    return {end: true};
}

function getUncommentedLine(line){
    return line.split('//')[0].trim();
}

module.exports = UnitTestCoverageAnnotation;