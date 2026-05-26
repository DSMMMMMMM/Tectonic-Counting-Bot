const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const Mexp = require('math-expression-evaluator');
const mexp = new Mexp();
const fs = require('fs').promises;
const path = require('path');

const curNumberPath = path.join(__dirname, 'currentNumber.json');
const leaderboardPath = path.join(__dirname, 'leaderboard.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,         
        GatewayIntentBits.GuildMessages,   
        GatewayIntentBits.MessageContent  
    ]
});

const PREFIX = "c!";

client.once('clientReady', async () => {
    console.log("Logged in as " + client.user.tag + "!");
    
    try {
        const curNumData = await getCurNum();
        const expectedNumber = curNumData.currentCount;
        const lastPerson = curNumData.lastUser;
        
        let displayName = "Nobody yet";

        if (lastPerson && lastPerson !== "0") {
            const channel = client.channels.cache.get('1358152276740407296');
            if (channel) {
                try {
                    const member = await channel.guild.members.fetch(lastPerson);
                    displayName = member.displayName; 
                } catch (fetchError) {
                    displayName = "Unknown User";
                }
                
                const onlineEmbed = new EmbedBuilder()
                    .setTitle("System Status")
                    .setDescription("The Bot is back online! The current count is **" + expectedNumber + "**, last counted by **" + displayName + "**.")
                    .setColor(0x5865F2);

                channel.send({ embeds: [onlineEmbed] });
            }
        }
    } catch (err) {
        console.error("Error running the ready event sequence:", err);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const contentLower = message.content.trim().toLowerCase();

    if (contentLower.startsWith(PREFIX)) {
        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'ping') {
            return message.reply('Pong!');
        }

        if (command === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle("EXCA Counting Bot Help")
                .setDescription("Welcome to the math-friendly counting game! Here are the commands you can use:")
                .addFields(
                    { name: "Commands", value: "`" + PREFIX + "help` - Shows this command menu\n`" + PREFIX + "server` - Shows total server counts, high score, and current progress\n`" + PREFIX + "user` - Shows your personal statistics\n`" + PREFIX + "user @user` - Check the statistics of another server member\n`" + PREFIX + "leaderboard` - View the top 10 counters in this server\n`" + PREFIX + "ping` - Simple latency heartbeat test" },
                    { name: "How To Play", value: "1. Type the next sequential number in the designated channel.\n2. You CANNOT count twice in a row.\n3. Equations are supported! The bot reads the first word of your message.\n   Examples: `2+2` (evaluates to 4), `3*3` (evaluates to 9), `sqrt(16)` (evaluates to 4).\n4. Entering the wrong value resets the entire server streak back to 0." }
                )
                .setColor(0x5865F2);

            return message.channel.send({ embeds: [helpEmbed] });
        }

        if (command === 'server') {
            const leaderboard = await getLeaderboard();
            const stats = leaderboard.server;

            const serverEmbed = new EmbedBuilder()
                .setTitle("Server Counting Stats")
                .addFields(
                    { name: "Current Number", value: String(stats.currentNumber), inline: true },
                    { name: "High Score", value: String(stats.highScore), inline: true },
                    { name: "Total Numbers Counted", value: String(stats.totalScore), inline: true },
                    { name: "Last Counted By", value: stats.lastCountedBy, inline: false }
                )
                .setColor(0x5865F2);

            return message.channel.send({ embeds: [serverEmbed] });
        }

        if (command === 'leaderboard') {
            const leaderboard = await getLeaderboard();
            const usersObj = leaderboard.users;

            const sortedUsers = Object.keys(usersObj)
                .map(id => usersObj[id])
                .sort((a, b) => b.score - a.score);

            let leaderboardDescription = "";
            const topTen = sortedUsers.slice(0, 10);

            if (topTen.length === 0) {
                leaderboardDescription = "No user scores have been tracked yet!";
            } else {
                for (let i = 0; i < topTen.length; i++) {
                    const u = topTen[i];
                    leaderboardDescription += (i + 1) + ". **" + u.username + "** - Total: " + u.numbersCountedTotal + "\n";
                }
            }

            const lbEmbed = new EmbedBuilder()
                .setTitle("Top 10 Server Counters")
                .setDescription(leaderboardDescription)
                .setColor(0xFEE75C);

            return message.channel.send({ embeds: [lbEmbed] });
        }

        if (command === 'user') {
            const leaderboard = await getLeaderboard();
            
            const targetUser = message.mentions.users.first() || message.author;
            const userData = leaderboard.users[targetUser.id];

            if (!userData) {
                const noDataEmbed = new EmbedBuilder()
                    .setTitle("No Data Found")
                    .setDescription("Could not find any counting history for **" + targetUser.username + "**.")
                    .setColor(0xED4245);
                return message.reply({ embeds: [noDataEmbed] });
            }

            const userEmbed = new EmbedBuilder()
                .setTitle("Counting Stats for " + userData.username)
                .addFields(
                    { name: "Total Counts", value: String(userData.numbersCountedTotal), inline: true },
                    { name: "Correct Counts", value: String(userData.numbersCountedCorrect), inline: true },
                    { name: "Wrong Counts", value: String(userData.numbersCountedWrong), inline: true },
                    { name: "Net Score", value: String(userData.score), inline: true },
                    { name: "Highest Valid Hit", value: String(userData.highestValidCount), inline: true },
                    { name: "Accuracy Rate", value: userData.correctRate, inline: true }
                )
                .setColor(0x57F287);

            return message.channel.send({ embeds: [userEmbed] });
        }
    }

    if (message.channelId !== '1358152276740407296') return; 

    let finalNumber = null;
    const firstWord = message.content.split(' ')[0];

    try {
        let userInputEquation = firstWord.toLowerCase();
        finalNumber = mexp.eval(userInputEquation);
    } catch (error) {
        finalNumber = parseInt(firstWord);
    }

    if (finalNumber !== null && !isNaN(finalNumber)) {
        const curNumData = await getCurNum();
        const leaderboard = await getLeaderboard();
        
        const lastPerson = curNumData.lastUser;
        const expectedNumber = curNumData.currentCount + 1;
        const currentChatterName = message.member ? message.member.displayName : message.author.username;

        if (message.author.id === lastPerson) {
            const doubleCountEmbed = new EmbedBuilder()
                .setTitle("You can't count multiple times in a row!")
                .setColor(0xED4245);
            return message.reply({ embeds: [doubleCountEmbed] });
        }

        if (!leaderboard.users[message.author.id]) {
            leaderboard.users[message.author.id] = {
                username: currentChatterName, 
                numbersCountedTotal: 0,
                numbersCountedCorrect: 0,
                numbersCountedWrong: 0,
                score: 0,
                highestValidCount: 0,
                correctRate: "0%"
            };
        }

        const user = leaderboard.users[message.author.id];
        user.username = currentChatterName; 
        user.numbersCountedTotal += 1;

        if (finalNumber === expectedNumber) {
            await message.react('✅');
            
            curNumData.currentCount = finalNumber;
            curNumData.lastUser = message.author.id;
            
            leaderboard.server.currentNumber = finalNumber;
            leaderboard.server.totalScore += 1;
            leaderboard.server.lastCountedBy = currentChatterName;

            if (finalNumber > leaderboard.server.highScore) {
                leaderboard.server.highScore = finalNumber;
            }

            user.numbersCountedCorrect += 1;
            if (finalNumber > user.highestValidCount) {
                user.highestValidCount = finalNumber;
            }
        } else {
            await message.react('❌');
            
            const failEmbed = new EmbedBuilder()
                .setTitle("Streak Broken")
                .setDescription("<@" + message.author.id + "> Ruined it! The next number was supposed to be **" + expectedNumber + "**. Restarting at 0.")
                .setColor(0xED4245);

            await message.reply({ embeds: [failEmbed] });  
            
            curNumData.currentCount = 0;
            curNumData.lastUser = "0";
            
            leaderboard.server.currentNumber = 0;

            user.numbersCountedWrong += 1;
        }

        user.score = user.numbersCountedCorrect - user.numbersCountedWrong;
        const total = user.numbersCountedTotal;
        user.correctRate = total > 0 ? ((user.numbersCountedCorrect / total) * 100).toFixed(1) + "%" : "0%";

        await saveCurNum(curNumData);
        await saveLeaderboard(leaderboard);
    }
});


