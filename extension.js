const vscode = require('vscode'),
    state = require('./vscode_plugin/state'),
    KatanaViewProvider = require('./vscode_plugin/views/KatanaViewProvider'),
    generate_unit_test_suite = require('./vscode_plugin/bin/generate_unit_test_suite'),
    generate_all_unit_test_suite = require('./vscode_plugin/bin/generate_all_unit_test_suite'),
    generate_target_js_doc = require('./vscode_plugin/bin/generate_target_js_doc'),
    debug = require('./vscode_plugin/bin/debug'),
    config = require('./vscode_plugin/config');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('Activating Katana extension...');

    // Initialize config with the context
    config.initialize(context);

    const commands = [
        {
            command: "katana.generateUnitTests",
            fn: generate_unit_test_suite
        },
        {
            command: "katana.generateAllUnitTests",
            fn: generate_all_unit_test_suite
        },
        {
            command: "katana.generateJSDoc",
            fn: generate_target_js_doc
        },
        // {
        //     command: "katana.debug",
        //     fn: debug
        // },
        {
            command: "katana.saveConfig",
            fn: () => config.saveConfig(context)  // Pass the context directly here
        }
    ];

    commands.forEach(({command, fn}) => {
        let disposable = vscode.commands.registerCommand(command, fn);
        context.subscriptions.push(disposable);
    });

    const provider = new KatanaViewProvider(context.extensionUri);

    state.initialize(provider);

    vscode.window.registerWebviewViewProvider(KatanaViewProvider.viewType, provider);

    console.log('Katana extension is now active!');

}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
