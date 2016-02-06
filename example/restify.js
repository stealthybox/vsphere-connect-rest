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
server.get('/:vsphere/:type', vsphere.get);
server.get('/:vsphere/:type/:id', vsphere.get);
server.del('/:vsphere/:type/:id', vsphere.del);


// start the server
server.listen(8080, function() {
	console.log('%s listening at %s', server.name, server.url);
});