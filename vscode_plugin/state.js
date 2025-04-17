

const self = {

    view_provider: null,

    state: {
        'selected-view': 'settings'
    },

    initialize: (view_provider) => {
        self.view_provider = view_provider;
    },

    set: (key, value, options = {}) => {
        self.state[key] = value;
        if(options.refresh){
            self.view_provider.refresh();
        }
    },

    setState: (state, options = {refresh: true}) => {
        Object.assign(self.state, state);
        if(options.refresh){
            self.view_provider.refresh();
        }
    },

    get: (key) => {
        return self.state[key];
    },

}

module.exports = self;