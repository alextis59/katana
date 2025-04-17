const Job = require('../../../lib/jobs/Job'),
    extract = require('../../../parsing/extract'),
    target_model = require('../../model/target_model');

class ExtractModuleTarget extends Job {

    name = 'extract_module_target';

    description = 'Extract a module target code snippet (optionaly with its dependencies)';

    inputs = {
        project: {
            type: 'Project',
            description: 'Target project'
        },
        file: {
            type: 'File',
            description: 'Target file'
        },
        target: target_model,
        include_js_doc: {
            type: 'boolean',
            description: 'Include js doc in the extract',
            default_value: true
        },
        include_dependencies: {
            type: 'boolean',
            description: 'Include dependencies in the extract',
            optional: true
        },
        only_prototypes: {
            type: 'boolean',
            description: 'Only include prototypes in the extract',
            optional: true
        },
        max_depth: {
            type: 'integer',
            description: 'Maximum depth of dependencies to include',
            optional: true
        },
        exclude_target_function_js_doc: {
            type: 'boolean',
            description: 'Exclude js doc of the target function',
            optional: true
        },
        only_prototypes_exclude_target_function: {
            type: 'boolean',
            description: 'Exclude the target function if it is a prototype',
            default_value: true
        },
        target_function_code_override: {
            type: 'string',
            description: 'Code of the target function to use instead of the one in the file',
            optional: true
        }
    };

    outputs = {
        code: {
            type: 'string',
            description: 'Code snippet of the extracted function'
        }
    };

    execute = async (context) => {
        let options = {
            include_dependencies: context.include_dependencies,
            max_depth: context.max_depth,
            include_js_doc: context.include_js_doc,
            only_prototypes: context.only_prototypes,
            only_prototypes_exclude_target_function: context.only_prototypes_exclude_target_function,
            target_function_code_override: context.target_function_code_override
        }, target = context.target;
        if(context.exclude_target_function_js_doc){
            options.exclude_js_doc_targets = [target.name];
        }
        return {
            code: extract.extractModuleTarget(context.project, context.file, target, options)
        };
    }

}

module.exports = ExtractModuleTarget;