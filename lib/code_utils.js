const _ = require('lodash'),
    utils = require('./utils'),
    xml2js = require('xml2js'),
    logger = require('./log');

function log(level, ...args) {
    logger.log(level, 'code_utils: ', ...args);
}

const code_delimitors = [
    { start: '```javascript', end: '```' },
    { start: '```js', end: '```' },
    { start: '```', end: '```' },
    { start: '<code>', end: '</code>' }
]

const code_start_delimitors = ["```javascript", "```js"];

const code_end_delimitor = "```";

const block_list = [
    'it',
    'describe',
    'before',
    'beforeEach',
    'after',
    'afterEach',
];

const self = {

    extractCode: (code) => {
        for (let delimitor of code_delimitors) {
            if (code.includes(delimitor.start)) {
                let lines = code.split('\n'),
                    start_index = self.findLineIndex(lines, delimitor.start),
                    end_index = self.findLineIndex(lines, delimitor.end, start_index + 1);
                if (start_index > -1 && end_index > -1) {
                    return lines.slice(start_index + 1, end_index).join('\n');
                }
            }
        }
        return code;
    },

    findLineIndex: (lines, search, from_index = 0) => {
        let search_arr = search;
        if (!_.isArray(search)) {
            search_arr = [search];
        }
        for (let i = from_index; i < lines.length; i++) {
            let match = true;
            for (let s of search_arr) {
                if (!lines[i].includes(s)) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return i;
            }
        }
        return -1;
    },

    getFunctionParamList: (file, function_name, internal_function) => {
        let function_code = file[internal_function ? 'internal_function_map' : 'function_map'][function_name].code,
            code_lines = function_code.split('\n'),
            param_start_index = code_lines[0].indexOf('('),
            param_end_index = _.lastIndexOf(code_lines[0], ')'),
            param_list = code_lines[0].substring(param_start_index + 1, param_end_index).split(',');
        return param_list.map(param => param.trim())
    },

    computeCodeData: (code) => {
        let data = {};
        for (let block of block_list) {
            let count = utils.countOccurrences(code, '\n' + block + '(')
                + utils.countOccurrences(code, ' ' + block + '(')
                + utils.countOccurrences(code, '\t' + block + '(');
            if (code.indexOf(block + '(') === 0) {
                count++;
            }
            data[block] = count;
        }
        return data;
    },

    fixCodeLibRequirePlaceholders: (code, libs = []) => {
        log(4, 'fixCodeLibRequirePlaceholders', code.length);
        let lines = code.split('\n'),
            included_libs = [];
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (line.indexOf('require(') > -1) {
                for (let lib of libs) {
                    if (lib.object && line.indexOf('{') > -1) {
                        let included = false,
                            require_index = line.indexOf('require(');
                        for (let name of lib.object_list) {
                            let index = line.indexOf(name);
                            if (index > -1 && index < require_index) {
                                included = true;
                                included_libs.push(lib);
                                break;
                            }
                        }
                        if (included && lib.local) {
                            lines[i] = 'const { ' + lib.object_list.join(', ') + ' } = require("[' + lib.path_placeholder + ']");';
                        }
                    } else {
                        if (line.indexOf(' ' + lib.name + ' ') > -1) {
                            included_libs.push(lib);
                            if (lib.local) {
                                lines[i] = 'const ' + lib.name + ' = require("[' + lib.path_placeholder + ']");';
                            }
                        }
                    }
                }
            }
        }
        for (let lib of libs) {
            if (included_libs.indexOf(lib) === -1) {
                let name = lib.name,
                    path = lib.local ? '[' + lib.path_placeholder + ']' : lib.path;
                if (lib.object) {
                    name = '{ ' + lib.object_list.join(', ') + ' }';
                }
                lines.unshift('const ' + name + ' = require("' + path + '");');
            }
        }
        let result = lines.join('\n');
        log(4, 'fixCodeLibRequirePlaceholders result: ', result.length);
        return result;
    },

    generateCodeEndSuffix: (options = {}) => {
        let suffix = '```';
        if (options.block_ends) {
            let indent = '',
                indent_space_count = options.indent_space_count || 4;
            for (let i = 0; i < options.block_ends.length; i++) {
                let block_end = options.block_ends[i];
                suffix = indent + block_end + '\n\n' + suffix;
                indent += ' '.repeat(indent_space_count);
            }
        }
        return '\n' + suffix;
    },

    filterCodeLines(code) {
        let lines = code.split('\n'),
            filtered_lines = [];
        for (let line of lines) {
            let trimmed = line.trim();
            if (trimmed !== '' && trimmed.indexOf('//') !== 0 && trimmed.indexOf('/*') !== 0) {
                filtered_lines.push(line);
            }
        }
        return filtered_lines;
    },

    findBlockStartIndex: (code, block, search_index = 0) => {
        if (code.indexOf(block + '(') === 0) {
            return 0;
        }
        const search_prefix_list = [' ', '(', '[', ';', ',', '\n', '\t', '='];
        for (let prefix of search_prefix_list) {
            let index = code.indexOf(prefix + block + '(', search_index);
            if (index > -1) {
                return index + prefix.length;
            }
        }
        return -1;
    },

    getCodeBlockContent(code, block, include_block = true, search_index = 0) {
        let block_start_index = self.findBlockStartIndex(code, block, search_index);
        if (block_start_index === -1) {
            return '';
        }
        let current_index = code.indexOf('(', block_start_index),
            open_count = 1;
        while (open_count > 0) {
            current_index++;
            let c = code[current_index];
            if (c === '(') {
                open_count++;
            } else if (c === ')') {
                open_count--;
            }
        }
        if (code[current_index + 1] === ';') {
            current_index++;
        }
        let start_line_index = utils.findLineIndexByCharIndex(code, block_start_index),
            end_line_index = utils.findLineIndexByCharIndex(code, current_index),
            block_lines = utils.getFileLinesFromIndexes(code, start_line_index, end_line_index, false);

        if (!include_block) {
            block_lines.shift();
            block_lines.pop();
        }

        return block_lines.join('\n');
    },

    getLastCodeBlockContent(code, block, include_block = true) {
        let block_content_list = self.getCodeBlocksContent(code, block, { include_block });
        return block_content_list[block_content_list.length - 1];
    },

    getCodeBlocksContentV2(code, block, options = {}) {
        let current_index = 0,
            block_content_list = [],
            stop = false;
        while (!stop) {
            let next_block = self.getCodeBlockContent(code, block, options.include_block, current_index);
            if (next_block === '') {
                stop = true;
            } else {
                block_content_list.push(next_block);
                current_index = code.indexOf(next_block, current_index) + next_block.length;
            }
        }
        return block_content_list;
    },

    getCodeBlocksContent(code, block, options = {}) {
        let lines = code.split('\n'),
            block_content_list = [],
            block_started = false,
            block_lines = [],
            block_indent = "",
            include_block = options.include_block || true,
            trim_line = options.trim_line || true,
            block_suffix = options.block_suffix || '(';
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i],
                search_line = trim_line ? line.trim() : line;
            if (!block_started && search_line.indexOf(block + block_suffix) === 0) {
                block_started = true;
                if (include_block) {
                    block_lines.push(line);
                }
                let next_line = lines[i + 1];
                for (let c of next_line) {
                    if (c === ' ' || c === '\t') {
                        block_indent += c;
                    } else {
                        break;
                    }
                }
            } else if (block_started) {
                block_lines.push(line);
                if (line.indexOf(block_indent) === -1 && line.trim() !== '' && line.trim().indexOf('//') !== 0) {
                    if (!include_block) {
                        block_lines.pop();
                    }
                    block_content_list.push(block_lines.join('\n'));
                    block_lines = [];
                    block_started = false;
                    block_indent = "";
                }
            }
        }
        if (block_lines.length > 0) {
            // block_content_list.push(block_lines.join('\n'));
        }
        return block_content_list;
    },

    getLineIndent(line) {
        let indent = '';
        if (line) {
            for (let c of line) {
                if (c === ' ' || c === '\t') {
                    indent += c;
                } else {
                    break;
                }
            }
        }
        return indent;
    },

    getFirstLineIndent(code) {
        let lines = code.split('\n'),
            first_line = lines[0];
        return self.getLineIndent(first_line);
    },

    computeMissingIndent(source_indent, target_indent) {
        let indent_char = source_indent[0] || target_indent[0] || " ",
            source_indent_count = source_indent.length,
            target_indent_count = target_indent.length,
            missing_indent_count = target_indent_count - source_indent_count;
        return indent_char.repeat(missing_indent_count);
    },

    addLinesIndent(code, indent) {
        let lines = code.split('\n'),
            result_lines = [];
        for (let line of lines) {
            result_lines.push(indent + line);
        }
        return result_lines.join('\n');
    },

    isCommentLine(code_line) {
        let trimmed = code_line.trim();
        return trimmed.indexOf('//') === 0 || trimmed.indexOf('/*') === 0 || trimmed.indexOf('*') === 0 || trimmed.indexOf('*/') === 0 || trimmed.indexOf('**/') === 0;
    },

    hasComment(code) {
        return code.indexOf('//') > -1 || code.indexOf('/*') > -1;
    },

    extractXmlToJson(text) {
        const result = {};

        // Find all potential XML tags using a regular expression
        const xmlTags = text.match(/<[^>]+>[^<]*<\/[^>]+>/gs);

        if (xmlTags) {
            xmlTags.forEach(tag => {
                // Attempt to parse each tag as XML
                xml2js.parseString(tag, { explicitArray: false, trim: true }, (err, parsed) => {
                    if (!err && parsed) {
                        // Extract the root key and its value
                        const key = Object.keys(parsed)[0];
                        const value = parsed[key];

                        // Handle lists by converting them to arrays
                        if (key === 'list' && value.item) {
                            if (Array.isArray(value.item)) {
                                result[key] = value.item.map(item => item.trim());
                            } else {
                                result[key] = [value.item.trim()];
                            }
                        } else {
                            // Handle simple key-value pairs
                            result[key] = value;
                        }
                    }
                });
            });
        }

        return result;
    }

}

module.exports = self;

// Example Usage:
// const text = `
// Loram ipsum

// The card is red

// <foo>
// bar
// </foo>

// The fox is brown

// <list>
// <item>Foo</item>
// <item>Bar</item>
// </list>

// <foo>
// bar2
// </foo>

// Blue box
// `;

// const json = self.extractXmlToJson(text);
// console.log(json);