const LLMProvider = require('../LLMProvider'),
    config = require('../../../config'),
    _ = require('lodash'),
    { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(config.google.api_key);

class GoogleProvider extends LLMProvider {

    constructor() {
        super('google', {
            default_model: 'gemini-1.5-flash',
            request_timeout: config.google.request_timeout,
            multiple_response_support: false
        });
    }

    processCompletionRequest = async (params, context) => {
        const model = genAI.getGenerativeModel({ model: params.model });

        let prompt = "";
        if(params.prompt){
            prompt = params.prompt;
        }else if(params.messages){
            prompt = params.messages.map(m => m.content).join("\n\n");
        }
        
        const result = await model.generateContent(prompt);
        
        return {
            data: {
                choices: [
                    {
                        text: result.response.text()
                    }
                ],
                usage: {
                    prompt_tokens: _.get(result.response, 'usageMetadata.promptTokenCount', 0),
                    completion_tokens: _.get(result.response, 'usageMetadata.candidatesTokenCount', 0),
                }
            }
        }
        
    }

}

module.exports = new GoogleProvider();