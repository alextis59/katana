const AiJob = require('../../lib/jobs/AiJob'),
    fse = require('fs-extra'),
    path = require('path'),
    prompt = fse.readFileSync(path.join(__dirname, 'ai_job_template_prompt.txt'), 'utf8');

class JobTemplate extends AiJob {

    constructor(props) {
        super();
        _.assign(this, props);
    }

    name = 'ai_job_template';

    description = 'AI Job template';

    chat_options = {
        prompt_name: 'ai_job_template',
        model: 'gpt-3.5-turbo',
        max_tokens: 2048
    };

    prompt = prompt;

    inputs = {
        foo: {
            type: 'string',
            description: 'Foo'
        },
    };

    outputs = {
        bar: {
            type: 'string',
            description: 'Bar'
        }
    };

    execute = async (context) => {
        let prompt_context = {
            foo: context.foo,
        },
            prompt = this.buildPrompt(this.prompt, prompt_context),
            chat_options = _.merge({}, this.chat_options, options.chat_options_override || {});
        let completion_context = {
            chat_options: chat_options,
            prompt: prompt
        };
        let results = (await this.jobs.get_chat_completion(completion_context)).completion;
    }

}

module.exports = JobTemplate;