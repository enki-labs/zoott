zoott
=====

A simple task tree in Zookeeper
-------------------------------

Zoott provides a simple interface to create a task/job tree within [Apache Zookeeper](http://http://zookeeper.apache.org/).

 
Init
----

    zoott.init("myworld")

Creates initial directories for Zoot:

* zoott_p - pending tasks
* zoott_w - working tasks
* zoott_c - completed tasks
* zoott_myworld - root of task dependency tree

Queue
-----

    zoott.queue(taskInfo, parent = null, nameFunctor = null)

Creates or updates a task within the task dependency tree and adds the task to the pending queue.

Currently Zoot only supports a straight parent-child dependency for tasks where one task may have many children
but any child may only have a single parent.

### taskInfo
A JSON structure with:

* name - string (no spaces, /, \, or |)
* type - a user defined string that your task handlers can utilise
* data - a JSON payload that will be stored on the task node

Within the tree name and type are assumed to be a unique key.

### parent
A JSON structure with:

* name - string (may be a regular expression)
* type - string (may be a regular expression)

Zoot will search the tree for the name/type and create a child under all matches.

### nameFunctor
A function with the prototype:

    string function (parentName, childName)

which returns a name for a child node given the parent and child.
This allows uniquely naming children where more than one parent has been matched.

Queue Conventions
-----------------

Queueing a task results in a node being created under __zoott_p__. This structure has only one level and node names are
built from the full task path eg:

> /zoott_myworld/requestFile_alpha/downloadFile_alpha/processFile_alpha

becomes

> /zoott_p/requestFile_alpha|downloadFile_alpha|processFile_alpha

!!! Note that the name, type, child path and parent path will be copied to the pending node for efficiency and simplicity. The 
policy for requeuing pending tasks is still to be decided but this may effect the way that this is handled.

Zoott handles dependencies by searching for matches in the pending queue and blocking tasks where a dependency is still
pending eg:

> /zoott_p/requestFile_alpha

will block

> /zoott_p/requestFile_alpha|downloadFile_alpha|processFile_alpha

Locking Mechanism
-----------------

Zoott locks by creating ephemeral nodes in the working tasks node. A task handler will pick up the next pending task,
check that it is a supported type, and check for pending ancestors by attempting to read each node in the chain.

If these checks succeed it will then attempt to create a working node. If a working node is successfully created 
(ie: the pending task is locked) the child node data can be read and the handler can begin processing the task.

As ephemeral nodes are used a handler failure will effectively requeue the task by deleting the working node.

On success the handler will create a node in zoott_c and delete the pending and then working nodes (note the order.)

