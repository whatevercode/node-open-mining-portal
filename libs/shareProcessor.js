var redis = require('redis');
var Stratum = require('stratum-pool');



/*
This module deals with handling shares when in internal payment processing mode. It connects to a redis
database and inserts shares with the database structure of:

key: coin_name + ':' + block_height
value: a hash with..
        key:

 */


module.exports = function(logger, poolConfig){

    var internalConfig = poolConfig.shareProcessing.internal;
    var redisConfig = internalConfig.redis;
    var coin = poolConfig.coin.name;

    var forkId = process.env.forkId;
    var logSystem = 'Pool';
    var logComponent = coin;
    var logSubCat = 'Thread ' + (parseInt(forkId) + 1);

    var connection = redis.createClient(redisConfig.port, redisConfig.host);

    connection.on('ready', function(){
        logger.debug(logSystem, logComponent, logSubCat, 'Share processing setup with redis (' + redisConfig.host +
            ':' + redisConfig.port  + ')');
    });
    connection.on('error', function(err){
        logger.error(logSystem, logComponent, logSubCat, 'Redis client had an error: ' + JSON.stringify(err))
    });
    connection.on('end', function(){
        logger.error(logSystem, logComponent, logSubCat, 'Connection to redis database as been ended');
    });



    this.handleShare = function(isValidShare, isValidBlock, shareData){


        var redisCommands = [];

        if (isValidShare){
            redisCommands.push(['hincrbyfloat', coin + '_shares:roundCurrent', shareData.worker, shareData.difficulty]);
            redisCommands.push(['hincrby', coin + '_stats', 'validShares', 1]);

            /* Stores share diff, worker, and unique value with a score that is the timestamp. Unique value ensures it
               doesn't overwrite an existing entry, and timestamp as score lets us query shares from last X minutes to
               generate hashrate for each worker and pool. */
            var dateNow = Date.now();
            redisCommands.push(['zadd', coin + '_hashrate', dateNow / 1000 | 0, [shareData.difficulty, shareData.worker, dateNow].join(':')]);
        }
        else{
            redisCommands.push(['hincrby', coin + '_stats', 'invalidShares', 1]);
        }

        if (isValidBlock){
            redisCommands.push(['rename', coin + '_shares:roundCurrent', coin + '_shares:round' + shareData.height]);
            redisCommands.push(['sadd', coin + '_blocksPending', [shareData.blockHash, shareData.txHash, shareData.height, shareData.reward].join(':')]);
            redisCommands.push(['hincrby', coin + '_stats', 'validBlocks', 1]);
        }
        else if (shareData.blockHash){
            redisCommands.push(['hincrby', coin + '_stats', 'invalidBlocks', 1]);
        }

        connection.multi(redisCommands).exec(function(err, replies){
            if (err)
                logger.error(logSystem, logComponent, logSubCat, 'Error with share processor multi ' + JSON.stringify(err));
            else
                logger.debug(logSystem, logComponent, logSubCat, 'Share data and stats recorded');
        });


    };

};