module.exports = `
body {
    font-family: Arial, sans-serif;
}

.tabs {
    overflow: hidden;
    background-color: #f1f1f1;
}

.tabs button {
    background-color: inherit;
    float: left;
    border: none;
    outline: none;
    cursor: pointer;
    padding: 14px 16px;
    transition: 0.3s;
}

.tabs button:hover {
    background-color: #ddd;
}

.tabs button.active {
    background-color: #ccc;
}

.view {
    font-family: Arial, sans-serif;
    padding: 20px;
}

.view p {
    color: #333;
    margin-top: 20px;
    color: white;
}

.view button {
    padding: 10px 20px;
    margin-top: 15px;
    background-color: #4285F4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.view button:hover {
    background-color: #357AE8;
}
`