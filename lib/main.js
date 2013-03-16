
var Zkplus = require('zkplus')
,   Winston = require('winston')
,   Util = require('util')
,   Async = require('async')
,   Step = require('step')
,   Assert = require('assert')
,   RefCounter = require('./refCounter.js');


/**
 * Init Zoott, connect and ensure queues exist.
 */
var Zoott = function (host, port, world, ready)
{
    this.zooClient = Zkplus.createClient({
        servers: [{
             host: host
            ,port: port
        }]
    });
    
    this.world = world;
    this.worldTasks = Util.format('/%s/tasks', world);
    this.worldPending = Util.format('/%s/pending', world);
    this.worldWorking = Util.format('/%s/working', world);
    this.worldCompleted = Util.format('/%s/completed', world);
    
    var that = this;
    this.zooClient.on('connect',
            function () 
            {
                Winston.info("Zookeeper connected ok");
        
                Step(
                    function ()     { that.zooClient.mkdirp(Util.format('/%s', world), this); },
                    function (err)  { Assert.ifError(err); that.zooClient.mkdirp(that.worldTasks, this); },
                    function (err)  { Assert.ifError(err); that.zooClient.mkdirp(that.worldPending, this); },
                    function (err)  { Assert.ifError(err); that.zooClient.mkdirp(that.worldWorking, this); },
                    function (err)  { Assert.ifError(err); that.zooClient.mkdirp(that.worldCompleted, this); },
                    function (err)  { Assert.ifError(err); ready(); }
                );
            }
    );
};

/**
 * Get an array of node data elements from a given path.
 */
Zoott.prototype.private__getChildren = function (path, resultCallback)
{
    var that = this;

    this.zooClient.readdir(this.worldPending, 
        function (err, nodes)
        { 
            Assert.ifError(err);
       
            if (nodes.length == 0)
            {
                resultCallback([]);
            }
            else
            {        
                Async.map(nodes,
                    function (node, callback)
                    {
                        Step(
                            function () { that.zooClient.get(Util.format("%s/%s", that.worldPending, node), this); },
                            function (err, obj) { this.zooClient.get(obj.path, this); },
                            function (err, obj) { callback(null, obj); }
                        );
                    },
                    function (err, results) 
                    {
                        resultCallback(results);
                    }
                );
            }
        }
    );
};

/**
 * Get an array of all pending tasks.
 */
Zoott.prototype.getPending = function (resultCallback)
{
    this.private__getChildren(this.worldPending, resultCallback);
};

/**
 * Get an array of all working tasks.
 */
Zoott.prototype.getWorking = function (resultCallback)
{
    this.private__getChildren(this.worldWorking, resultCallback);
};

/**
 * Get an array of all completed tasks.
 */
Zoott.prototype.getCompleted = function (resultCallback)
{
    this.private__getChildren(this.worldCompleted, resultCallback);
};

/**
 * Get an array of all root tasks.
 */
Zoott.prototype.getTaskRoot = function (resultCallback)
{
    this.private__getChildren(this.worldTasks, resultCallback);
};

/**
 * Add a task to the tree and queue a pending entry.
 */
Zoott.prototype.private__addTask = function (task, path, done)
{
    var taskPath, pendingPath;
    
    if (path.length == 0)
    {
        taskPath = Util.format('%s/%s_%s', this.worldTasks, task.name, task.type);
        pendingPath = Util.format('%s/%s_%s', this.worldPending, task.name, task.type);
    }
    else
    {
        taskPath = Util.format('%s/%s/%s_%s', this.worldTasks, path, task.name, task.type);
        pendingPath = Util.format('%s/%s|%s_%s', this.worldPending, 
                                            path.replace(/\//g, "|"), task.name, task.type);
    }
    var that = this;
    this.zooClient.mkdirp(taskPath, //ensure task node exists
        function (err)
        {
            Assert.ifError(err);
            that.zooClient.put( taskPath  //create the task
                            ,   task
                            ,   function (err, path)
                                {
                                    that.zooClient.mkdirp(pendingPath,
                                        function (err)
                                        {
                                            Assert.ifError(err);
                                            that.zooClient.put( pendingPath //add task to pending queue
                                            ,   { name: task.name,
                                                  type: task.type,
                                                  target: taskPath
                                                }
                                            ,   function (err, path)
                                                {
                                                    Assert.ifError(err);
                                                    done();
                                                }
                                            );
                                        }
                                    );
                                }
            );
        }
    );
};

/**
 * Walk all nodes in a given path and evalute using the supplied functor.
 */
Zoott.prototype.private__walkAll = function (path, evaluate, refCounter)
{
    refCounter.start();
    var that = this;

    this.zooClient.readdir(path, 
        function (err, nodes)
        {
            Assert.ifError(err);
            nodes.forEach ( function (node)
                            {
                                var nodePath = Util.format('%s/%s', path, node);
                                ///TODO:is asynch going to be a 
                                ///     problem here?
                                evaluate(path, node, refCounter);                                
                                that.private__walkAll(nodePath, evaluate, refCounter);
                            }
                          );
            refCounter.end();
        }
    );
};

/**
 * Retrieve task data.
 * Currently only supports exact path match.
 */
Zoott.prototype.findTask = function (path, done)
{
    this.zooClient.get(Util.format('%s/%s', this.worldTasks, path),
        function (err, data)
        {
            Assert.ifError(err);
            done(data);
        }
    );
};

/**
 * Retrieve pending data.
 * Currently only supports exact path match.
 */
Zoott.prototype.findPending = function (path, done)
{
    this.zooClient.get(Util.format('%s/%s', this.worldPending, path.replace(/\//g, "|")),
        function (err, data)
        {
            Assert.ifError(err);
            done(data);
        }
    );
};

/**
 * Scan the task tree and queue pending changes.
 */
Zoott.prototype.queue = function (taskInfo, parent, nameFunctor, done)
{
    if (parent == null) //root
    {
        this.private__addTask({ name: taskInfo.name
                            , type: taskInfo.type
                            , parent: null
                            , data: taskInfo.data 
                            }
                            , ""
                            , done);    
    }
    else
    {
        var that = this;

        var evalParent = function (taskBase, nameRegex, typeRegex, createName, refCounter)
                         {
                                return function (path, node)
                                {
                                    refCounter.start();
                                    that.zooClient.get(Util.format('%s/%s', path, node), 
                                        function (err, data) 
                                        {
                                            Assert.ifError(err);
                                            if (    data.name.match(nameRegex)
                                                &&  data.type.match(typeRegex))
                                            {
                                                var newTaskName = createName(taskBase, data);
                                                that.private__addTask({ name:newTaskName
                                                                    ,   type:taskBase.type
                                                                    ,   parent:data
                                                                    ,   data: taskBase.data
                                                                    }
                                                                    , node
                                                                    , function () { refCounter.end(); } );
                                            }
                                            else
                                            {
                                                refCounter.end();
                                            }
                                        }
                                    );
                                };
                        };
        var parentNameRegex = new RegExp(parent.name);
        var parentTypeRegex = new RegExp(parent.type);
        var refCounter = new RefCounter(done);
        this.private__walkAll(  this.worldTasks, 
                                evalParent(taskInfo, parentNameRegex, parentTypeRegex, nameFunctor, refCounter),
                                refCounter);
    }
};

/**
 * Export classes and modules.
 */
module.exports = Zoott;
//var obj = new Zoott("wayne", 2181); 

