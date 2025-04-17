const LLMProvider = require('../LLMProvider'),
    config = require('../../../config'),
    axios = require('axios');

class GroqProvider extends LLMProvider {

    constructor() {
        super('groq', {
            default_model: 'llama3-8b-8192',
            request_timeout: config.groq.request_timeout
        });
    }

    processCompletionRequest = async (params, context) => {

        let options = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://api.groq.com/openai/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + config.groq.api_key
            },
            data: params
        };

        return await axios(options);
    }

}

module.exports = new GroqProvider();