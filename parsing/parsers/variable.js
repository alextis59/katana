const { parse } = require('@babel/parser'),
    _ = require('lodash'),
    traverse = require('@babel/traverse').default,
    utils = require('./utils'),
    dependencies = require('./dependencies'),
    js_doc_parser = require('./js_doc');

const self = {

    parseVariableFromCode: (file_code, dependencies_libs, variable_code, name) => {
        let data = {
            name: name,
            code: variable_code,
            dependencies: [],
            js_doc: '',
            // indent: utils.computeVariableIndent(file_code, name) || "",
            indent: utils.computeCodeIndent(file_code, variable_code) || "",
            lines_indexes: utils.computeTargetLinesIndexes(file_code, variable_code),
            code_include_declaration: variable_code && (variable_code.indexOf(name + ':') === 0 || variable_code.indexOf(name + ' :') === 0)
        };
        if(data.lines_indexes){
            let js_doc_data = js_doc_parser.extractTargetJsDoc(file_code, data.lines_indexes.start);
            if(js_doc_data.js_doc){
                data.js_doc = js_doc_data.js_doc;
                data.js_doc_lines_indexes = js_doc_data.js_doc_lines_indexes;
            }
        }

        return data;
    },

    getVariableValueString(value) {
        let result = '';
        try {
            result = JSON.stringify(value)
            if (_.isFunction(value)) {
                result = value.name || 'anonymous function';
            } else if (_.isArray(value)) {
                let values = [];
                for (let item of value) {
                    values.push(self.getVariableValueString(item));
                }
                result = '[ ' + values.join(', ') + ' ]';
            } else if (_.isObject(value)) {
                let values = [];
                for (let key in value) {
                    values.push(key + ': ' + self.getVariableValueString(value[key]));
                }
                result = '{ ' + values.join(', ') + ' }';
            }
        } catch (err) {
            if (err.message.includes('Converting circular structure to JSON')) {
                if (_.isObject(value)) {
                    result = '{ ' + Object.keys(value).join(', ') + ' }';
                } else {
                    result = value.toString ? value.toString() : 'Circular structure';
                }
            }
        }
        return result;
    }

}

module.exports = self;