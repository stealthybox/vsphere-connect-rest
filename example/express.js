/**
 * vSphere Connect REST
 * 
 * @author Branden Horiuchi <bhoriuchi@gmail.com>
 * @license MIT
 * 
 */

var express    = require('express');
var server     = express();

var vsphere = require('../lib');

vsphere.setCredential('administrator@vsphere.local', 'password');

// create routes
server.get('/:vsphere/:type', vsphere.get);
server.delete('/:vsphere/:type/:id', vsphere.del);


// start the server
server.listen(8080, function() {
	console.log('Started express server');
});