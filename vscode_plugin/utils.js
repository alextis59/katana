const vscode = require('vscode'),
    plugin_config = require('./config'),
    utils = require('../lib/utils');

const self = {

    getRightClickContext: async () => {

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            await document.save();
            const selection = editor.selection;

            // Get the selected text
            const selectedText = document.getText(selection);
            
            // Get more context information
            const filePath = document.uri.fsPath;
            const lineNumber = selection.start.line + 1;
            const columnNumber = selection.start.character + 1;

            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            const projectPath = workspaceFolder ? workspaceFolder.uri.fsPath : 'No workspace folder open';

            // Debug information (you can remove this later)
            // vscode.window.showInformationMessage(`Project Path: ${projectPath}, File Path: ${filePath}, Line: ${lineNumber}, Column: ${columnNumber}`);

            return {
                projectPath,
                filePath,
                lineNumber,
                columnNumber,
                selectedText,
                openedFiles: self.getAllOpenedFilePaths()
            };

        }else{
            vscode.window.showErrorMessage('No active editor found');
        }
    },

    getUnitTestsOutputPath: (project, file, function_name, absolute = true) => {
        let project_output_path = utils.computeFunctionTargetPath(plugin_config.config.unit_test_output_path, file, function_name, '.test.js');
        if(absolute){
            return project.root_path + '/' + project_output_path;
        }else{
            return project_output_path;
        }
    },

    getAllOpenedFilePaths: () => {
        const openedFiles = vscode.workspace.textDocuments;
        return openedFiles
            .filter(document => !document.isUntitled) // Exclude unsaved files
            .map(document => document.uri.fsPath)
            // remove git files
            .filter(path => (path.indexOf('git/') !== 0 && path.indexOf('.git') === -1));
    }

}

module.exports = self;