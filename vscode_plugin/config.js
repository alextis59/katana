const _ = require('lodash'),
    vscode = require('vscode'),
    autopilot_config = require('../config');

const self = {

    local_mode: true,

    config: {
        first_launch: true,
        test_framework: 'jest',
        unit_test_output_path: 'test/unit',
        write_unit_test: {
            async: true
        },
        chat_options: {
            js_doc: {
                provider: 'openai',
                model: 'gpt-4o-mini'
            },
            generate_unit_test_cases: {
                provider: 'openai',
                model: 'gpt-4o',
            },
            write_unit_test: {
                provider: 'openai',
                model: 'gpt-4o-mini'
            }
        }
    },

    initialize: (context) => {
        // Load saved config from globalState
        const savedConfig = context.globalState.get('katanaConfig');
        if (savedConfig) {
            self.config = _.merge({}, self.config, savedConfig);
            // console.log(savedConfig);
        }
    },

    get: (target) => {
        return _.get(self.config, target);
    },

    set: (target, value) => {
        console.log("set", target, value);
        _.set(self.config, target, value);
        if(target.includes('chat_options.') && target.includes('.provider')){
            self.checkProviderModel(target.replace('.provider', '').replace('chat_options.', ''));
        }
        // Save updated config to globalState
        vscode.commands.executeCommand('katana.saveConfig');
    },

    getProviders: () => {
        let providers = Object.keys(autopilot_config.llm_providers);
        let enabledProviders = [];
        for(const prodiver of providers){
            if(autopilot_config[prodiver].api_key){
                enabledProviders.push(prodiver);
            }
        }
        return enabledProviders;
    },

    getProviderModels: (provider) => {
        return Object.keys(autopilot_config.llm_providers[provider].models);
    },

    getCurrentProviderModels: (target) => {
        let provider = self.get('chat_options.' + target + '.provider');
        return self.getProviderModels(provider);
    },

    checkProviderModel: (target) => {
        let provider = self.get('chat_options.' + target + '.provider');
        let model = self.get('chat_options.' + target + '.model');
        let models = self.getProviderModels(provider);
        if(!models.includes(model)){
            self.set('chat_options.' + target + '.model', models[0]);
        }
    },

    saveConfig: (context) => {
        if (context && context.globalState) {
            context.globalState.update('katanaConfig', self.config);
        } else {
            console.error('Unable to save config: invalid context');
        }
    }

}

module.exports = self;