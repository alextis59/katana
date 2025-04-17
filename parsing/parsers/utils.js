const utils = require('../../lib/utils'),
    code_utils = require('../../lib/code_utils')

const self = {

    computeCodeIndent(file_content, code) {
        if(!code){
            return "";
        }
        let code_lines = code.split('\n'),
            code_line = code_lines[0],
            file_code_line = utils.getFirstMatchingLine(file_content, code_line);
        return code_utils.getLineIndent(file_code_line);
    },

    computeVariableIndent(file_content, variable_name) {
        let variable_line = utils.getFirstMatchingLine(file_content, variable_name + ':') || utils.getFirstMatchingLine(file_content, variable_name + ' :');
        return code_utils.getLineIndent(variable_line);
    },

    computeTargetLinesIndexes: (content, search) => {
        let start_line = utils.getLineNumberFromMatch(content, search);
        // console.log(content);
        // console.log(search);
        if (start_line === -1) {
            return null;
        }
        let line_count = search.split('\n').length;
        return {
            start: start_line,
            end: start_line + line_count - 1
        }
    },

    getCodeLinesFromIndexes: (code, start_line_index, end_line_index, join = true) => {
        start_line_index = Math.max(0, start_line_index);
        end_line_index = Math.min(code.split('\n').length - 1, end_line_index);
        let lines = code.split('\n'),
            result = lines.slice(start_line_index, end_line_index + 1);
        return join ? result.join('\n') : result;
    },

}

module.exports = self;