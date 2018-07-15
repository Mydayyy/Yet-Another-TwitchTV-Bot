# Yet Another TwitchTV Bot

This is a simple TwitchTV Bot which was written in one evening. It uses TwitchTV's undocumented chatter API to track the minutes watched of your viewers. You can configure how many seconds a viewer needs to have watched to receive one ticket. Tickets can be spend in giveaways. The more tickets you use to enter the giveaway, the higher is your chance to win.

## Commands

- `gamble AMOUNT`: You have a chance to double the amount of tickets gambled or lose them

- `tickets`: Shows the user how many tickets he has left

- `startgiveaway`: Starts a giveaway. Broadcaster or admin only

- `giveaway AMOUNT`: Enter the giveaway with the specified amount of tickets

- `endgiveaway`: Ends the giveaway and announces a random winner

- `rerollwinner`: Announces a new random winner

- `givetickets AMOUNT NAME`: Gives the amount of tickets to name. Amount can be negative. Broadcaster or admin only.

## Requirements
- Node
- NPM

## Setup
- Clone this repo
- run `npm install`
- Rename settings.example.js to settings.js
- Modify settings.js according to your preferences
- run `node index.js`

## Configuration
All configurations can be done inside settings.js.

- `username`: The username of your bot account

- `oauth`: The OAuth-Token of your bot account

- `channel`: The channel you wish the bot to appear in

- `clientID`: The clientID of your app

- `ticketEveryXSeconds`: How many seconds a user needs to watch in order to receive a ticket

- `commandPrefix`: The prefix you need to have in front of commands

- `admins`: A list of admins who can use broadcaster only commands

- `gambleWinChance`: The chance to win in the !gamble command


## Limitations
Due to the use of sqlite, this bot is only suited for low traffic channels.
Sqlite only allows one transaction at a time and coupled with sequelize which
does not offer a bulkload or bulkupdate function, saving users and loading them takes
up a lot of time.


## Developers
It is pretty easy to extend the bot with new commands. You can add new functions
inside bot.js and modify the knownCommands.

## Roadmap
- Restructure it a bit
- Move the commands out of bot.js and into their own namespace
