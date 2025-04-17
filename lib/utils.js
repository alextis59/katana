const fs = require('fs'),
    fse = require('fs-extra'),
    chalk = require('chalk'),
    ncp = require('copy-paste'),
    hljs = require('highlight.js'),
    _ = require('lodash'),
    moment = require('moment'),
    path = require('path'),
    log = require('./log'),
    { execSync } = require('child_process'),
    console_menu = require('./console_menu');

const FILE_DISPLAY_DELIMITORS = {
    'js': 'javascript',
    'txt': 'text'
}

const self = {

    getArgs: () => {
        let args = process.argv.slice(2);
        let args_obj = {};
        for (let arg of args) {
            let arg_parts = arg.split('=');
            if (arg_parts.length === 2) {
                args_obj[arg_parts[0]] = arg_parts[1];
            } else {
                args_obj[arg] = true;
            }
        }
        return args_obj;
    },

    getArg: (name) => {
        return self.getArgs()[name];
    },

    isClassOld: (variable) => {
        // Check if it's a function (classes are special functions in JavaScript)
        if (typeof variable !== 'function') {
            return false;
        }

        // Check if it has a prototype (all classes have a prototype)
        if (!variable.prototype) {
            return false;
        }

        // Check if it's not a built-in function or object
        if (variable === Function || variable === Object) {
            return false;
        }

        // Check if it has a constructor property that points back to itself
        if (variable.prototype.constructor !== variable) {
            return false;
        }

        // Check for presence of common class features
        const descriptors = Object.getOwnPropertyDescriptors(variable.prototype);
        const prototypeProps = Object.keys(descriptors);

        // Classes typically have more than just the 'constructor' in their prototype
        if (prototypeProps.length > 1) {
            return true;
        }

        // Check for presence of static methods or properties
        const staticProps = Object.getOwnPropertyNames(variable);
        if (staticProps.length > 1) {  // More than just 'prototype' and 'length'
            return true;
        }

        // If we've made it this far, it's likely a class, but we can't be 100% sure
        return true;
    },

    isClass: (variable) => {
        // Check if it's a function (classes are special functions in JavaScript)
        if (typeof variable !== 'function') {
            return false;
        }

        // Check if it has a prototype (all classes have a prototype)
        if (!variable.prototype) {
            return false;
        }

        // Check if it's not a built-in function or object
        if (variable === Function || variable === Object) {
            return false;
        }

        // Check if it has a constructor property that points back to itself
        if (variable.prototype.constructor !== variable) {
            return false;
        }

        // Check for presence of class-specific internal slots
        const internalSlots = Object.getOwnPropertySymbols(variable);
        if (internalSlots.some(symbol => symbol.description === 'Symbol.hasInstance')) {
            return true;
        }

        // Check if the function's string representation starts with "class"
        const functionString = Function.prototype.toString.call(variable);
        if (functionString.startsWith('class')) {
            return true;
        }

        // If none of the above checks passed, it's likely not a class
        return false;
    },

    getClassInfo: (classDefinition) => {
        if (typeof classDefinition !== 'function' || !classDefinition.prototype) {
            throw new Error('Input is not a class definition');
        }

        const classInfo = {
            name: classDefinition.name || 'AnonymousClass',
            properties: [],
            methods: [],
            staticProperties: [],
            staticMethods: []
        };

        // Get instance properties and methods
        const prototype = classDefinition.prototype;
        const prototypeDescriptors = Object.getOwnPropertyDescriptors(prototype);

        for (const [name, descriptor] of Object.entries(prototypeDescriptors)) {
            if (name === 'constructor') continue;
            if (typeof descriptor.value === 'function') {
                classInfo.methods.push(name);
            } else {
                classInfo.properties.push(name);
            }
        }

        // Get static properties and methods
        const staticDescriptors = Object.getOwnPropertyDescriptors(classDefinition);

        for (const [name, descriptor] of Object.entries(staticDescriptors)) {
            if (['length', 'prototype', 'name'].includes(name)) continue;
            if (typeof descriptor.value === 'function') {
                classInfo.staticMethods.push(name);
            } else {
                classInfo.staticProperties.push(name);
            }
        }

        return classInfo;
    },

    getClassInfoWithCode(classDefinition) {
        if (typeof classDefinition !== 'function' || !classDefinition.prototype) {
            throw new Error('Input is not a class definition');
        }

        const classInfo = {
            name: classDefinition.name || 'AnonymousClass',
            properties: [],
            methods: [],
            staticProperties: [],
            staticMethods: [],
            code: classDefinition.toString(),
            extends: []
        };

        let currentProto = Object.getPrototypeOf(classDefinition);
        while (currentProto !== Function.prototype) {
            if (currentProto.name) {
                classInfo.extends.push(currentProto.name);
            }
            currentProto = Object.getPrototypeOf(currentProto);
        }

        // Helper function to get function code
        function getFunctionCode(func) {
            let code = func.toString();
            // Remove the function name if it's present (for named function expressions)
            code = code.replace(/^function\s*[^\(]*/, 'function');
            return code;
        }

        // Get instance properties and methods
        const prototype = classDefinition.prototype;
        const prototypeDescriptors = Object.getOwnPropertyDescriptors(prototype);

        for (const [name, descriptor] of Object.entries(prototypeDescriptors)) {
            if (name === 'constructor') continue;
            if (typeof descriptor.value === 'function') {
                classInfo.methods.push({
                    name: name,
                    code: getFunctionCode(descriptor.value)
                });
            } else if (descriptor.get || descriptor.set) {
                classInfo.properties.push({
                    name: name,
                    get: descriptor.get ? getFunctionCode(descriptor.get) : undefined,
                    set: descriptor.set ? getFunctionCode(descriptor.set) : undefined
                });
            } else {
                classInfo.properties.push({
                    name: name,
                    value: JSON.stringify(descriptor.value)
                });
            }
        }

        // Get static properties and methods
        const staticDescriptors = Object.getOwnPropertyDescriptors(classDefinition);

        for (const [name, descriptor] of Object.entries(staticDescriptors)) {
            if (['length', 'prototype', 'name'].includes(name)) continue;
            if (typeof descriptor.value === 'function') {
                classInfo.staticMethods.push({
                    name: name,
                    code: getFunctionCode(descriptor.value)
                });
            } else if (descriptor.get || descriptor.set) {
                classInfo.staticProperties.push({
                    name: name,
                    get: descriptor.get ? getFunctionCode(descriptor.get) : undefined,
                    set: descriptor.set ? getFunctionCode(descriptor.set) : undefined
                });
            } else {
                classInfo.staticProperties.push({
                    name: name,
                    value: JSON.stringify(descriptor.value)
                });
            }
        }

        return classInfo;
    },

    getClassInfoWithInheritance: (classDefinition) => {
        const classInfo = getClassInfo(classDefinition);

        let proto = Object.getPrototypeOf(classDefinition.prototype);
        while (proto && proto !== Object.prototype) {
            const parentInfo = getClassInfo(proto.constructor);
            classInfo.properties = [...new Set([...classInfo.properties, ...parentInfo.properties])];
            classInfo.methods = [...new Set([...classInfo.methods, ...parentInfo.methods])];
            proto = Object.getPrototypeOf(proto);
        }

        return classInfo;
    },

    getFile: (path) => {
        let content = fs.readFileSync(path, 'utf8');
        let filename = path.split('/').pop(), file_prefix = filename.replace('.js', '');
        return {
            name: filename,
            prefix: file_prefix,
            path: path,
            path_without_filename: path.replace('/' + filename, ''),
            absolute_path: path,
            content: content,
        };
    },

    recomputePath: (originalPath, referencePath) => {
        // Get the directory of the reference path
        const referenceDir = path.dirname(referencePath);

        // Join the paths
        const newPath = path.join(referenceDir, originalPath);

        return newPath;
    },

    getRelativePath(path1, path2) {
        const directoryPath2 = path.dirname(path2);
        const relativePath = path.relative(directoryPath2, path1);

        return relativePath;
    },

    /**
     * Perform an async map on an array, call callback once function has been applied to all elements
     * If options.keep_order is true, the function will be applied in order, one element at a time
     * If options.max_concurrency is set, the function will be applied to a maximum of options.max_concurrency elements at a time
     * If options.throw_error is true, the callback will be called with the error as first argument if an error occurs
     * @param {[]} list - array to map
     * @param {function(*, function)} func - function to apply to each element of the array
     * @param {function} callback - callback function called when all elements have been mapped
     */
    asyncMap: (list, func, callback, options = {}) => {
        if (list.length === 0) {
            return callback();
        }
        if (options.keep_order) {
            let index = 0, process_next = () => {
                let item = list[index];
                func(item, (err) => {
                    index++;
                    if (options.throw_error && err) {
                        return callback(err);
                    }
                    if (index >= list.length) {
                        return callback();
                    } else {
                        return process_next();
                    }
                });
            };
            process_next();
        } else if (options.max_concurrency) {
            let index = -1, running = 0, error = false, process_next = () => {
                if (running >= options.max_concurrency || (options.throw_error && error)) {
                    return;
                }
                index++;
                if (index >= list.length) {
                    return;
                }
                let item = list[index];
                running++;
                func(item, (err) => {
                    if (options.throw_error && err && !error) {
                        error = true;
                        return callback(err);
                    }
                    running--;
                    if (index >= list.length - 1) {
                        if (running === 0) {
                            return callback();
                        }
                    } else {
                        return process_next();
                    }
                });
                process_next();
            };
            process_next();
        } else {
            let processed_count = 0, error = false, process_cb = (err) => {
                if (options.throw_error && error) {
                    return;
                } else if (options.throw_error && err) {
                    error = true;
                    return callback(err);
                }
                processed_count++;
                if (processed_count === list.length) {
                    return callback();
                }
            };
            for (let item of list) {
                func(item, process_cb);
            }
        }
    },

    fixChatCodeResult: (result) => {
        if (result.indexOf('```javascript') > -1) {
            result = result.replace('```javascript', '');
            result = result.replace('```', '');
        }
        if (result.indexOf('START OF FILE') > -1) {
            while (result.indexOf('- START OF FILE -') > -1) {
                result = result.replace('- START OF FILE -', ' START OF FILE ');
            }
            while (result.indexOf('- END OF FILE -') > -1) {
                result = result.replace('- END OF FILE -', ' END OF FILE ');
            }
            result = result.replace('START OF FILE', '');
            result = result.replace('END OF FILE', '');
        }
        if (result.indexOf('Filename: ') > -1) {
            let file_start = result.indexOf('\n', result.indexOf('Filename: '));
            result = result.substring(file_start + 1);
        }
        return result;
    },

    extractContent: (str, type) => {
        let prefix = '```' + type + '\n',
            suffix = '\n```';
        if (str.indexOf(prefix) > -1) {
            str = str.substring(str.indexOf(prefix) + prefix.length);
        }
        if (str.indexOf(suffix) > -1) {
            str = str.substring(0, str.indexOf(suffix));
        }
    },

    extractArrayString: (str) => {
        let prefix = '[',
            suffix = ']';
        if (str.indexOf(prefix) > -1) {
            str = str.substring(str.indexOf(prefix));
        }
        if (str.indexOf(suffix) > -1) {
            str = str.substring(0, str.indexOf(suffix) + 1);
        }
        return str;
    },

    countOccurrences(mainStr, subStr) {
        let count = 0;
        let position = 0;
        while (true) {
            position = mainStr.indexOf(subStr, position);
            if (position >= 0) {
                count++;
                position += subStr.length;
            } else {
                break;
            }
        }
        return count;
    },

    randomInt(min, max) {
        if (min > max) {
            let temp = min;
            min = max;
            max = temp;
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    randomFloat(min, max) {
        if (min > max) {
            let temp = min;
            min = max;
            max = temp;
        }
        let rand = Math.random() * (max - min) + min;
        return Math.round(rand * 10) / 10;
    },

    randomHexString: (length) => {
        let str = "";
        for (let i = 0; i < length; i++) {
            str += self.randomInt(0, 15).toString(16);
        }
        return str;
    },

    pickRandomListItem: (list) => {
        return list[self.randomInt(0, list.length - 1)];
    },

    replaceAll(str, find, replace) {
        return str.split(find).join(replace);
    },

    findJsFiles: async (dir, excludedPaths = [], allFiles = [], initialDir = dir) => {
        const files = await fse.readdir(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fse.stat(filePath);

            if (stat.isDirectory()) {
                if (!isExcluded(filePath, initialDir, excludedPaths)) {
                    await self.findJsFiles(filePath, excludedPaths, allFiles, initialDir);
                }
            } else if (filePath.endsWith('.js') && !isExcluded(filePath, initialDir, excludedPaths)) {
                allFiles.push(filePath);
            }
        }

        return allFiles;
    },

    firstLine: (str) => {
        return str.split('\n')[0];
    },

    getFileDisplayString(file_name, file_content, file_type = 'js') {
        let str = "\nFilename: " + file_name + "\n";
        str += '```' + FILE_DISPLAY_DELIMITORS[file_type] + '\n';
        str += file_content + "\n";
        str += '```\n';
        return str;
    },

    getFileLine: (path, line_number) => {
        try {
            let content = fs.readFileSync(path, 'utf8');
            let lines = content.split('\n');
            return lines[line_number - 1];
        } catch (e) {
            return "";
        }
    },

    getFirstMatchingLine: (str, match, match_all = false) => {
        let lines = str.split('\n');
        if (_.isArray(match)) {
            if (match_all) {
                for (let m of match) {
                    let result = self.getFirstMatchingLine(str, m);
                    if (result) {
                        return result;
                    }
                }
                return null;
            } else {
                for (let line of lines) {
                    let is_match = true;
                    for (let m of match) {
                        if (!line.includes(m)) {
                            is_match = false;
                            break;
                        }
                    }
                    if (is_match) {
                        return line;
                    }
                }
                return null;
            }
        } else {
            for (let line of lines) {
                if (line.includes(match)) {
                    return line;
                }
            }
            return null;
        }
    },

    getFileContentUntilLine: (file_str, match, include_match = true) => {
        let lines = file_str.split('\n'),
            match_index = lines.length - 1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf(match) !== -1) {
                if (include_match) {
                    match_index = i;
                } else {
                    match_index = i - 1;
                }
                break;
            }
        }
        return lines.slice(0, match_index + 1).join('\n');
    },

    getLineIndent: (line) => {
        let indent = "";
        for (let i = 0; i < line.length; i++) {
            if (line[i] === ' ' || line[i] === '\t') {
                indent += line[i];
            } else {
                break;
            }
        }
        return indent;
    },

    getFileLinesFromIndexes: (file_str, start_line_index, end_line_index, join = true) => {
        start_line_index = Math.max(0, start_line_index);
        end_line_index = Math.min(file_str.split('\n').length - 1, end_line_index);
        let lines = file_str.split('\n'),
            result = lines.slice(start_line_index, end_line_index + 1);
        return join ? result.join('\n') : result;
    },

    getLineNumberFromMatch: (file_str, match) => {
        let match_index = file_str.indexOf(match);
        if (match_index === -1) {
            return -1;
        }
        return self.findLineIndexByCharIndex(file_str, match_index);
    },

    findLineIndexByCharIndex: (inputString, charIndex) => {
        if (charIndex < 0 || charIndex >= inputString.length) {
            throw new Error("Character index out of bounds");
        }

        // Split the input string into lines
        const lines = inputString.split('\n');

        let cumulativeCharCount = 0;

        for (let i = 0; i < lines.length; i++) {
            // Add 1 for the newline character that was removed in the split
            cumulativeCharCount += lines[i].length + 1;

            if (cumulativeCharCount > charIndex) {
                return i;
            }
        }

        // In case the charIndex is exactly at the end of the string
        return lines.length - 1;
    },

    findLineByCharIndex: (inputString, charIndex) => {
        const lines = inputString.split('\n');
        return lines[self.findLineIndexByCharIndex(inputString, charIndex)];
    },

    isCommentLine: (line) => {
        let trimmed = line.trim();
        return trimmed.indexOf('//') === 0 || trimmed.indexOf('/*') === 0 || trimmed.indexOf('*') === 0 || trimmed.indexOf('*/') === 0;
    },

    insertBeforeLineIndex: (file_str, line_index, content, copy_indent = true) => {
        let lines = file_str.split('\n'),
            indent = self.getLineIndent(lines[line_index]);
        if (copy_indent) {
            content = content.split('\n').map((line) => {
                if (line.indexOf(indent) !== 0) {
                    return indent + line;
                } else {
                    return line;
                }
            }).join('\n');
        }
        lines.splice(line_index, 0, content);
        return lines.join('\n');
    },

    insertBeforeLine: (file_str, search, content, copy_indent = true) => {
        search = _.isArray(search) ? search : [search];
        let lines = file_str.split('\n'),
            indent = "",
            index = _.findIndex(lines, (line) => {
                for (let s of search) {
                    if (line.indexOf(s) > -1) {
                        if (copy_indent) {
                            indent = self.getLineIndent(line);
                        }
                        return true;
                    }
                }
            });
        if (index > -1) {
            if (copy_indent) {
                content = content.split('\n').map((line) => {
                    if (line.indexOf(indent) !== 0) {
                        return indent + line;
                    } else {
                        return line;
                    }
                }).join('\n');
            }
            lines.splice(index, 0, content);
            return lines.join('\n');
        } else {
            throw new Error('Could not find line to insert before: ' + JSON.stringify(search));
        }
    },

    removeCommentLines: (file_str) => {
        let lines = file_str.split('\n');
        lines = lines.filter((line) => {
            return line.trim().indexOf('//') !== 0;
        });
        return lines.join('\n');
    },

    removeMatchingLines: (file_str, match) => {
        let lines = file_str.split('\n');
        lines = lines.filter((line) => {
            return line.indexOf(match) === -1;
        });
        return lines.join('\n');
    },

    removeEmptyLines: (file_str) => {
        let lines = file_str.split('\n');
        lines = lines.filter((line) => {
            return line.trim() !== '';
        });
        return lines.join('\n');
    },

    isHexString: function (value) {
        return /^[0-9a-fA-F]+$/.test(value);
    },

    humanReadableTimeDiff(start, end) {
        let duration = moment.duration(end.diff(start));

        let days = duration.days();
        let hours = duration.hours();
        let minutes = duration.minutes();
        let seconds = duration.seconds();

        let output = [];

        if (days > 0) output.push(days + " days");
        if (hours > 0) output.push(hours + " hours");
        if (minutes > 0) output.push(minutes + " minutes");
        if (seconds > 0) output.push(seconds + " seconds");

        if (output.length === 0) return "0 seconds";

        return output.join(", ");
    },

    sortByLineCount: (list) => {
        return _.sortBy(list, (item) => {
            return item.split('\n').length;
        })
    },

    decreasingProbDistribution: (n) => {
        if (n < 2) {
            throw new Error('n must be greater than or equal to 2');
        }

        let values = [];
        let total = 0;
        for (let i = 1; i < n; i++) {
            total += 1 / i;
        }

        let sum = 0;
        for (let i = 1; i < n; i++) {
            sum += (1 / i) / total;
            values.push(sum);
        }

        return values;
    },

    pickIndexUsingDistribution(distribution) {
        const rand = Math.random();
        for (let i = 0; i < distribution.length; i++) {
            if (rand < distribution[i]) {
                return i;
            }
        }
        return distribution.length;
    },

    openGedit: (path) => {
        try {
            execSync('gedit ' + path, { stdio: 'inherit' });
            console.log('Editor closed. Continuing execution...');
        } catch (error) {
            console.error('Error occurred:', error);
        }
    },

    findFirstInteger: (str) => {
        const matches = str.match(/\d+/);
        return matches ? parseInt(matches[0]) : null;
    },

    printJsCode: (code) => {
        const formattedCode = hljs.highlight('javascript', code).value;
        const coloredCode = self.htmlToChalk(formattedCode);
        console.log(coloredCode);
    },

    htmlToChalk: (input) => {
        const replacements = {
            'hljs-keyword': chalk.blue,
            'hljs-string': chalk.green,
            'hljs-built_in': chalk.cyan,
            'hljs-attr': chalk.yellow,
            'hljs-function': chalk.magenta,
            'hljs-comment': chalk.gray,
        };

        // Decode HTML entities
        const entities = {
            '&quot;': '"',
            '&#x27;': "'",
            '&gt;': '>',
            '&lt;': '<',
            '&amp;': '&',
        };
        for (let key in entities) {
            input = input.replace(new RegExp(key, 'g'), entities[key]);
        }

        // Iterate through the replacements and apply the corresponding chalk function
        for (let key in replacements) {
            const regex = new RegExp(`<span class="${key}">(.*?)<\/span>`, 'g');
            input = input.replace(regex, (_, match) => replacements[key](match));
        }

        return input;
    },

    timeout: (ms) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(new Error("Request timed out"));
            }, ms);
        });
    },

    wait: (ms) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, ms);
        });
    },

    awaitAll: async (promises) => {
        await Promise.allSettled(promises);
    },

    copyToClipboard: async (text) => {
        try {
            await copyToClipboard(text);
        } catch (err) {
            console.log('Error copying to clipboard, verify that xclip is installed');
            await console_menu.waitForKeyPress();
        }
    },

    computeFunctionTargetPath: (target_folder, file, function_name, suffix) => {
        let path = target_folder + '/' + file.path_without_filename + '/' + file.module_name + '/' + function_name;
        if (suffix) {
            path += suffix;
        }
        return path;
    }

}

async function copyToClipboard(text) {
    return new Promise((resolve, reject) => {
        ncp.copy(text, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function isExcluded(filePath, dir, excludedPaths) {
    return excludedPaths.some(excludedPath => {
        const fullExcludedPath = path.resolve(dir, excludedPath);
        return filePath.startsWith(fullExcludedPath) || filePath === fullExcludedPath;
    });
}

module.exports = self;