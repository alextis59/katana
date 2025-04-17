const Job = require('./Job'),
    prompt_builder = require('../prompt_builder'),
    message_builder = require('../message_builder');

class AiJob extends Job {

    chat_options = {}

    messages = []

    constructor() {
        super();
    }

    getPromptTemplate = () => {
        let prompt = "";
        if(this.messages){
            for(let message of this.messages){
                prompt += message.role.toUpperCase() + '\n\n';
                prompt += message.content + '\n\n';
            }
        }
        return prompt;
    }

    printPrompt = () => {
        console.log(this.getPromptTemplate());
    }

    buildMessages = message_builder.buildMessages;

    buildPrompt = message_builder.buildPrompt;

    buildPromptFromModel = prompt_builder.buildPromptFromModel;

}

module.exports = AiJob;