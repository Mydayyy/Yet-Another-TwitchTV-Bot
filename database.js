const Sequelize = require("sequelize");

let sequelize = new Sequelize("db", null, null, {
    dialect: "sqlite",
    storage: "./db.sqlite",
    pool: {
        max: 1,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

let Viewer = sequelize.define("Viewer", {
    username: Sequelize.STRING,
    watched: Sequelize.DOUBLE,
    watchedCounter: Sequelize.DOUBLE,
    tickets: Sequelize.INTEGER
});

class Database {
    constructor() {
        this.isReady = false;
        this.readyCallbacks = [];

        this.isQuerying = false;
        this.queryQueue = [];

        console.log("Creating Database");

        sequelize.authenticate().then(_ => {
            console.log("Database connection established.");

            sequelize.sync().then(_ => {
                this.ready();
            }, err => {
                console.log("An error occurred while creating the table: ", err);
                throw err;
            });
        }, err => {
            console.log("Failed to establish database connection: ", err);
            throw err;
        });

    }

    ready() {
        for (let idx in this.readyCallbacks) {
            let callback = this.readyCallbacks[idx];
            callback();
        }
    }

    onReady(callback) {
        if (this.isReady) {
            return callback();
        }
        return this.readyCallbacks.push(callback);
    }

    startQuerying() {
        if(this.isQuerying) {
            return;
        }
        this.isQuerying = true;
        this.doQuery();
    }

    doQuery() {
        if(this.queryQueue.length === 0) {
            this.isQuerying = false;
            return;
        }
        let query = this.queryQueue.shift();

        this[query.query](query, (...args) => {
            query.callback(...args)
            this.doQuery();
        });
    }

    _getUser(query, callback) {
        Viewer.findCreateFind({
            where: {
                username: query.username
            },
            defaults: {
                watched: 0,
                watchedCounter: 0,
                tickets: 0
            }
        }).spread((viewer, created) => {
            callback(viewer, created);
        });
    }

    getUser(username, callback=_=>{}) {
        this.queryQueue.push({
            query: "_getUser",
            callback: callback,
            username: username
        });
        this.startQuerying();
    }


    _saveUser(query, callback) {
        query.user.save().then(user => {
            callback(user);
        }).catch(err => {
            throw err;
        });
    }

    saveUser(user, callback=_=>{}) {
        this.queryQueue.push({
            query: "_saveUser",
            callback: callback,
            user: user
        });
        this.startQuerying();
    }

}

module.exports = new Database();
