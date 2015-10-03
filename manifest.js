// Downloads DB dump from bungie manifest and creates our definition files
// Taken and modified from kyleshays DIM repo
// https://github.com/kyleshay/DIM/blob/master/build/processBungieManifest.js

var http = require('http');
var fs = require('fs');
var request = require('request');
var sqlite3 = require('sqlite3').verbose();
var unzip = require('unzip');

function writeDefinitionFile(path, data) {
  var stream = fs.createWriteStream(path);
  stream.write(JSON.stringify(data, null, 2));
  stream.end();
}

function onManifestRequest(error, response, body) {
  var parsedResponse = JSON.parse(body);
  var manifestFile = fs.createWriteStream('manifest.zip');

  version = parsedResponse.Response.version;

  var exists = fs.existsSync(version + '.txt');

  // if (!exists) {
  // var versionFile = fs.createWriteStream(version + '.txt');
  // versionFile.write(JSON.stringify(parsedResponse, null, 2));
  // versionFile.end();

  request
    .get('https://www.bungie.net' + parsedResponse.Response.mobileWorldContentPaths.en)
    .pipe(manifestFile)
    .on('close', onManifestDownloaded);
  // } else {
  //   console.log('Version already exist, \'' + version + '\'.');
  // }
}

function onManifestDownloaded() {
  fs.createReadStream('manifest.zip')
    .pipe(unzip.Parse())
    .on('entry', function(entry) {
      ws = fs.createWriteStream('manifest/' + entry.path);

      ws.on('finish', function() {
        var exists = fs.existsSync('manifest/' + entry.path);

        if (exists) {
          extractDB('manifest/' + entry.path);
        }
      });

      entry.pipe(ws);
    });
}

function extractDB(dbFile) {
  db = new sqlite3.Database(dbFile);

  // Talent Grid
  db.all('SELECT * FROM DestinyTalentGridDefinition', function(err, rows) {
    if (err) throw err;

    var DestinyTalentGridDefinition = {};

    rows.forEach(function(row, index) {
      var nodes = [];
      var item = JSON.parse(row.json);
      for (var n = 0, nlen = item.nodes.length; n < nlen; n++) {
        var nodeDef = item.nodes[n];
        var steps = [];
        for (var s = 0, slen = nodeDef.steps.length; s < slen; s++) {
          steps.push({
            'name': nodeDef.steps[s].nodeStepName,
            'nodeStepHash': nodeDef.steps[s].nodeStepHash,
            'description': nodeDef.steps[s].nodeStepDescription,
            'icon': 'https://www.bungie.net' + nodeDef.steps[s].icon,
            'affectsQuality': nodeDef.steps[s].affectsQuality
          });
        }
        nodes.push({
          nodeHash: nodeDef.nodeHash,
          row: nodeDef.row,
          column: nodeDef.column,
          steps: steps
        });
      }
      DestinyTalentGridDefinition[item.gridHash] = nodes; // only include what's actually needed
    });

    writeDefinitionFile('./definitions/DestinyTalentGridDefinition.json', DestinyTalentGridDefinition);
  });
}

request.get('https://www.bungie.net/Platform/Destiny/Manifest/', onManifestRequest);
