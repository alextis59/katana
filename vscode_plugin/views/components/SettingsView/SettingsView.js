const state = require('../../../state'),
    config = require('../../../config');

const setting_sections = [
    {
        type: "section",
        title: "Unit Test Generation",
        children: [
            {
                type: 'section',
                title: 'Test Cases',
                children: [
                    {
                        type: 'select',
                        title: 'Provider',
                        target: 'chat_options.generate_unit_test_cases.provider',
                        values: config.getProviders
                    },
                    {
                        type: 'select',
                        title: "Model",
                        target: 'chat_options.generate_unit_test_cases.model',
                        values: config.getCurrentProviderModels.bind(null, 'generate_unit_test_cases')
                    },
                ]
            },
            {
                type: 'section',
                title: 'Code Writing',
                children: [
                    {
                        type: 'select',
                        title: 'Provider',
                        target: 'chat_options.write_unit_test.provider',
                        values: config.getProviders
                    },
                    {
                        type: 'select',
                        title: "Model",
                        target: 'chat_options.write_unit_test.model',
                        values: config.getCurrentProviderModels.bind(null, 'write_unit_test')
                    },
                ]
            },
            {
                type: 'section',
                title: 'Output',
                children: [
                    {
                        type: 'input',
                        title: 'Unit tests root path',
                        target: 'unit_test_output_path'
                    },
                ]
            }
        ]
    },
    {
        type: "section",
        title: "JSDoc Generation",
        children: [
            {
                type: 'select',
                title: 'Provider',
                target: 'chat_options.js_doc.provider',
                values: config.getProviders
            },
            {
                type: 'select',
                title: "Model",
                target: 'chat_options.js_doc.model',
                values: config.getCurrentProviderModels.bind(null, 'js_doc')
            },
        ]
    }
]

module.exports = () => {

    const getSelect = (item, selectedValue) => {
        let options = '';
        const values = typeof item.values === 'function' ? item.values() : item.values;
        values.forEach(value => {
            options += `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${value}</option>`;
        });
        return `
            <label for="${item.target}">${item.title}:</label>
            <select id="${item.target}" onchange="updateConfig('${item.target}', this.value)">
                ${options}
            </select>
        `;
    }

    const getInput = (item, value) => {
        return `
            <label for="${item.target}">${item.title}:</label>
            <input type="text" id="${item.target}" value="${value}" onchange="updateConfig('${item.target}', this.value)">
        `;
    }

    const renderSection = (section, level = 0) => {
        let html = `<h${level + 2}>${section.title}</h${level + 2}>`;
        section.children.forEach(item => {
            if (item.type === 'section') {
                html += renderSection(item, level + 1);
            } else if (item.type === 'select') {
                html += getSelect(item, config.get(item.target));
            } else if (item.type === 'input') {
                html += getInput(item, config.get(item.target));
            }
        });
        return `<div class="section">${html}</div>`;
    }

    const getSettings = () => {
        return setting_sections.map(section => renderSection(section)).join('');
    }

    return `
    <style>
        .view {
            font-family: Arial, sans-serif;
            padding: 20px;
        }
        .view h2:first-child {
            margin-top: 0;
        }
        .view h2, .view h3, .view h4 {
            color: #333;
            margin-top: 20px;
            color: white;
        }
        .view label {
            display: block;
            margin-top: 15px;
            font-weight: bold;
        }
        .view select, .view input[type="text"] {
            width: 100%;
            padding: 8px;
            margin-top: 5px;
            margin-bottom: 5px;
            border: 1px solid #ccc;
            border-radius: 4px;
        }
        .section {
            
        }
    </style>
    <div class="view">
        ${getSettings()}
        <div>
            <h2>Providers</h3>
            <p>Use environment variables to set the API keys for the providers.</p>
            <ul>
                <li>OpenAI: <code>OPENAI_API_KEY</code></li>
                <li>Google: <code>GOOGLE_AI_API_KEY</code></li>
                <li>Groq: <code>GROQ_API_KEY</code></li>
                <li>XAI: <code>XAI_API_KEY</code></li>
            </ul>
        </div>
    </div>
`;
}