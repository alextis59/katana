const { parse } = require('@babel/parser'),
    traverse = require('@babel/traverse').default,
    utils = require('./utils'),
    dependencies = require('./dependencies'),
    js_doc_parser = require('./js_doc');

const self = {

    parseFunctionFromCode: (file_code, dependencies_libs, function_code, name) => {
        let external_source = !file_code.includes(function_code);
        let data = {
            name: name,
            code: function_code,
            indent: utils.computeCodeIndent(file_code, function_code) || "",
            dependencies: external_source ? [] : dependencies.computeCodeLibsDependencies(function_code, dependencies_libs),
            js_doc: '',
            external_source: external_source
        };
        data.lines_indexes = utils.computeTargetLinesIndexes(file_code, function_code);
        if(!external_source){
            let js_doc_data = js_doc_parser.extractTargetJsDoc(file_code, data.lines_indexes.start);
            if(js_doc_data.js_doc){
                data.js_doc = js_doc_data.js_doc;
                data.js_doc_lines_indexes = js_doc_data.js_doc_lines_indexes;
            }
        }

        return data;
    }

}

module.exports = self;