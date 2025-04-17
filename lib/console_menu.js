const readline = require('readline'),
    chalk = require('chalk'),
    _ = require('lodash'),
    token_utils = require('./ai/token_utils');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const default_title = 'Select an action:';

function questionAsync(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function waitForYes(msg) {
    return new Promise((resolve, reject) => {

      console.log(msg + '\n');
  
      rl.question('Type "Yes" and press Enter to continue (anything else will exit the program): ', (answer) => {
        // rl.close();
  
        if (answer === 'Yes') {
          resolve();
        } else {
          console.log('Exiting program.');
          process.exit(1);
        }
      });
    });
  }

async function waitForKeyPress(message = '\nPress any key to continue...') {
    return new Promise((resolve) => {
        console.log(message);
        process.stdin.setRawMode(true);
        process.stdin.once('data', () => {
            process.stdin.setRawMode(false);
            resolve();
        });
    });
}

async function multiLineInputAsync(prompt = 'Multi-line input:') {
    const lines = [];
    console.log(prompt);

    for (;;) {
        const line = await questionAsync('> ');
        if (line === '') break;
        lines.push(line);
    }

    return lines;
}

async function waitForInput(msg, default_value) {
    return new Promise((resolve, reject) => {
        if(default_value){
            msg += ' (default: ' + default_value + ')\n';
        }
        rl.question(msg, (answer) => {
            // rl.close();
            if (answer === '') {
                resolve(default_value);
            } else {
                resolve(answer);
            }
        });
    });
}

const self = {

    getActionMenu: async (actions, options = {}) => {
        token_utils.printSessionTokenUsage();
        let include_exit = options.include_exit || true;
        actions = _.cloneDeep(actions);
        if(include_exit){
            actions.push({ title: 'Exit', action: 'exit' });
        }
        let title = options.title || default_title,
            menu = '\n' + title + "\n" + _.map(actions, (action, index) => {
                return (options.start_zero ? index : (index + 1)) + ': ' + (action.color ? chalk[action.color](action.title) : action.title);
            }).join("\n") + '\n\n';
        let keepAsking = true, action;

        while (keepAsking) {
            const answer = await questionAsync(menu);
            if(answer === '' && options.enter_action){
                action = options.enter_action;
                keepAsking = false;
                break;
            }
            let action_index = parseInt(answer);
            if(!options.start_zero){
                action_index--;
            }
            if (!isNaN(action_index) && actions[action_index]) {
                action = actions[action_index].action;
                keepAsking = false;
            } else {
                console.log('Invalid action index: ' + action_index);
            }
        }
        if(action === 'exit'){
            process.exit(0);
        }
        // rl.close();
        return action;
    },

    waitForKeyPress: waitForKeyPress,

    waitForYes: waitForYes,

    multiLineInputAsync: multiLineInputAsync,

    waitForInput: waitForInput,

}

module.exports = self;