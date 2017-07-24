'use strict';

const rateLimiter = require('./rate-limiter');

function incrementRequest(client, addSha, id, limit) {
  const ts = Date.now();
  const aged = ts - limit.precision;
  const key = `${id}:${limit.precision}`;
  return client
    .zremrangebyscore(key, 0, aged)
    .zcard(key)
    .evalsha(addSha, 1, key, limit.amount, ts)
    .expire(key, Math.ceil((ts + limit.precision + 1) / 1000));
}

function createRedisRateLimiter(options = {}) {
  const {
    client = null
  } = options;

  const loadScript = new Promise((resolve, reject) => {
    client.script('load',
      `local c = tonumber(redis.call('ZCARD', KEYS[1]));
if c == nil or tonumber(ARGV[1]) > c then
  redis.call('zadd', KEYS[1], ARGV[2], ARGV[2]);
  return 1;
else
  return 0;
end`, (error, scriptSha) => {
        if (error) {
          return reject(error);
        }

        resolve(scriptSha);
      });
  });

  return Object.assign(rateLimiter.create(options), {
    incrementRequest(id, limits) {
      return loadScript
        .then(addScriptSha => new Promise((resolve, reject) => {
          let clientRequest = client.multi();
          for (const limit of limits) {
            clientRequest = incrementRequest(clientRequest, addScriptSha, id, limit);
          }
          return clientRequest.exec((error, response) => {
            if (error) {
              return reject(error);
            }

            const counts = response.filter((result, index) => index % 4 === 1);
            resolve(counts);
          });
        })
        );
    }
  });
}

module.exports = { create: createRedisRateLimiter };
