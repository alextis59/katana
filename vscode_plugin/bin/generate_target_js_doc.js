const plugin_utils = require('../utils'),
    state = require('../state'),
    plugin_config = require('../config'),
    { jobs } = require('../../autopilot'),
    token_utils = require('../../lib/ai/token_utils'),
    bin_utils = require('./bin_utils'),
    Project = require('../../parsing/project'),
    vscode = require('vscode');

const self = async () => {

    try {
        if((await bin_utils.beforeJob('generate_target_js_doc')) === false){
            return;
        }

        token_utils.resetSessionTokenUsage();

        let ctx = await plugin_utils.getRightClickContext();

        let project = new Project("my_project", ctx.projectPath),
            file_path = ctx.filePath.replace(ctx.projectPath + '/', ''),
            file = project.loadFile(file_path, { parse_loaded_files: true }),
            target = file.getTargetFromLineIndex(ctx.lineNumber - 1);

        if (!target) {
            vscode.window.showErrorMessage('No target found at line ' + ctx.lineNumber);
            return;
        }

        vscode.window.showInformationMessage('Generating JSDoc for ' + file_path + " => " + target.name);

        let context = {
            project: project,
            file: file,
            chat_options: plugin_config.config.chat_options.js_doc
        };

        try {
            let js_doc = await generateJSDoc(context, target);
            let file_target = file.getTarget(target);
            if(file_target.js_doc){
                let {start, end} = file_target.js_doc_lines_indexes;
                file.removeLinesFromIndexes(start, end);
                file.insertBeforeLineIndex(start, js_doc);
                // file.replaceLinesFromIndexes(start, end, js_doc);
            }else{
                file.insertBeforeLineIndex(file_target.lines_indexes.start, js_doc);
            }
            let cost = token_utils.computeSessionTotalCost(),
                info_text = 'JSDoc generated for ' + target.name;
            info_text += ' (Cost: ' + cost + '$)';
            vscode.window.showInformationMessage(info_text);
            await bin_utils.afterJob('generate_target_js_doc');
        } catch (err) {
            console.log('Error generating JSDoc...');
            console.log(err);
            bin_utils.handleError(err, 'Unknwon error while generating JSDoc...');
            await bin_utils.afterJob('generate_target_js_doc');
            return;
        }
    } catch (e) {
        console.log(e);
    }

}

async function generateJSDoc(context, target, try_count = 0) {
    try {
        context.target = target;
        
        let code = (await jobs.extract_module_target.set({
            include_dependencies: true,
            max_depth: 1,
            exclude_target_function_js_doc: true
        })(context)).code;

        context.code = code;
        if(target.method){
            context.prompt_target_type = 'function';
            context.target_suffix = "." + target.method;
        }else if(target.variable){
            context.prompt_target_type = 'variable';
            context.target_suffix = "." + target.variable;
        }
        let js_doc = (await jobs.generate_target_js_doc.remote()(context)).js_doc;
        
        return js_doc;
    } catch (err) {
        console.log(err);
        if (try_count < 2) {
            return generateJSDoc(context, target, try_count + 1);
        } else {
            throw err;
        }
    }
}

module.exports = self;