async function getCurNum() {
    try {
        const rawData = await fs.readFile(curNumberPath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        return { currentCount: 0, lastUser: "0" };
    }
}

async function saveCurNum(dataObject) {
    try {
        const textData = JSON.stringify(dataObject, null, 2);
        await fs.writeFile(curNumberPath, textData, 'utf8');
    } catch (error) {
        console.error("Error writing to currentNumber.json:", error);
    }
}

async function getLeaderboard() {
    const defaultStructure = {
        server: {
            currentNumber: 0,
            highScore: 0,
            totalScore: 0,
            lastCountedBy: "None"
        },
        users: {}
    };

    try {
        const rawData = await fs.readFile(leaderboardPath, 'utf8');
        if (!rawData.trim()) return defaultStructure;
        
        const parsedData = JSON.parse(rawData);
        if (!parsedData.server) parsedData.server = defaultStructure.server;
        if (!parsedData.users) parsedData.users = defaultStructure.users;
        
        return parsedData;
    } catch (error) {
        return defaultStructure;
    }
}

async function saveLeaderboard(dataObject) {
    try {
        const textData = JSON.stringify(dataObject, null, 2);
        await fs.writeFile(leaderboardPath, textData, 'utf8');
    } catch (error) {
        console.error("Error writing to leaderboard.json:", error);
    }
}

client.login(process.env.DISCORD_TOKEN);