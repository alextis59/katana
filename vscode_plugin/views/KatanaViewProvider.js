const vscode = require('vscode'),
    path = require('path'),
    state = require('../state'),
    config = require('../config'),
    MainView = require('./components/MainView'),
    styles = require('./styles.js');

class KatanaViewProvider {

    static viewType = 'katanaView';

    constructor(extensionUri) {
        console.log('KatanaViewProvider.constructor');
        this._extensionUri = extensionUri;
    }

    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        try {
            console.log('KatanaViewProvider.resolveWebviewView');
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [this._extensionUri]
            };

            webviewView.webview.html = this.getHtmlContent();

            webviewView.webview.onDidReceiveMessage((message) => {
                console.log(message);
                switch (message.command) {
                    case 'setState':
                        state.setState(message.state);
                        break;
                    case 'updateConfig':
                        config.set(message.target, message.value);
                        this.refresh();
                        break;
                    case 'signInWithGoogle':
                        auth.authenticate().then(() => {
                            this.refresh();
                        });
                }
            });
        } catch (err) {
            console.log(err);
        }

    }

    refresh() {
        if (this._view) {
            this._view.webview.html = this.getHtmlContent();
        }
    }

    getHtmlContent() {
        return `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Katana</title>
                    <style>
                        ${styles}
                    </style>
                </head>
                <body>
                    <h1>Katana</h1>
                    ${MainView()}
                    <script>
                        const vscode = acquireVsCodeApi();
                        function setState(state) {
                            vscode.postMessage({
                                command: 'setState',
                                state: state
                            });
                        }
                        function updateConfig(target, value){
                            vscode.postMessage({
                                command: 'updateConfig',
                                target: target,
                                value: value
                            });
                        }
                        function signInWithGoogle(){
                            vscode.postMessage({
                                command: 'signInWithGoogle'
                            });
                        }
                    </script>
                </body>
                </html>
            `;
    }
}

module.exports = KatanaViewProvider;