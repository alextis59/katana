const utils = require('./utils'),
    _ = require('lodash');

function parseOptions(options_string){
    let options = {};
    if(options_string){
        let parts = options_string.split('&');
        for(let part of parts){
            let [key, value] = part.split('=');
            options[key] = value;
        }
    }
    return options;
}

let self = {

    buildPrompt: (prompt, context, options = {}) => {
        return self.fillMessage(prompt, context, options);
    },

    buildMessages: (messages, context, options = {}) => {
        let result_messages = [];
        messages.forEach(message => {
            let built_message = {
                role: message.role,
                content: self.fillMessage(message.content, context, options)
            };
            result_messages.push(built_message);
        });
        return result_messages;
    },

    fillMessage: (content, context, fill_options = {}) => {
        let filled_content = content;
        let matches = content.match(/{([^}]+)}/g);
        if(fill_options.targets){
            matches = fill_options.targets.map(target => '{' + target + '}');
        }
        if(matches){
            // start by replacing placeholders with more complex delimiters to avoid conflicts
            matches.forEach(match => {
                if(match.indexOf('{\n') === 0){
                    return;
                }
                filled_content = filled_content.replace(match, '{-{-{' + match + '}-}-}');
            });

            matches.forEach(match => {
                if(match.indexOf('{\n') === 0){
                    return;
                }
                let key = match.replace(/{|}/g, ''), options = {}
                if(key.indexOf('?')){
                    let parts = key.split('?');
                    key = parts[0];
                    options = parseOptions(parts[1]);
                }
                let value = context[key];
                if(value === undefined && !fill_options.no_missing_throw){
                    throw new Error('Missing context value for key: ' + key);
                }
                if(options.file_format){
                    value = utils.getFileDisplayString(key + '.' + options.file_format, value, options.file_format);
                }else if(options.list && _.isArray(value)){
                    let list = '';
                    for(let i = 0; i < value.length; i++){
                        list += options.list + ' ' + i + "\n\n" + value[i] + "\n\n";
                    }
                    value = list;
                }else if(key === 'additional_instructions' && value && _.isArray(value)){
                    value = 'Here are some additional instructions that you need to follow:\n- ' + value.join('\n- ');
                }
                if(value){
                    filled_content = filled_content.replace(new RegExp(`{-{-{${match}}-}-}`, 'g'), escapeReplacement(value));
                }else if(key === 'additional_instructions'){
                    filled_content = filled_content.replace(new RegExp(`{-{-{${match}}-}-}`, 'g'), '');
                }
            });
        }
        return filled_content;
    }

}

function escapeReplacement(value) {
    return value.replace(/\$/g, '$$$$'); // Escapes any $ characters in the replacement value
}

module.exports = self;