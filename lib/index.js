/**
 * vSphere Connect REST
 * 
 * @author Branden Horiuchi <bhoriuchi@gmail.com>
 * @license MIT
 * 
 */

var connectMod = 'vsphere-connect';
var vsphere    = require(connectMod);
var Promise    = require('bluebird');
var _          = require('lodash');


// store the basic auth credentials along with the client instance
var clients = {};
var STATUS  = vsphere.env.statics.status;


var _self = this;


// set a global credential to use to bypass basic auth
_self.setCredential = function(username, password) {
	_self.credential = {
		username: username,
		password: password
	};
};


// decrypt the basic authentication header into a username/password
_self.decryptBasicAuth = function(auth) {

	var buf     = new Buffer(auth.replace(/^Basic\s/, ''), 'base64');
	var authArr = buf.toString().split(':');
	
	if (authArr.length === 2) {
		return {
			username: authArr[0],
			password: authArr[1]
		};	
	}
	return null;
};

// creates a new client connection if one does not exist otherwise returns the existing
_self.getClient = function(req) {
	
	var host = req.params.vsphere.toLowerCase();
	var ignoreSSL = (req.query.ignoressl === 'true') ? true : false;
	
	// get the credential
	var cred   = _self.credential || _self.decryptBasicAuth(req.headers.authorization);
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
};

// get an entity type
_self.getEntity = function(client, type, id, properties) {

	var args = {
		type: type,
		properties: (properties === 'all') ? [] : (properties || ['name'])
	};
	
	if (id) {
		args.id = Array.isArray(id) ? id : [id];
	}
	
	return client.searchManagedEntities(args);
};


// route handler for deleting an entity type
_self.del = function(req, res, next) {
	_self.getClient(req).then(function(client) {
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
};


// route handler for get entity type
_self.get = function(req, res, next) {
	_self.getClient(req).then(function(client) {
		
		// get the fields requested
		var properties, fields = [];
		
		// determine the fields to use
		if (req.query.fields === 'all') {
			fields = 'all';
		}
		else if (typeof(req.query.fields) === 'string') {
			fields = req.query.fields.split(',');
		}
		else if (Array.isArray(req.query.fields)) {
			fields = req.query.fields;
		}
		
		// check for a search and add it do the fields since
		// it will be required to actually do the search.
		// searches will also be performed in 2 phases since
		// searching a large collection with many properties
		// will slow performance
		if (_.has(req.query, 'search.field')) {
			fields     = _.union(fields, [req.query.search.field]);
			properties = [req.query.search.field];
		}
		else {
			properties = fields;
		}

		// search for the entity or entities
		return _self.getEntity(client, req.params.type, req.params.id, properties).then(function(results) {
			
			if (!req.params.id && _.has(req.query, 'search.field') && _.has(req.query, 'search.value')) {
				
				// create a regex of the search value
				var rx = new RegExp(req.query.search.value);
				var matches = [];
				
				// loop throuhgh the results and look for matches
				// compiling a list of ids
				_.forEach(results, function(obj) {
					var prop = _.get(obj, req.query.search.field);
					if (prop && prop.match(rx)) {
						matches.push(obj.moRef.id);
					}
				});
				
				if (matches.length > 0) {
					return _self.getEntity(client, req.params.type, matches, fields).then(function(results) {
						res.send(results);
						return next();
					});
				}
				else {
					res.send([]);
					return next();
				}
			}
			else if (!results) {
				res.send(404, 'Not Found');
				return next();
			}

			// if there were results, send them
			res.send(results);
			return next();
		})
		.caught(function(err) {
			res.send(err.code || 500, err);
			return next();
		});
	});
};


module.exports = _self;