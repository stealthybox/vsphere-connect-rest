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

// optionally set a credential to bypass basic auth
vsphere.setCredential('administrator@vsphere.local', 'password');

// optionally override the default request params. default values are the key names
var newParams = {
	viserver: 'myViserver',
	type: 'myType',
	id: 'myId',
	method: 'myMethod'
};

vsphere.setParams(newParams);
vsphere.ignoreSSL = true;

// create routes
server.get('/:myViserver/:myType', vsphere.get);
server.get('/:myViserver/:myType/:myId', vsphere.get);
server.delete('/:myViserver/:myType/:myId', vsphere.del);


// start the server
server.listen(8080, function() {
	console.log('Started express server');
});