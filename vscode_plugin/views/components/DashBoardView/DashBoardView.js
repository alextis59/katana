const auth = require('../../../../lib/auth');
const config = require('../../../config');

module.exports = () => {

    let user = auth.user,
        rate_limits = auth.rate_limits;

    const formatDate = (timestamp) => {
        const date = new Date(parseInt(timestamp));
        return date.toLocaleDateString();
    }

    return `
        <style>
            .view {
                font-family: Arial, sans-serif;
                padding: 20px;
                color: #e0e0e0;
                background-color: #2e2e2e;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
                max-width: 600px;
                margin: 0 auto;
            }
            .view h2 {
                margin-top: 0;
                color: #4a90e2;
                border-bottom: 2px solid #4a90e2;
                padding-bottom: 10px;
            }
            .view .user-info {
                margin-top: 20px;
            }
            .view .user-info div {
                margin-bottom: 15px;
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background-color: #3e3e3e;
                border-radius: 4px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
            }
            .view .user-info label {
                font-weight: bold;
                color: #bbbbbb;
            }
            .view input[type="text"] {
                width: 100%;
                padding: 8px;
                margin-top: 5px;
                border: 1px solid #ccc;
                border-radius: 4px;
            }
        </style>
        <div class="view">
            <h2>User Dashboard</h2>
            <div class="user-info">
                <div>
                    <label>Email:</label> <span>${user.email}</span>
                </div>
                <div>
                    <label>Name:</label> <span>${user.name}</span>
                </div>
                <div>
                    <label>Subscription Plan:</label> <span>${user.subscription.plan}</span>
                </div>
                <div>
                    <label>Unit Test Code:</label> <span>${user.usage.unit_test_code} / ${rate_limits.unit_test_code}</span>
                </div>
                <div>
                    <label>JS Doc:</label> <span>${user.usage.js_doc} / ${rate_limits.js_doc}</span>
                </div>
                <div>
                    <label for="unitTestOutputPath">Unit Test Output Path:</label>
                    <input type="text" id="unitTestOutputPath" value="${config.config.unit_test_output_path}" onchange="updateConfig('unit_test_output_path', this.value)">
                </div>
            </div>
            <div>
                <div style='font-weight: bold;margin-bottom: 10px'>How to ?</div>
                <div>Right-click on a class / function / variable in the code editor and select "Generate JSDoc" or "Generate Unit Tests" to generate JSDoc or Unit Test Suite for the selected target.</div>
            </div>
        </div>
    `;
}