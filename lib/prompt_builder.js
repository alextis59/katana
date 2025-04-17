const _ = require('lodash');

const self = {

    buildPromptFromModel: (model, context) => {
        let element_list = [];
        _.map(model.content, (element) => {
            let element_str = self.buildPromptElement(element, context);
            if(element_str !== ""){
                element_list.push(element_str);
            }
        });
        return element_list.join('\n\n');
    },

    buildPromptElement: (element, context, options = {}) => {
        let type = element.type;
        if(type === 'text'){
            return element.value;
        }else if(type === 'section'){
            return self.buildPromptSection(element, context, options);
        }else if(type === 'list'){
            return self.buildPromptList(element, context, options);
        }else if(type === 'resource'){
            return self.buildPromptResource(element, context, options);
        }
    },

    buildPromptText: (text, context, options = {}) => {
        let result = text.value;
        if(text.format === 'javascript'){
            result = '```javascript\n' + result + '\n```';
        }
        return result ;
    },

    buildPromptSection: (section, context, options = {}) => {
        let heading_level = options.heading_level || 0,
            heading_char = options.heading_char || '#',
            result = heading_char.repeat(heading_level + 1) + ' ' + section.title + '\n\n';
        try{
            return result + self.buildPromptElement(section.content, context, {heading_level: heading_level + 1});
        }catch(err){
            if(section.optional && err.message.indexOf('Missing context value for key') !== -1){
                return "";
            }else{
                throw err;
            }
        }
    },

    buildPromptList: (list, context, options = {}) => {
        return _.map(list.value, (item, index) => {
            let prefix = self.getListPrefix(list.format, index);
            return prefix + self.buildPromptElement(item, context, options);
        }).join('\n');
    },

    buildPromptResource: (resource, context, options = {}) => {
        if(context[resource.source] === undefined){
            throw new Error('PromptBuilder: Missing context value for key: ' + resource.source);
        }
        let value = context[resource.source];
        if(_.isArray(value)){
            let list = {
                type: 'list',
                value: _.map(value, (item) => {
                    return {
                        type: 'text',
                        value: item
                    }
                })
            }
            return self.buildPromptList(list, context, options);
        }else{
            return self.buildPromptText({value, format: resource.format}, context, options);
        }
    },

    getListPrefix: (format, index) => {
        if(format === 'ordered_numbered'){
            return `${index + 1}. `;
        }else if(format === 'ordered_lettered'){
            return `${String.fromCharCode(97 + index)}. `;
        }else if(format === 'unordered_bulleted'){
            return '• ';
        }else if(format === 'unordered_dashed'){
            return '- ';
        }else if(format === 'unordered_stars'){
            return '* ';
        }else{
            return '- ';
        }
    }

}

module.exports = self;