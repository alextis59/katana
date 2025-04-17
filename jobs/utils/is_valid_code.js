const Job = require('../../lib/jobs/Job'),
    esprima = require('esprima-next'),
    code_utils = require('../../lib/code_utils');

class IsValidCode extends Job {

    name = 'is_valid_code';

    description = 'Check if the code is valid JS';

    inputs = {
        code: {
            type: 'string',
            description: 'Code to check'
        },
        test_function_count: {
            type: 'integer',
            description: 'Number of test functions in the code',
            optional: true
        }
    };

    outputs = {};

    execute = async (context) => {
        let code = context.code;
        this.log(5, 'code length:' + code.length);
        try {
            esprima.parseScript(code);
            let code_data = code_utils.computeCodeData(code);
            if(context.test_function_count != null){
                if(code_data.it !== context.test_function_count){
                    this.throw('The code is invalid', {
                        message: 'Invalid number of test functions: ' + code_data.it + ' instead of ' + context.test_function_count,
                        code
                    });
                }
            }
            return {};
        } catch(e) {
            this.throw('The code is invalid', e);
        }
    }

}

module.exports = IsValidCode;