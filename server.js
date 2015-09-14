'use strict';

var fs = require('fs');
var request = require('request');
var restify = require('restify');
var throng = require('throng');

var BungieAPIPrefix = 'https://www.bungie.net/Platform/';
var DestinyTalentGridDefinition = JSON.parse(fs.readFileSync('./definitions/DestinyTalentGridDefinition.json'));
var siteCreators = JSON.parse(process.env.SITE_CREATORS);
var siteDonators = JSON.parse(process.env.SITE_DONATORS);

throng(start, {
  workers: process.env.WEB_CONCURRENCY || 1,
  lifetime: Infinity
});

function start() {
  function getInventory(req, res) {
    var options = {
      url: BungieAPIPrefix + 'Destiny/' + req.params.membershipType + '/Account/' + req.params.membershipId + '/Character/' + req.params.characterId + '/Inventory/',
      headers: {'X-API-Key': process.env.BUNGIE_API_KEY}
    };
    try {
      request(options, function (error, response, body) {
        if (!error) {
          var items = JSON.parse(body).Response.data.buckets.Equippable;
          var itemO = [];
          var talentGrid;
          for (var i = 0, len = items.length; i < len; i++) {
            var thisItems = items[i].items[0];
            var nodeA = [];
            if (thisItems) {
              talentGrid = DestinyTalentGridDefinition[thisItems.talentGridHash];
              if (talentGrid) {
                for (var n = 0, nlen = thisItems.nodes.length; n < nlen; n++) {
                  var nodeDef = talentGrid.nodes[n];
                  nodeA.push({
                    nodeHash: nodeDef.nodeHash,
                    row: nodeDef.row,
                    column: nodeDef.column,
                    isActivated: thisItems.nodes[n].isActivated,
                    stepIndex: thisItems.nodes[n].stepIndex,
                    steps: talentGrid.nodes[n].steps[thisItems.nodes[n].stepIndex]
                  });
                }
              }
              itemO.push({
                itemHash: thisItems.itemHash,
                itemLevel: thisItems.itemLevel,
                bucketHash: items[i].bucketHash,
                stats: thisItems.stats,
                perks: thisItems.perks,
                primaryStat: thisItems.primaryStat,
                nodes: nodeA
              });
            }
          }
          res.send(itemO);
        } else {
          res.send(error);
        }
      });
    } catch (e) {}
  }

  function getStats(req, res) {
    var options = {
      url: BungieAPIPrefix + 'Destiny/Stats/' + req.params.membershipType + '/' + req.params.membershipId + '/' + req.params.characterId + '/?modes=14',
      headers: {'X-API-Key': process.env.BUNGIE_API_KEY}
    };
    try {
      request(options, function (error, response, body) {
        if (!error) {
          var tStats = JSON.parse(body).Response.trialsOfOsiris.allTime;

          var options = {
            url: BungieAPIPrefix + 'Destiny/Vanguard/Grimoire/' + req.params.membershipType + '/' + req.params.membershipId + '/?single=401030',
            headers: {'X-API-Key': process.env.BUNGIE_API_KEY}
          };
          try {
            request(options, function (error, response, body) {
              if (!error) {
                var lighthouse = JSON.parse(body).Response.data.cardCollection.length > 0;
                var nonHazard = [];
                if (siteCreators.indexOf(req.params.membershipId) > -1) {
                  nonHazard.push('Site Developer');
                }
                if (siteDonators.indexOf(req.params.membershipId) > -1) {
                  nonHazard.push('Site Donator');
                }
                res.send({
                  stats: tStats,
                  lighthouse: lighthouse,
                  nonHazard: nonHazard
                });
              } else {
                res.send(error);
              }
            });
          } catch (e) {}
        } else {
          res.send(error);
        }
      });
    } catch (e) {}
  }

  function searchPlayer(req, res) {
    var options = {
      url: BungieAPIPrefix + 'Destiny/SearchDestinyPlayer/' + req.params.platform + '/' + req.params.playerName + '/',
      headers: {'X-API-Key': process.env.BUNGIE_API_KEY}
    };
    try {
      request(options, function (error, response, body) {
        if (!error) {
          res.send(JSON.parse(body));
        } else {
          res.send(error);
        }
      });
    } catch (e) {}
  }

  function getAlerts(req, res) {
    var options = {
      url: BungieAPIPrefix + 'GlobalAlerts/',
      headers: {'X-API-Key': process.env.BUNGIE_API_KEY}
    };
    try {
      request(options, function (error, response, body) {
        if (!error) {
          res.send(JSON.parse(body).Response);
        } else {
          res.send(error);
        }
      });
    } catch (e) {}
  }

  var server = restify.createServer();

  restify.CORS.ALLOW_HEADERS.push('accept');
  restify.CORS.ALLOW_HEADERS.push('sid');
  restify.CORS.ALLOW_HEADERS.push('lang');
  restify.CORS.ALLOW_HEADERS.push('origin');
  restify.CORS.ALLOW_HEADERS.push('withcredentials');
  restify.CORS.ALLOW_HEADERS.push('x-requested-with');

  server.use(restify.CORS({
    //   origins: ['http://www.destinytrialsreport.com', 'http://trialsscout.herokuapp.com', 'http://staging.destinytrialsreport.com', 'http://my.destinytrialsreport.com', 'http://localhost:9000']
  }));

  server.use(restify.gzipResponse());

  server.get('/SearchDestinyPlayer/:platform/:playerName', searchPlayer);
  server.get('/getInventory/:membershipType/:membershipId/:characterId', getInventory);
  server.get('/trialsStats/:membershipType/:membershipId/:characterId', getStats);
  server.get('/GlobalAlerts/', getAlerts);

  server.use(restify.throttle({
    burst: 20,
    rate: 35,
    ip: true
  }));

  // Start server
  var port = process.env.PORT || 8000;
  server.listen(port, function () {
    console.log('%s listening at %s', server.name, server.url);
  });

}
