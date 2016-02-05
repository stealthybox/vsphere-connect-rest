/**
 * vSphere Connect REST
 * 
 * @author Branden Horiuchi <bhoriuchi@gmail.com>
 * @license MIT
 * 
 */

var connectMod = 'vsphere-connect';
var vsphere    = require(connectMod);
var restify    = require('restify');
var Promise    = require('bluebird');
var _          = require('lodash');
var server     = restify.createServer();
server.use(restify.queryParser());

// store the basic auth credentials along with the client instance
var clients = {};
var STATUS  = vsphere.env.statics.status;


// decrypt the basic authentication header into a username/password
function decryptBasicAuth(auth) {
	var buf     = new Buffer(auth.replace(/^Basic\s/, ''), 'base64');
	var authArr = buf.toString().split(':');
	
	if (authArr.length === 2) {
		return {
			username: authArr[0],
			password: authArr[1]
		};	
	}
	return null;
}

// creates a new client connection if one does not exist otherwise returns the existing
function getClient(req) {
	
	var host = req.params.vsphere.toLowerCase();
	var ignoreSSL = (req.query.ignoressl === 'true') ? true : false;
	
	// get the credential
	var cred   = decryptBasicAuth(req.headers.authorization);
	var client = _.get(clients, host + '.' + cred.username.toLowerCase());
	
	if (!cred) {
		return new Promise(function(resolve, reject) {
			reject({code: 401});
		});
	}
	
	if (!client || client.status !== STATUS.CONNECTED) {
		return require(connectMod).client(host, cred.username, cred.password, ignoreSSL)
		.then(function(client) {
			_.set(clients, host + '.' + cred.username.toLowerCase(), client);
			return client;
		})
		.caught(function(err) {
			throw {code: 401};
		});
	}
	else {
		return new Promise(function(resolve, reject) {
			resolve(client);
		});
	}
}

// get an entity type
function getType(client, type, properties) {
	return client.searchManagedEntities({
		type: type,
		properties: properties || ['name']
	});
}


// route handler for deleting an entity type
function del(req, res, next) {
	getClient(req).then(function(client) {
		client.destroyManagedEntity({
			type: req.params.type,
			id: req.params.id
		})
		.then(function(result) {
			res.send(201, result);
			return next();
		})
		.caught(function(err) {
			res.send(500, err);
			return next();
		});
	});
}


// route handler for get entity type
function get(req, res, next) {
	getClient(req).then(function(client) {

		// get the fields requested
		var fields = (req.query.fields) ? req.query.fields.split(',') : [];
		
		return getType(client, req.params.type).then(function(results) {
			
			if (req.query.search && req.query.search.field && req.query.search.value) {
				
				var rx = new RegExp(req.query.search.value);
				
				res.send(
					_.filter(results, function(obj) {
						var prop = _.get(obj, req.query.search.field);

						if (prop) {
							return prop.match(rx);
						}
					})
				);
				return next();
			}
			
			res.send(results);
			return next();
		})
		.caught(function(err) {
			res.send(err.code || 500, err);
			return next();
		});
	});
}



// create routes
server.get('/:vsphere/:type', get);
server.del('/:vsphere/:type/:id', del);


// start the server
server.listen(8080, function() {
	console.log('%s listening at %s', server.name, server.url);
});