const Job = require('../../lib/jobs/Job'),
    target_model = require('../model/target_model'),
    code_utils = require('../../lib/code_utils');

class IsValidJsDoc extends Job {

    name = 'is_valid_js_doc';

    description = 'Check if the JSDoc is valid';

    inputs = {
        file: {
            type: 'File',
            description: 'File object with the function/variable to check'
        },
        target: target_model,
        js_doc: {
            type: 'string',
            description: 'JSDoc to check'
        }
    };

    outputs = {};

    execute = async (context) => {
        let file = context.file,
            target = context.target,
            js_doc = context.js_doc;
        let lines = js_doc.split('\n');
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (i === 0) {
                if (line.indexOf('/**') === -1) {
                    this.throw('The JSDoc must start with /**');
                }
            } else if (i === lines.length - 1) {
                if (line.indexOf('*/') === -1) {
                    this.throw('The JSDoc must end with */');
                }
            } else {
                if (line.indexOf('*') === -1) {
                    this.throw('The JSDoc must have * on each line');
                }
                if (i === 1) {
                    if (target.type === 'function' && (line.includes('@param') || line.includes('@return'))) {
                        this.throw('The JSDoc must have a description before @param or @return');
                    }
                }
            }
        }
        if (target.type === 'function') {
            let param_list = code_utils.getFunctionParamList(file, target.name);
            for (let param of param_list) {
                if (param) {
                    let param_name = param.split('=')[0].trim();
                    if (!checkJsDocHasParam(js_doc, param_name)) {
                        this.throw('The JSDoc must have @param ' + param_name);
                    }
                }
            }
            // let js_doc_param_count = (js_doc.match(/@param/g) || []).length;
            // if (js_doc_param_count !== param_list.length) {
            //     this.throw('The JSDoc must have the same number of @param as the function');
            // }
        } else if (target.type === 'variable') {
            if (!js_doc.includes('@type') && !js_doc.includes('@property')) {
                this.throw('The JSDoc must have @type or @property');
            }
        }

        return {};
    }

}

function checkJsDocHasParam(js_doc, param_name) {
    let lines = js_doc.split('\n');
    for (let line of lines) {
        if (line.includes('@param') &&
            (line.includes(' ' + param_name + ' ') || line.includes(' [' + param_name + '] ') || line.includes(' [' + param_name + '='))) {
            return true;
        }
    }
    return false;
}

module.exports = IsValidJsDoc;