'use strict';

module.exports = {
    auth: {
        open_signup: {
            doc: '',
            default: true
        },
        require_email: {
            doc: '',
            default: true
        },
        models: {
            doc: '',
            default: ''
        },
        user_model: {
            doc: '',
            default: ''
        }
    },
    connection: {
        doc: 'Elasticsearch cluster where user state is stored',
        default: 'default',
        format(val) {
            if (typeof val !== 'string') {
                throw new Error('connection parameter must be of type String as the value');
            }
        }
    }
};
