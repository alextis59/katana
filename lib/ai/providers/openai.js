const LLMProvider = require('../LLMProvider'),
    config = require('../../../config'),
    { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: config.openai.api_key,
});

const openai = new OpenAIApi(configuration);

class OpenAIProvider extends LLMProvider {

    constructor() {
        super('openai', {
            default_model: 'gpt-3.5-turbo',
            request_timeout: config.openai.request_timeout,
            multiple_response_support: true
        });
    }

    processCompletionRequest = async (params, context) => {
        let options = context.options || {};
        if(options.completion){
            return await openai.createCompletion(params);
        }else{
            return await openai.createChatCompletion(params);
        }
    }

}

module.exports = new OpenAIProvider();