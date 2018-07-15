const fs = require("fs");
const tmi = require("tmi.js")
const settings = require("./settings.js");
const database = require("./database.js");
const api = require("twitch-api-v5");

api.clientID = settings.clientID;



let opts = {
    identity: {
        username: settings.username,
        password: "oauth:" + settings.oauth
    },
    channels: [settings.channel]
}

class Bot {
    constructor() {
        this.client = false;
        this.chatters = [];
        this.users = {};
        this.intervalID = 0;
        this.lastChatterUpdate = 0;

        this.giveawayParticipants = [];
        this.giveawayRunning = false;
        this.currentWinner = "";

        this.knownCommands = {
            gamble: this.onUserGamble.bind(this),
            tickets: this.onUserTickets.bind(this),
            startgiveaway: this.onStartGiveaway.bind(this),
            giveaway: this.onGiveaway.bind(this),
            endgiveaway: this.onEndGiveaway.bind(this),
            rerollwinner: this.onGiveawayNewWinner.bind(this),
            givetickets: this.onGiveTickets.bind(this),
        }

        database.onReady(this.onDatabaseReady.bind(this));
    }

    onDatabaseReady() {
        console.log("DB is ready");

        // for(let i = 0; i < 1500; i++) {
        //     database.getUser("" + i, (function(i) {return function(user, created) {
        //         user.watched = i;
        //         database.saveUser(user, (function(i) {return function() {console.log("User " + i + " saved")}})(i));
        //     }})(i));
        // }

        this.initializeUsers();
    }

    initializeUsers() {
        this.getAllActiveChatters().then(chatters => {
            this.chatters = chatters;
            this.lastChatterUpdate = (new Date()).getTime();
            this.loadCurrentUsers();
        });
    }

    loadCurrentUsers() {
        console.log("Loading users");

        if (this.chatters.length === 0) {
            return this.initializationFinished();
        }

        let usersProcessed = 0;
        for (let idx in this.chatters) {
            let chatter = this.chatters[idx];
            database.getUser(chatter, (user, created) => {
                console.log("User loaded: " + chatter);
                this.users[chatter] = user;
                usersProcessed++;
                if (usersProcessed === this.chatters.length) {
                    this.initializationFinished();
                }
            });
        }
    }

    initializationFinished() {
        process.on("exit", this.onExit.bind(this));
        process.on("SIGINT", this.onExit.bind(this));
        process.on("SIGUSR1", this.onExit.bind(this));
        process.on("SIGUSR2", this.onExit.bind(this));

        this.client = new tmi.client(opts);
        this.client.on("message", this.onMessageHandler.bind(this));
        this.client.connect();

        this.intervalID = setInterval(this.updateActiveChatters.bind(this), 1000 * 10);
    }

    updateActiveChatters() {
        let oldChatters = this.chatters;
        this.getAllActiveChatters().then(chatters => {
            let usersThatStayed = chatters.filter(x => oldChatters.includes(x));
            let usersThatJoined = chatters.filter(x => !oldChatters.includes(x));
            let usersThatLeft = oldChatters.filter(x => !chatters.includes(x));

            this.chatters = chatters;

            usersThatStayed.forEach(this.userStayed.bind(this));
            usersThatJoined.forEach(this.userJoined.bind(this));
            usersThatLeft.forEach(this.userLeft.bind(this));

            this.lastChatterUpdate = (new Date()).getTime();
        });
    }

    userJoined(name, callback) {
        //if (settings.greet) {}

        if (name in this.users) {
            return;
        }

        database.getUser(name, (user, created) => {
            if (name in this.users) {
                return;
            }

            this.users[name] = user;

            if (callback && typeof callback === "function") {
                callback(user);
            }
        });
    }

    userLeft(name) {
        console.log("User left: ", name);
        if (!(name in this.users)) {
            return;
        }
        let user = this.users[name];
        delete this.users["name"];
        database.saveUser(user, _ => {
            console.log("User saved: ", name)
        });
    }

    userStayed(name) {
        let user = this.users[name];

        user.watchedCounter += (new Date().getTime() - this.lastChatterUpdate) / 1000;
        this.users[name].watched += (new Date().getTime() - this.lastChatterUpdate) / 1000;

        while (user.watchedCounter > settings.ticketEveryXSeconds) {
            user.watchedCounter -= settings.ticketEveryXSeconds;
            this.users[name].tickets += 1;
        }

        console.log(name, user.watched, user.watchedCounter, this.users[name].tickets);
    }

    onMessageHandler(target, context, msg, self) {
        if (self) {
            return
        }

        if(context["message-type"] !== "chat") {
            return;
        }

        if (msg.substr(0, 1) !== settings.commandPrefix) {
            return;
        }

        let fromName = context["display-name"].toLowerCase();

        const parse = msg.slice(1).split(" ");
        const commandName = parse[0];
        const params = parse.splice(1);
        if(!(fromName in this.users)) {
            this.userJoined(fromName, user => {
                if(commandName in this.knownCommands) {
                    this.knownCommands[commandName](fromName, params, context);
                }
            });
            return;
        }

        if(commandName in this.knownCommands) {
            this.knownCommands[commandName](fromName, params, context);
        }
    }

