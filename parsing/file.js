const _ = require('lodash'),
    utils = require('../lib/utils'),
    fse = require('fs-extra');

const target_types = ['function', 'variable', 'class'];

class File {

    name = '';

    module_name = '';

    path = '';

    project_path = '';

    requested_path_list = [];

    path_without_filename = '';

    absolute_path = '';

    content = '';

    libs = [];

    disable_parsing = false;

    parsed = false;

    dependencies_parsed = false;

    parent_dependencies_parsed = false;

    function_map = {};

    variable_map = {};

    class_map = {};

    internal_function_map = {};

    internal_variable_map = {};

    internal_class_map = {};

    constructor(root_path, path, requested_path, disable_parsing) {
        let absolute_path = root_path + '/' + path,
            content = fse.readFileSync(absolute_path, 'utf8'),
            filename = absolute_path.split('/').pop(),
            file_prefix = filename.replace('.js', ''),
            module_name = file_prefix === 'index' ? path.split('/')[path.split('/').length - 2] : file_prefix;

        let requested_path_list = [path];
        if (requested_path && requested_path !== path) {
            requested_path_list.push(requested_path);
        }
        this.name = filename;
        this.module_name = module_name;
        this.path = path;
        this.project_path = path;
        this.requested_path_list = requested_path_list;
        if(path.includes('/')){
            this.path_without_filename = path.replace('/' + filename, '');
        }else{
            this.path_without_filename = '';
        }
        this.absolute_path = absolute_path;
        this.content = content;
        this.disable_parsing = disable_parsing || false;
    }

    save = () => {
        fse.outputFileSync(this.absolute_path, this.content);
    };

    replace = (search, replacement, save = true) => {
        this.content = this.content.replace(search, replacement);
        if(save){
            this.save();
        }
    };

    insertBeforeLineIndex = (line_index, content, save = true, copy_indent = true) => {
        this.content = utils.insertBeforeLineIndex(this.content, line_index, content, copy_indent);
        if(save){
            this.save();
        }
    };

    insertBeforeLine = (search, content, save = true, copy_indent = true) => {
        this.content = utils.insertBeforeLine(this.content, search, content, copy_indent);
        if(save){
            this.save();
        }
    };

    getTargetFromLineIndex = (line_index) => {
        for(let type of target_types){
            let target = this.getTargetFromLineIndexAndType(line_index, type) || this.getTargetFromLineIndexAndType(line_index, type, true);
            if(target){
                return target;
            }
        }
        return null;
    };

    getTargetFromLineIndexAndType = (line_index, type, internal) => {
        let target_map = this[`${internal ? "internal_" : ""}${type}_map`];
        if(!target_map){
            return null;
        }
        for(let name in target_map){
            let target = target_map[name],
                line_indexes = target.lines_indexes;
            if(line_indexes && line_index >= line_indexes.start && line_index <= line_indexes.end){
                let result = {name, type};
                if(internal){
                    result.internal = true;
                }
                if(type === 'class'){
                    let target = target_map[name];
                    if(target.function_map){
                        let target_method;
                        for(let method_name in target.function_map){
                            target_method = target.function_map[method_name];
                            let method_line_indexes = target_method.lines_indexes;
                            if(method_line_indexes && line_index >= method_line_indexes.start && line_index <= method_line_indexes.end){
                                result.method = method_name;
                            }
                        }
                    }
                    if(!result.method && target.variable_map){
                        for(let variable_name in target.variable_map){
                            let target_variable = target.variable_map[variable_name],
                                variable_line_indexes = target_variable.lines_indexes;
                            if(variable_line_indexes && line_index >= variable_line_indexes.start && line_index <= variable_line_indexes.end){
                                result.variable = variable_name;
                            }
                        }
                    }
                }
                return result;
            }
        }
        return null;
    };

    getLinesFromIndexes = (start_line_index, end_line_index, join = true) => {
        let lines = this.content.split('\n');
        start_line_index = Math.max(0, start_line_index);
        end_line_index = Math.min(lines.length - 1, end_line_index);
        let result = lines.slice(start_line_index, end_line_index + 1);
        return join ? result.join('\n') : result;
    };

    removeLinesFromIndexes = (start_line_index, end_line_index, save = true) => {
        let lines = this.content.split('\n');
        start_line_index = Math.max(0, start_line_index);
        end_line_index = Math.min(lines.length - 1, end_line_index);
        lines.splice(start_line_index, end_line_index - start_line_index + 1);
        this.content = lines.join('\n');
        if(save){
            this.save();
        }
    };

    replaceLinesFromIndexes = (start_line_index, end_line_index, content, save = true) => {
        let lines = this.content.split('\n');
        start_line_index = Math.max(0, start_line_index);
        end_line_index = Math.min(lines.length - 1, end_line_index);
        lines.splice(start_line_index, end_line_index - start_line_index + 1, content);
        this.content = lines.join('\n');
        if(save){
            this.save();
        }
    }

    getTarget = ({type, name, internal, method, variable}) => {
        let target_map = this[`${internal ? "internal_" : ""}${type}_map`];
        let target = target_map && target_map[name];
        if(target){
            if(method){
                return target.function_map[method];
            }else if(variable){
                return target.variable_map[variable];
            }
        }
        return target;
    }

    getTargetExtract = (type, name, internal) => {
        let target_map = this[`${internal ? "internal_" : ""}${type}_map`];
        if(!target_map){
            return null;
        }
        let target = target_map[name],
            line_indexes = target && target.lines_indexes;
        if(!line_indexes){
            return null;
        }
        return {
            start: line_indexes.start,
            end: line_indexes.end,
            content: utils.getFileLinesFromIndexes(this.content, line_indexes.start, line_indexes.end)
        }
    };

    replaceLines = (start, end, content) => {
        this.replace(utils.getFileLinesFromIndexes(this.content, start, end), content);
    }

}

module.exports = File;