/**
 * vSphere Connect REST
 * 
 * @author Branden Horiuchi <bhoriuchi@gmail.com>
 * @license MIT
 * 
 */

var restify    = require('restify');
var server     = restify.createServer();
server.use(restify.queryParser());

var vsphere = require('../lib');


// create routes
server.get('/:viserver/:type', vsphere.get);
server.get('/:viserver/:type/:id', vsphere.get);
server.del('/:viserver/:type/:id', vsphere.del);


// start the server
server.listen(8080, function() {
	console.log('%s listening at %s', server.name, server.url);
});