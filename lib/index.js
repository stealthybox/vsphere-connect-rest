/**
 * vSphere Connect REST
 * 
 * @author Branden Horiuchi <bhoriuchi@gmail.com>
 * @license MIT
 * 
 */
var Connect    = require('/Users/Branden/git/vsphere-connect/lib/index.js');
var Promise    = require('bluebird');
var _          = require('lodash');
var pluralize  = require('pluralize');


// store the basic auth credentials along with the client instance
var clients = {};
var STATUS  = Connect.env.statics.status;

// store a pointer to the module
var _self = this;


// create a params hash that can be overridden by the dev
_self.params = {
	viserver: 'viserver',
	type: 'type',
	id: 'id',
	method: 'method'
};


// overrides default param values for routes
_self.setParams = function(overrides) {
	_.merge(_self.params, overrides);
};


// set a global credential to use to bypass basic auth
_self.setCredential = function(username, password) {
	_self.credential = {
		username: username,
		password: password
	};
};


// express and restify do not have the same syntax for a one
// line response with code, so this emulates that for both
_self.send = function(res, status, body) {
	
	// check for express
	if (typeof(res.sendStatus) === 'function') {
		res.status(status).send(body);
	}
	else {
		res.send(status, body);
	}
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


// create a rest compliant resource path and map it back to the object type
_self.mapObjectsToPath = function(client) {
	client.schema      = Connect.env.schema.utils.getSchema(client.apiVersion);
	client.objectPaths = {};
	_.forEach(client.schema, function(v, k) {
		client.objectPaths[pluralize(k.toLowerCase())] = k;
	});
};


// get the object type
_self.getObjectType = function(client, type) {
	if (_.has(client.schema, type)) {
		return type;
	}
	else if (_.has(client.objectPaths, type)) {
		return client.objectPaths[type];
	}
	else {
		return null;
	}
};


// creates a new client connection if one does not exist otherwise returns the existing
_self.getClient = function(req) {
	
	var host = req.params[_self.params.viserver];
	host     = host ? host.toLowerCase() : null;
	
	var ignoreSSL = (req.query.ignoressl === 'true') ? true : false;
	ignoreSSL     = (_self.ignoreSSL === true) ? true : ignoreSSL;
	
	// get the credential
	var cred   = _self.credential || _self.decryptBasicAuth(req.headers.authorization);
	var client = _.get(clients, host + '.' + cred.username.toLowerCase());
	
	if (!cred) {
		return new Promise(function(resolve, reject) {
			reject({
				code: 401,
				message: 'No credentials were provided'
			});
		});
	}
	else if (!host) {
		return new Promise(function(resolve, reject) {
			reject({
				code: 400,
				message: 'No host specified'
			});
		});
	}
	else if (!client || client.status !== STATUS.CONNECTED) {
		var viClient = new Connect.Client();
		return viClient(host, cred.username, cred.password, ignoreSSL, _self.maxRetry, _self.exclusive)
		.then(function(client) {
			_self.mapObjectsToPath(client);
			_.set(clients, host + '.' + cred.username.toLowerCase(), client);
			return client;
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
		
		var type = _self.getObjectType(client, req.params[_self.params.type]);
		
		client.destroyManagedEntity({
			type: type,
			id: req.params[_self.params.id]
		})
		.then(function(result) {
			_self.send(res, 201, result);
			return next();
		})
		.caught(function(err) {
			_self.send(res, 500, err);
			return next();
		});
	});
};

// return a page
_self.page = function(req, results) {
	
	if (!Array.isArray(results)) {
		return results;
	}
	
	var limit  = !isNaN(req.query.limit)  ? parseInt(req.query.limit, 10)  : 100;
	var offset = !isNaN(req.query.offset) ? parseInt(req.query.offset, 10) : 0;
	return results.slice(offset, limit + offset);
};


// route handler for get entity type
_self.get = function(req, res, next) {
	_self.getClient(req).then(function(client) {
		
		// get the fields requested
		var properties, fields = [];
		
		var type = _self.getObjectType(client, req.params[_self.params.type]);
		
		// validate that the object is a valid type
		if (!type) {
			_self.send(res, 404, req.params[_self.params.type] + ' is not a valid object type');
			return next();
		}

		// determine the fields to use
		if (req.query.fields === 'all') {
			fields = [];
		}
		else if (typeof(req.query.fields) === 'string') {
			fields = req.query.fields.split(',');
		}
		else if (Array.isArray(req.query.fields)) {
			fields = req.query.fields;
		}
		
		fields = (fields.length === 0 && req.query.fields !== 'all') ? ['name'] : fields;
		
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
		return _self.getEntity(
			client,
			type,
			req.params[_self.params.id],
			properties
		)
		.then(function(results) {
			
			if (!req.params[_self.params.id] && 
					_.has(req.query, 'search.field') && 
					_.has(req.query, 'search.value')) {
				
				// create a regex of the search value
				var rx = new RegExp(req.query.search.value);
				var matches = [];
				
				// loop throuhgh the results and look for matches
				// compiling a list of ids
				_.forEach(results, function(obj) {
					var prop = _.get(obj, req.query.search.field);
					if (prop && prop.match(rx)) {
						matches.push(obj.id);
					}
				});
				
				if (matches.length > 0) {
					return _self.getEntity(client, type, matches, fields)
					.then(function(results) {
						res.send(_self.page(req, results));
						return next();
					});
				}
				else {
					res.send([]);
					return next();
				}
			}
			else if (!results) {
				_self.send(res, 404, 'Not Found');
				return next();
			}

			// if there were results, send them
			res.send(_self.page(req, results));
			return next();
		})
		.caught(function(err) {
			_self.send(res, (err.code || 500), err);
			return next();
		});
	})
	.caught(function(err) {
		_self.send(res, (err.code || 500), err);
		return next();
	});
};


// adds all available routes
_self.addRoutes = function(app) {
	
	// reset params to default
	_self.setParams({
		viserver : 'viserver',
		type     : 'type',
		id       : 'id',
		method   : 'method'
	});
	
	// add routes
	app.get('/:viserver/:type', _self.get);
	app.get('/:viserver/:type/:id', _self.get);
	
	if (typeof(app.delete) === 'function') {
		app.delete('/:viserver/:type/:id', _self.del);
	}
	else {
		app.del('/:viserver/:type/:id', _self.del);
	}
};


// export the module
module.exports = _self;