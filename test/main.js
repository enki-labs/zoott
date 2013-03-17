
var Assert = require('assert')
,   Zoott = require('./../lib/main')
,   Step = require('step')
,   Util = require('util');

var testParams = {
    world: 'testWorld'
,   host: 'localhost'
,   port: 2181
};

suite('zoott queue tests', function () {

var that = this;
    setup( function(done) { that.zc = new Zoott(testParams.host, testParams.port, testParams.world, done, true); });

    test('queues exist and can be read', function (done)
    {
        Assert.doesNotThrow ( function () {
            Step(
                    function ()     { this.zc.getPending(this); },
                    function ()     { this.zc.getWorking(this); },
                    function ()     { this.zc.getCompleted(this); },
                    function ()     { this.zc.getTaskRoot(this); },
                    function ()     { done(); }
                );
        });
    });

    test('add task with no parent', function (done)
    {
        var taskInfo = { name: 'atwnp', type: 'test', data: { empty: true } };
        that.zc.queue(taskInfo, null, null, done);
    });

    test('read task with no parent', function (done)
    {
        var taskInfo = { name: 'atwnp2', type: 'test', data: { empty: true } };
        that.zc.queue(taskInfo, null, null, function () {
        that.zc.findTask('atwnp2_test',
            function (data)
            {
                Assert.equal(taskInfo.name, data.name);
                Assert.equal(taskInfo.type, data.type);
                Assert.equal(taskInfo.data.empty, data.data.empty);
                done();
            });
        });
    });

    test('read queue with no parent', function (done)
    {
        var taskInfo = { name: 'atwnp3', type: 'test', data: { empty: true } };
        that.zc.queue(taskInfo, null, null, function () {
        that.zc.findPending('atwnp3_test',
            function (data)
            {
                Assert.equal(data.name, taskInfo.name);
                Assert.equal(data.type, taskInfo.type);
                Assert.equal(data.target, Util.format('/%s/tasks/atwnp3_test', testParams.world));
                done();
            });
        });
    });

    test('add task with parent', function (done)
    {
        var parentTask = { name: 'atwp_parent', type: 'test', data: { empty: true } };
        var childTask = { name: 'atwp_child', type: 'test', data: { empty: true } };

        Step(
            function() { that.zc.queue(parentTask, null, null, this); },
            function() { that.zc.queue(childTask, {name: 'atwp_par.*', type: 'test'}, function (c,p) { return c.name }, this); },
            function() { that.zc.findTask('atwp_parent_test/atwp_child_test', this); },
            function(data) {
                                Assert.equal(childTask.name, data.name);
                                Assert.equal(childTask.type, data.type);
                                Assert.equal(childTask.data.empty, data.data.empty);
                                that.zc.findPending('atwp_parent_test/atwp_child_test', this);
                            },
            function(data) {
                                Assert.equal(childTask.name, data.name);
                                Assert.equal(childTask.type, data.type);
                                Assert.equal(Util.format('/%s/tasks/atwp_parent_test/atwp_child_test', testParams.world), data.target);
                                done();
                            }
        );
    });

    test('queue dequeue with no parent', function (done)
    {
        var taskInfo = { name: 'qdwnp', type: 'deq1', data: { empty: true } };

        Step(
            function () { that.zc.queue(taskInfo, null, null, this); },
            function () { that.zc.dequeue('deq1', this); },
            function (data) 
            {
                Assert.ifError(!data);
                Assert.equal(data.name, 'qdwnp');
                done();
            }
        );
    });

    test('queue dequeue with parent', function (done)
    {
        var parent = { name: 'qdtwpParent', type: 'deq2', data: { empty: true } };
        var child = { name: 'qdtwpChild', type: 'deq2', data: { empty: true } };

        Step(
            function () { that.zc.queue(parent, null, null, this); },
            function () { that.zc.queue(child, {name: 'qdtwpP.*', type: 'deq2'}, function(c,p) { return c.name; }, this); },
            function () { that.zc.dequeue('deq2', this); },
            function (data) 
            {
                Assert.ifError(!data);
                Assert.equal(data.name, 'qdtwpParent');
                that.zc.complete('qdtwpParent_deq2', this);
            },
            function () { that.zc.dequeue('deq2', this); },
            function (data) 
            {
                Assert.ifError(!data);
                Assert.equal(data.name, 'qdtwpChild');
                done();
            }
        );
    });
});
