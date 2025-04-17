const fse = require('fs-extra'),
    path = require('path'),
    _ = require('lodash');

const openai = require('./config/providers/openai'),
    groq = require('./config/providers/groq'),
    google = require('./config/providers/google'),
    xai = require('./config/providers/xai');

const CONFIG_PATH = path.join(__dirname, '.config');

const self = {

    test_framework: 'jest',

    log: {
        enabled: false,
        level: -1,
        log_file: true,
        path: 'log',
        hide_token_usage: false
    },

    openai: {
        api_key: process.env.OPENAI_API_KEY,
        completion_max_concurrent: 30,
        completion_start_delay: 200,
        request_timeout: 60000
    },

    deepseek: {
        api_key: process.env.DEEPSEEK_API_KEY,
        request_timeout: 60000
    },

    groq: {
        api_key: process.env.GROQ_API_KEY,
        request_timeout: 60000
    },

    google: {
        api_key: process.env.GOOGLE_AI_API_KEY,
        request_timeout: 60000
    },

    xai: {
        api_key: process.env.XAI_API_KEY,
        request_timeout: 60000
    },
    
    project: {
        unit_test_output_path: 'test/unit',
        test_run_file_path: 'test/katana/tmp/tmp.test.js',
    },

    llm_providers: {

        openai: openai,
        groq: groq,
        google: google,
        xai: xai
        
    },

    disable_parsing_file_list: [],

    dependencies_filter: {
        
    },

    dependencies_only_prototype: {

    },

    include_external_dependencies: [
        '@alextis59/back-flip',
        'side-flip'
    ],

    readConfig: () => {
        let config = {};
        try{
            let data = fse.readFileSync(CONFIG_PATH, 'utf8'),
            lines = data.split('\n');
        for(let line of lines){
            let parts = line.split('=');
            if(parts.length === 2){
                let key = parts[0].trim(),
                    value = parts[1].trim();
                config[key] = value;
            }
        }
        }catch(err){

        }
        return config;
    },

    writeConfig: (config) => {
        let data = '';
        for(let key in config){
            data += key + '=' + config[key] + '\n';
        }
        fse.writeFileSync(CONFIG_PATH, data, 'utf8');
    },

    reloadConfig: () => {
        let config = self.readConfig();
        Object.assign(self, config);
    },

    saveConfig: () => {
        let config = self.readConfig();
        for(let key in config){
            config[key] = self[key];
        }
        self.writeConfig(config);
    },

    setConfig: (key, value) => {
        self[key] = value;
        self.saveConfig();
    }

}

self.reloadConfig();

module.exports = self;