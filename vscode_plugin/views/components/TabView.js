const state = require('../../state'),
    ActionView = require('./ActionView/ActionView'),
    SettingsView = require('./SettingsView/SettingsView');

module.exports = () => {

    let selected = state.get('selected-view');

    return `
        <div class="tabs">
            <button class=${'"tablinks' + (selected === "action" ? ' active"': '"')} onclick="setState({'selected-view': 'action'})">Action</button>
            <button class=${'"tablinks' + (selected === "settings" ? ' active"': '"')} onclick="setState({'selected-view': 'settings'})">Settings</button>
        </div>
        <div>
            ${selected === "action" ? ActionView() : ""}
            ${selected === "settings" ? SettingsView() : ""}
        </div>
    `
}