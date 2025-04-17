const LLMProvider = require('../LLMProvider'),
    config = require('../../../config'),
    axios = require('axios');

class DeepSeekProvider extends LLMProvider {

    constructor() {
        super('deepseek', {
            default_model: 'deepseek-coder',
            request_timeout: config.deepseek.request_timeout
        });
    }

    processCompletionRequest = async (params, context) => {
        const axios = require('axios');

        let options = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://api.deepseek.com/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + config.deepseek.api_key
            },
            data: params
        };

        return await axios(options);
    }

    listModels = async () => {
        let options = {
            method: 'get',
            maxBodyLength: Infinity,
            url: 'https://api.deepseek.com/models',
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + config.deepseek.api_key
            }
        };

        return await axios(options);
    }

}

module.exports = new DeepSeekProvider();