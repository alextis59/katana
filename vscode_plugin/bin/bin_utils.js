
const vscode = require('vscode'),
    state = require('../state'),
    _ = require('lodash');

const self = {

    beforeJob: async (job_name) => {

        return true;
    },

    afterJob: async (job_name) => {
        state.view_provider.refresh();
    },

    handleError: (err, default_msg = 'Unknown error while executing action...') => {
        let msg = _.get(err, 'response.data.message', 'unknown'),
            display_msg = default_msg;
        if(msg === 'Context size is too large'){
            display_msg = 'The context size is too large. Please try with a smaller context.';
        }
        vscode.window.showErrorMessage(display_msg);
    }

}

module.exports = self;