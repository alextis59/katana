const Job = require('../../lib/jobs/Job'),
    _ = require('lodash'),
    utils = require('side-flip/utils'),
    openai = require('../../lib/ai/providers/openai'),
    groq = require('../../lib/ai/providers/groq'),
    google = require('../../lib/ai/providers/google'),
    xai = require('../../lib/ai/providers/xai');

const providers = {
    openai: openai,
    groq: groq,
    google: google,
    xai: xai
}

let request_ongoing = false;

class GetChatCompletion extends Job {

    constructor(props) {
        super();
        _.assign(this, props);
    }

    name = 'get_chat_completion';

    description = 'Get a chat completion from an LLM provider';

    inputs = {
        messages: {
            type: 'array',
            description: 'Messages to send to the chat completion API',
            items: {
                type: 'object',
                properties: {
                    role: {
                        type: 'string'
                    },
                    content: {
                        type: 'string'
                    }
                }
            },
            optional: (context) => {
                return context.prompt !== undefined;
            }
        },
        prompt: {
            type: 'string',
            description: 'Prompt to use for the chat completion',
            optional: (context) => {
                return context.messages !== undefined;
            }
        },
        functions: {
            type: 'array',
            optional: true
        },
        chat_options: {
            type: 'object',
            optional: true
        },
        json_parsing_max_try_count: {
            type: 'integer',
            description: 'Maximum number of tries to parse the response as JSON',
            default_value: 3
        }
    };

    outputs = {
        completion: {

        },
        chat: {

        }
    };

    execute = async (context, try_count = 0) => {
        let options = context.chat_options || {},
            provider = options.provider || 'openai';
        while(request_ongoing){
            await utils.wait(50);
        }
        request_ongoing = true;
        let data;
        if(options.completion){
            data = context.prompt || _.last(context.messages).content;
        }else{
            data = context.messages || [{role: 'user', content: context.prompt}];
        }
        let target_provider = providers[provider],
            response = await target_provider.getChatCompletion({messages: data, functions: context.functions, options});
        // if(provider === 'deepseek'){ 
        //     response = await deepseek.getChatCompletion({messages: data, functions: context.functions, options});
        // }else if(provider === 'groq'){ 
        //     response = await groq.getChatCompletion({messages: data, functions: context.functions, options});
        // }else{
        //     response = await openai.getChatCompletion({messages: data, functions: context.functions, options});
        // }
        if (response.error) {
            console.log(response);
            this.log(5, 'Error while getting response: ', response.error);
            request_ongoing = false;
            return this.throw('Error while getting response', response.error);
        }
        let result = _.isArray(response) ? _.map(response, 'result') : response.result;
        if(options.expect_json){
            try{
                if(_.isArray(result)){
                    result = _.map(result, parseJsonResponse);
                }else{
                    result = parseJsonResponse(result);
                }
            }catch(err){
                if(try_count < context.json_parsing_max_try_count){
                    this.log(5, 'Error while parsing JSON response, trying again');
                    request_ongoing = false;
                    return await this.execute(context, try_count + 1);
                }else{
                    this.log(5, 'Error while parsing response');
                    request_ongoing = false;
                    return this.throw('Error while parsing JSON response', err);
                }
            }
        }
        this.log(6, result);
        let chat = {
            options: options
        }
        if(options.completion){
            chat.completion = result;
        }else{
            let res_message = _.isArray(result) ? _.last(result) : result,
                messages = data.slice();
            if(typeof res_message === 'object'){
                res_message = JSON.stringify(res_message, null, 2);
            }
            messages.push({role: 'assistant', content: res_message});
            chat.messages = messages;
        }
        request_ongoing = false;
        return { completion: result, chat: chat };
    }

}

function parseJsonResponse(response) {
    let json_start_index = response.indexOf('{'),
        json_end_index = response.lastIndexOf('}');
    let json = response.substring(json_start_index, json_end_index + 1);
    return JSON.parse(json);
}

module.exports = GetChatCompletion;