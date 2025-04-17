const Job = require('../../../../lib/jobs/Job'),
    target_model = require('../../../model/target_model'),
    template_builder = require('../../../../lib/template_builder');

class GetUnitTestTemplate extends Job {

    name = 'get_unit_test_template';

    description = 'Get unit test template for a JS function or class';

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
        code: {
            type: 'string',
            description: 'Code snippet of the target to test',
            auto_fill: true
        },
        test_index: {
            type: 'integer',
            description: 'Index of the test case',
            default_value: 0
        },
        test_case: {
            type: 'string',
            description: 'Description of the test case',
            optional: true
        },
        setup_code: {
            type: 'string',
            description: 'Setup code for the unit test',
            // auto_fill: true
            optional: true
        },
        test_framework: {
            type: 'string',
            description: 'Test framework to use',
            default_value: "jest"
        }
    };

    outputs = {
        test_template: {
            type: 'object',
            description: 'Template of the unit test'
        }
    };

    execute = async (context) => {
        try{
            let {project, file, target, code, test_index, test_case, setup_code, test_framework} = context,
                template = template_builder.initializeModuleFunctionUnitTestTemplate(project, file, code, target.type, target.name, {test_framework});
            if(test_case){
                template = template_builder.getFilledModuleFunctionUnitTestTemplateClone(template, test_case, test_index, {setup_code, test_framework});
            }
            return {test_template: template}
        }catch(err){
            this.throw('Error while getting unit test template', err);
        }
    }

}

module.exports = GetUnitTestTemplate;