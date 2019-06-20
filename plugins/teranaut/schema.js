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
        },
        use_v1_users: {
            doc: `
                Toggle users store for /api/v1.
                When true it will use the existing teranaut users, if false it will use v1 users.
                Defaults to true for now.
            `,
            default: true
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
