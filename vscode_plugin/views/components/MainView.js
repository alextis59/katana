const SettingsView = require('./SettingsView/SettingsView');

module.exports = () => {

    return `
        <div>
            ${SettingsView()}
        </div>
    `;
}