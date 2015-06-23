'use strict';

var model;

module.exports = function(config) {
    var logger = config.logger;
    var mongoose = config.mongoose;

    if (! model) {
        var Schema = mongoose.Schema;

        var nodeSchema = new Schema({
            node_id:        { type: Number, unique: true },     // Numeric identifier assigned to this node
            active:         { type: Boolean, default: true },    // Whether the node is currently active or not
            ip:             String,     // IP address of the node if one it statically allocated. This may be inaccurate if the node has a dynamic IP
            name:           String,     // The short name for the node
            friendly_name:  String,     // Longer full name of the node
            address:        String,     // Street address where the node is located if fixed.
            install_date:   Date,       // Date the node was first installed

            created:        { type: Date, default: Date.now }, // Date the node record was added. Different than install_date
            updated:        { type: Date, default: Date.now },

            location: { // This is the initial or default location of the node.
                'type': {
                    type:       String,
                    required:   true,
                    enum:       ['Point', 'LineString', 'Polygon'],
                    default:    'Point'
                },
                coordinates: [],
            }
        });

        nodeSchema.index({ 'node_id' : 1 });
        model = mongoose.model('Node', nodeSchema);
    }

    return model;
}
