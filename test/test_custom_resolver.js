"use strict";

var Redbird = require('../');
var expect = require('chai').expect;
const assert = require('assert');
var _ = require('lodash');

var opts = {
	bunyan: false,
  port: 10000 + Math.ceil(Math.random() * 55535)
  /* {
		name: 'test',
		streams: [{
        	path: '/dev/null',
    	}]
	} */
};


describe("Custom Resolver", function(){

  it("Should contain one resolver by default", function () {

    var redbird = Redbird(opts);
    expect(redbird.resolvers).to.be.an('array');
    expect(redbird.resolvers.length).to.be.eq(1);
    expect(redbird.resolvers[0].resolverCallback).to.be.eq(redbird._defaultResolver);

    redbird.close();
  });

  describe('Should error with with invalid resolvers', () => {
    it('throws an error when an empty object is passed', () => {
      const options = _.extend({
        resolvers: {}
      }, opts);
      options.resolvers = {};
      expect(function () {
        new Redbird(options)
      }).to.throw(Error);
    });
  });

	describe("Should register resolver with right priority", () => {
    it('when resolver is a function', () => {
      const resolver = function () {
        return 'http://127.0.0.1:8080';
      };

      resolver.priority = 1;

      const options = _.extend({
        resolvers: resolver
      }, opts);

      const redbird = Redbird(options);

      expect(redbird.resolvers.length).to.be.eq(2);
      expect(redbird.resolvers[0].priority).to.equal(1);
      expect(redbird.resolvers[0].resolverCallback).to.deep.equal(resolver);
    });

    it('when resolver is an array of functions', () => {
      const resolver = function () {
        return 'http://127.0.0.1:8080';
      };

      resolver.priority = 1;

      const options = _.extend({
        resolvers: [resolver]
      }, opts);

      let redbird = Redbird(options);

      expect(redbird.resolvers.length).to.be.eq(2);
      expect(redbird.resolvers[0].priority).to.equal(1);
      expect(redbird.resolvers[0].resolverCallback).to.deep.equal(resolver);

      resolver.priority = -1;
      redbird = new Redbird(options);
      expect(redbird.resolvers.length).to.be.eq(2);
      expect(redbird.resolvers[1].priority).to.equal(-1);
      expect(redbird.resolvers[1].resolverCallback).to.deep.equal(resolver);
      redbird.close();
    });

    it('when resolver is an object', () => {
      const resolver = {
        match: /^\/test/,
        priority: 1
      }

      const options = _.extend({
        resolvers: resolver
      }, opts);

      const redbird = Redbird(options);

      expect(redbird.resolvers.length).to.be.eq(2);
      expect(redbird.resolvers[0].priority).to.equal(1);
      expect(redbird.resolvers[0].match).to.equal(resolver.match);
    });
  });


  it('Should add and remove resolver after launch', function () {

    var resolver = function () {};
    resolver.priority = 1;

    var redbird = Redbird(opts);
    redbird.addResolver(resolver);
    expect(redbird.resolvers.length).to.be.eq(2);
    expect(redbird.resolvers[0].resolverCallback).to.equal(resolver);

    redbird.addResolver(resolver);
    expect(redbird.resolvers.length, 'Only allows uniques.').to.be.eq(2);


    redbird.removeResolver(resolver);
    expect(redbird.resolvers.length).to.be.eq(1);
    expect(redbird.resolvers[0].resolverCallback).to.be.equal(redbird._defaultResolver);

    redbird.close();

  });


  it('Should properly convert and cache route to routeObject', function () {

    var builder = Redbird.buildRoute;

    // invalid input
    expect(builder(function () {})).to.be.null;
    expect(builder([])).to.be.null;
    expect(builder(2016)).to.be.null;

    var testRoute = {urls: [], path: '/'};
    var testRouteResult = builder(testRoute);
    expect(testRouteResult, 'For route in the default format').to.be.eq(testRoute);
    expect(testRouteResult.isResolved).to.be.undefined;


    // case string:
    var testString = 'http://127.0.0.1:8888';
    var result = builder(testString);
    expect(result.path).to.be.eq('/');
    expect(result.urls).to.be.an('array');
    expect(result.urls.length).to.be.eq(1);
    expect(result.urls[0].hostname).to.be.eq('127.0.0.1');
    expect(result.isResolved).to.be.true;


    var result2 = builder(testString);
    expect(result2).to.be.eq(result);

    // case with object

     var testObject_1= {path:'/api', url: 'http://127.0.0.1'},
       testObjectResult_1 = builder(testObject_1);

    expect(testObjectResult_1.path).to.be.eq('/api');
    expect(testObjectResult_1.urls).to.be.an('array');
    expect(testObjectResult_1.urls.length).to.be.eq(1);
    expect(testObjectResult_1.urls[0].hostname).to.be.eq('127.0.0.1');
    expect(testObjectResult_1.isResolved).to.be.true;


    // test object caching.
    var testObjectResult_2 = builder(testObject_1);
    expect(testObjectResult_1).to.be.eq(testObjectResult_2);

    var testObject_2= {url: ['http://127.0.0.1', 'http://123.1.1.1']}
    var testResult2  = builder(testObject_2);
    expect(testResult2.urls).to.not.be.undefined;
    expect(testResult2.urls.length).to.be.eq(testObject_2.url.length);
    expect(testResult2.urls[0].hostname).to.be.eq('127.0.0.1');
    expect(testResult2.urls[1].hostname).to.be.eq('123.1.1.1');



  });

  it("Should resolve properly as expected", async function () {

    var proxy = new Redbird(opts), resolver = function (host, url) {
      return url.match(/\/ignore/i) ? null : 'http://172.12.0.1/home'
    }, result;

    resolver.priority = 1;

    proxy.register('mysite.example.com', 'http://127.0.0.1:9999');
    proxy.addResolver(resolver);

    result = await mockRequest(proxy, 'randomsite.example.com', '/anywhere');

    // must match the resolver
    expect(result).to.not.be.null;
    expect(result).to.not.be.undefined;
    expect(result.urls.length).to.be.above(0);
    expect(result.urls[0].hostname).to.be.eq('172.12.0.1');

    // expect route to match resolver even though it matches registered address
    result = await mockRequest(proxy, 'mysite.example.com', '/somewhere');
    expect(result.urls[0].hostname).to.be.eq('172.12.0.1');

    // use default resolver, as custom resolver should ignore input.
    result = await mockRequest(proxy, 'mysite.example.com', '/ignore');
    expect(result.urls[0].hostname).to.be.eq('127.0.0.1');


    // make custom resolver low priority and test.
    // result should match default resolver
    proxy.removeResolver(resolver);
    resolver.priority = -1;
    proxy.addResolver(resolver);
    result = await mockRequest(proxy, 'mysite.example.com', '/somewhere');
    expect(result.urls[0].hostname).to.be.eq('127.0.0.1');


    // both custom and default resolvers should ignore
    result = await mockRequest(proxy, 'somesite.example.com', '/ignore');
    expect(result).to.be.undefined;

    proxy.removeResolver(resolver);
    // for path-based routing
    // when resolver path doesn't match that of url, skip

    resolver = function () {
      return {
        path: '/notme',
        url: 'http://172.12.0.1/home'
      }
    };
    resolver.priority = 1;
    proxy.addResolver(resolver);

    result = await mockRequest(proxy, 'somesite.example.com', '/notme');
    expect(result).to.not.be.undefined;
    expect(result.urls[0].hostname).to.be.eq('172.12.0.1');

    result = await mockRequest(proxy, 'somesite.example.com', '/notme/somewhere');
    expect(result.urls[0].hostname).to.be.eq('172.12.0.1');

    proxy.close();
  });

  describe('error processing', () => {
    it('returns a generic 500 internal server error', () => {
      const responseMock = { write() {}, end() {} }
      const proxy = new Redbird(opts);
      proxy.defaultErrorHandler(new Error('test'), {}, responseMock);
      expect(responseMock.statusCode).to.equal(500);
    });

    it('uses the error status and message if status is set', () => {
      const responseMock = { write() {}, end() {} }
      const proxy = new Redbird(opts);
      const error = new Error('test');
      error.status = 404;
      proxy.defaultErrorHandler(error, {}, responseMock);
      expect(responseMock.statusCode).to.equal(404);
    })
  });

  describe('middleware', () => {
    it('matches the request via regex', async (done) => {
      const proxy = new Redbird(opts);
      proxy.addResolver({ match: /\/test/ })
        .use((context, request, response, next) => {
          try {
            expect(context).to.have.property('src', 'host.com');
            done();
          } catch (ex) {
            done(ex);
          }
        });

      const result = await mockRequest(proxy, 'host.com', '/bad-path');
      try {
        expect(result).to.be.undefined;

        await mockRequest(proxy, 'host.com', '/test');
      } catch (ex) {
        done(ex);
      }
    });

    it('executes all the middleware', async (done) => {
      const proxy = new Redbird(opts);
      let count = 0;
      proxy.addResolver({ match: /\/test/ })
        .use((context, request, response, next) => {
          count++;
          next();
        })
        .use((context, request, response, next) => {
          count++;
          next();
        })
        .use((context, request, response, next) => {
          try {
            expect(count).to.equal(2);
            done();
          } catch (ex) {
            done(ex);
          }
        });

      await mockRequest(proxy, 'host.com', '/test');
    });

    it('stops execution of middleware on response.end()', async (done) => {
      const proxy = new Redbird(opts);
      let count = 0;
      proxy.addResolver({ match: /\/test/ })
        .use((context, request, response, next) => {
          count++;
          response.end();
          next();
        })
        .use((context, request, response, next) => {
          try {
            assert.fail();
          } catch (ex) {
            done(ex);
          }
        });

      try {
        const out = {};
        const result = await mockRequest(proxy, 'host.com', '/test', out);
        expect(out.response.finished).to.be.true;
        done();
      } catch (ex) {
        done(ex);
      }
    });

    it('stops execution of middleware on error', async (done) => {
      const proxy = new Redbird(opts);
      let count = 0;
      proxy.addResolver({ match: /\/test/ })
        .use((context, request, response, next) => {
          next(new Error('test'));
        })
        .use((context, request, response, next) => {
          try {
            assert.fail();
          } catch (ex) {
            done(ex);
          }
        });

      try {
        const out = {};
        const result = await mockRequest(proxy, 'host.com', '/test', out);
      } catch (ex) {
        try {
          expect(ex).to.have.property('message', 'test');
          done();
        } catch (ex) {
          done(ex);
        }
      }
    });

    it('forwards errors to error middleware', async (done) => {
      const proxy = new Redbird(opts);
      proxy.addResolver({ match: /\/test/ })
        .use((context, request, response, next) => {
          next(new Error('test'));
        })
        .use((context, request, response, next) => {
          try {
            assert.fail();
          } catch (ex) {
            done(ex);
          }
        })
        .use((error, context, request, response, next) => {
          try {
            expect(error).to.have.property('message', 'test');
            done();
          } catch (ex) {
            done(ex);
          }
        });

      await mockRequest(proxy, 'host.com', '/test');
    });

    it('can use promises to move to the next middleware', async (done) => {
      const proxy = new Redbird(opts);
      let count = 0;
      proxy.addResolver({ match: /\/test/ })
        .use((context, request, response) => {
          ++count;
          return Promise.resolve();
        })
        .use((context, request, response, next) => {
          try {
            expect(++count).to.equal(2);
            done();
          } catch (ex) {
            done(ex);
          }
        });

      await mockRequest(proxy, 'host.com', '/test');
    });

    it('can use promises to move to the next error middleware', async (done) => {
      const proxy = new Redbird(opts);
      proxy.addResolver({ match: /\/test/ })
        .use((context, request, response, next) => {
          next(new Error('test'));
        })
        .use((error, context, request, response, next) => {
          error.status = 404;
          return Promise.resolve(error);
        })
        .use((error, context, request, response, next) => {
          try {
            expect(error).to.have.property('message', 'test');
            expect(error).to.have.property('status', 404);
            done();
          } catch (ex) {
            done(ex);
          }
        });

      await mockRequest(proxy, 'host.com', '/test');
    });

    it('should not continue resolving after having resolved', async (done) => {
      const proxy = new Redbird(opts);
      proxy.addResolver({ match: /\/test/, priority: 1 })
        .use((context, request, response, next) => {
          response.writeHead(204);
          response.end();
        });
      proxy.addResolver({ match: /\/.*/, priority: 0 })
        .use((context, request, response, next) => {
          try {
            assert.fail();
          } catch (ex) {
            done(ex);
          }
        });

      const out = {};
      const result = await mockRequest(proxy, 'host.com', '/test', out);
      try {
        expect(out.response.finished).to.be.true;
        done();
      } catch (ex) {
        done(ex);
      }
    });

    it('should not call middleware twice for a given request', async (done) => {
      const proxy = new Redbird(opts);
      let middleware1 = 0;
      let middleware2 = 0;
      proxy.addResolver({ match: /\/test/, priority: 1 })
        .use((context, request, response, next) => {
          ++middleware1;
          return Promise.resolve(next());
        })
        .use((context, request, response, next) => {
          ++middleware2;
          return Promise.resolve(next());
        });

      const result = await mockRequest(proxy, 'host.com', '/test');
      try {
        expect(middleware1).to.equal(1);
        expect(middleware2).to.equal(1);
        done();
      } catch (ex) {
        done(ex);
      }

    });

    it('should not route if method does not match', async () => {
      const proxy = new Redbird(opts);
      let middleware = 0;
      proxy.addResolver({ method: 'POST', match: /\/test/, priority: 1 })
        .use((context, request, response, next) => {
          ++middleware;
          return Promise.resolve(next());
        });

      const result = await mockRequest(proxy, 'host.com', '/test');
      expect(result).to.be.undefined;
    });
  });

  async function mockRequest(proxy, host, path, out = {}) {
    out.context = { src: host };
    out.request = { method: 'GET', headers: { host: host }, url: path };
    out.response = {
      writeHead() { },
      end() { this.finished = true; }
    };

    return await proxy.resolve(out.context, out.request, out.response);;
  }
});
