
var Assert = require('assert')
,   Zoott = require('./../lib/main')
,   Step = require('step')
,   Util = require('util');

var testParams = {
    world: 'testWorld'
,   host: 'localhost'
,   port: 2181
};

suite('main - init tests', function () {

    test('constructor and queue creation', function (done)
    {
        Assert.doesNotThrow ( function() {var zc = new Zoott(testParams.host, testParams.port, testParams.world, done);});
    });

    test('queues exist and can be read', function (done)
    {
        Assert.doesNotThrow ( function () {
            Step(
                    function ()     { this.zc = new Zoott(testParams.host, testParams.port, testParams.world, this); },
                    function ()     { this.zc.getPending(this); },
                    function ()     { this.zc.getWorking(this); },
                    function ()     { this.zc.getCompleted(this); },
                    function ()     { this.zc.getTaskRoot(this); },
                    function ()     { done(); }
                );
        });
    });
});

suite('main - method tests', function () {

    var that = this;

    setup( function(done) { that.zc = new Zoott(testParams.host, testParams.port, testParams.world, done); });

    test('add task with no parent', function (done)
    {
        var taskInfo = { name: 'atwnp', type: 'test', data: { empty: true } };
        that.zc.queue(taskInfo, null, null, done);
    });

    test('read task with no parent', function (done)
    {
        var taskInfo = { name: 'atwnp', type: 'test', data: { empty: true } };
        that.zc.findTask('atwnp_test',
            function (data)
            {
                Assert.equal(taskInfo.name, data.name);
                Assert.equal(taskInfo.type, data.type);
                Assert.equal(taskInfo.data.empty, data.data.empty);
                done();
            });
    });

    test('read queue with no parent', function (done)
    {
        var taskInfo = { name: 'atwnp', type: 'test', data: { empty: true } };
        that.zc.findPending('atwnp_test',
            function (data)
            {
                Assert.equal(data.name, taskInfo.name);
                Assert.equal(data.type, taskInfo.type);
                Assert.equal(data.target, Util.format('/%s/tasks/atwnp_test', testParams.world));
                done();
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

});