    onUserGamble(fromName, params) {
        if(params.length === 0) {
            return;
        }
        let gambleAmount = params[0];

        if(isNaN(gambleAmount)) {
            return;
        }

        gambleAmount = +gambleAmount;

        if(gambleAmount <= 0) {
            return;
        }


        let user = this.users[fromName];

        if(user.tickets < gambleAmount) {
            return;
        }

        let rnd = Math.random();


        if(rnd <= settings.gambleWinChance) {
            user.tickets += gambleAmount;
            this.say("Congratulations "+fromName+", you won and now have "+user.tickets+" tickets.");
        } else {
            user.tickets -= gambleAmount;
            this.say("Sorry "+fromName+", unfortunately you lost your "+gambleAmount+" tickets.");
        }

        database.saveUser(user);
    }

    onUserTickets(fromName, params) {
        let user = this.users[fromName];

        this.say(fromName+" you currently own "+user.tickets+" tickets.");
    }

    onStartGiveaway(fromName, params, ctx) {
        if(!("broadcaster" in ctx.badges) && !(settings.admins.includes(fromName))) {
            return;
        }

        if(this.giveawayRunning === true) {
            return;
        }

        this.giveawayRunning = true;
        this.giveawayParticipants = [];
        this.currentWinner = "";

        this.say("A giveaway has been started. Type !giveaway AMOUNT to enter. The more tickets you enter with, the higher your win probability");
    }

    onGiveaway(fromName, params) {
        if(this.giveawayRunning === false) {
            this.say("There is no giveaway running");
            return;
        }

        if(params.length === 0) {
            this.say(fromName+" please enter the the amount of ticket you would like to enter with. !giveaway AMOUNT");
            return;
        }

        let enteredTickets = params[0];

        if(isNaN(enteredTickets)) {
            this.say(fromName+" please enter the the amount of ticket you would like to enter with. !giveaway AMOUNT");
            return;
        }

        enteredTickets = +enteredTickets;

        if(enteredTickets <= 0) {
            this.say(fromName+" the ticket count must be greater than 0");
            return;
        }

        let user = this.users[fromName];

        if(user.tickets < enteredTickets) {
            this.say(fromName+" you only have "+user.tickets+" tickets");
            return;
        }

        user.tickets -= enteredTickets;

        let userXtickets = Array(enteredTickets).fill(fromName);

        this.giveawayParticipants = this.giveawayParticipants.concat(userXtickets);

        database.saveUser(user);
    }

    onEndGiveaway(fromName, params, ctx) {
        if(!("broadcaster" in ctx.badges) && !(settings.admins.includes(fromName))) {
            return;
        }

        if(this.giveawayRunning === false) {
            this.say("There is no giveaway running");
            return;
        }

        this.giveawayRunning = false;

        let winner = this.giveawayParticipants[Math.floor(Math.random()*this.giveawayParticipants.length)];

        this.currentWinner = winner;

        this.say("The winner is: " + winner);
    }

    onGiveawayNewWinner(fromName, params, ctx) {
        if(!("broadcaster" in ctx.badges) && !(settings.admins.includes(fromName))) {
            return;
        }

        if(this.giveawayRunning === true) {
            this.say("The giveaway is currently running. End it first!");
            return;
        }

        this.giveawayParticipants = this.giveawayParticipants.filter(name => name !== this.currentWinner);

        if(this.giveawayParticipants.length === 0) {
            return this.say("There are no participants left.");
        }

        let winner = this.giveawayParticipants[Math.floor(Math.random()*this.giveawayParticipants.length)];
        this.currentWinner = winner;
        this.say("The new winner is: " + winner);
    }

    onGiveTickets(fromName, params, ctx) {
        if(!("broadcaster" in ctx.badges) && !(settings.admins.includes(fromName))) {
            return;
        }

        if(params.length <= 1) {
            return;
        }

        let ticketsToGive = params[0];

        if(isNaN(ticketsToGive)) {
            return;
        }

        ticketsToGive = +ticketsToGive;

        let receiver = params[1];

        if(!(receiver in this.users)) {
            return;
        }

        let user = this.users[receiver];

        user.tickets += ticketsToGive;

        this.say(receiver+" has received "+ticketsToGive+" tickets and now has "+user.tickets+" tickets");
    }

    say(message) {
        this.client.say(settings.channel, message);
    }

    getAllActiveChatters() {
        return new Promise((resolve, reject) => {
            api.other.chatters({
                channelName: settings.channel
            }, (err, res) => {
                if (err) {
                    throw err;
                }
                let activeUsers = [];
                let chatters = res.chatters;
                activeUsers = chatters.moderators.concat(chatters.staff).concat(chatters.admins).concat(chatters.global_mods).concat(chatters.viewers);
                const deduped = [...new Set(activeUsers)];

                const index = deduped.indexOf(settings.username);
                if (index !== -1) {
                    deduped.splice(index, 1);
                }

                resolve(deduped);
            });
        });
    }

    onExit() {
        clearInterval(this.intervalID);

        let users = Object.values(this.users);

        if (users.length === 0) {
            process.exit();
        }

        let usersProcessed = 0;
        for (let idx in users) {
            let user = users[idx];
            database.saveUser(user, _ => {
                console.log("User saved");
                usersProcessed++;
                if (usersProcessed === users.length) {
                    process.exit();
                }
            });
        }
    }
}

function dehash(str) {
    return str.replace(/^#/, "");
}

module.exports = Bot;
