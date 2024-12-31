var readline = require('readline');
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function inputHandler() {
    while (true) {
        await new Promise((resolve, reject) => {
            rl.question('', function (answer) {
                if (answer === "stop") {
                    process.exit(0);
                } else {
                    resolve(answer);
                    console.log("Unknown command.");
                }
            });
        });
    }
}

inputHandler();

const fs = require('node:fs');
const path = require('node:path');

const {
    Client,
    Events,
    GatewayIntentBits,
    SlashCommandBuilder,
    Collection,
    PermissionFlagsBits,
    PermissionsBitField,
    PresenceUpdateStatus,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');

const JSON5 = require('json5');
require('json5/lib/register');

const config = require('./config.json');
const { token, test } = config;
let { commands, buttons } = require('./triggers.json5');
let { embeds } = require('./embeds.json5');
const { refresh } = require("./deploy.js");
refresh();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages] });

client.commands = new Collection();

let tagCommands = [];

function generateTicketChannelName(data, interaction, guild, currentCount) {
    const channelName = data.name.replace("${user}", interaction.user.username.replace(".", "-")) + "-" + currentCount.toString();

    if (guild.channels.cache.find(c => c.name === channelName)) {
        return generateTicketChannelName(data, interaction, guild, currentCount + 1);
    }

    return channelName;
}

client.once(Events.ClientReady, c => {
    console.log(`Running as ${c.user.tag}`);
    if (test) {
        client.user.setStatus(PresenceUpdateStatus.Invisible);
    } else {
        client.user.setStatus(PresenceUpdateStatus.Online);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        const ticketIds = {
            "login_issue": {
                "name": "login-ticket-${user}",
                "content": "${mention} Please state if you own a Minecraft account, we will be with you shortly."
            },
            "launcher_issue": {
                "name": "launcher-ticket-${user}",
                "content": "${mention} Please describe the issue you are facing and if possible, details to reproduce the issue, we will be with you shortly."
            },
            "bug_report": {
                "name": "bug-report-${user}",
                "content": "${mention} Please describe the bug and some steps to reproduce the bug, we will be with you shortly."
            },
            "misc": {
                "name": "misc-ticket-${user}",
                "content": "${mention} Please describe the reason for creating this ticket, we will be with you shortly."
            }
        }
        if (ticketIds[interaction.customId]) {
            const data = ticketIds[interaction.customId];
            const guild = await client.guilds.fetch(config.tickets.guildId);

            let msg = {};

            if (data.embed) {
                msg.embeds = [data.embed]
            }
            if (data.content) {
                msg.content = data.content.replace("${mention}", interaction.user.toString())
            }

            let channelName = generateTicketChannelName(data, interaction, guild, 1);

            const channel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText });
            const category = guild.channels.cache.find(c => c.id === config.tickets.categoryId);
            channel.setParent(category);
            channel.permissionOverwrites.set(category.permissionOverwrites.cache);
            channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true })
            await channel.send(msg);

            await interaction.reply({ ephemeral: true, content: `Created ticket. ${channel.url}` })
        } else {
            for (const button of buttons) {
                if (button.id === interaction.customId) {
                    if (button.reply) {
                        const msg = button.reply;

                        if (button.replyButtons) {
                            const row = new ActionRowBuilder();
                            for (const button1 of button.replyButtons) {
                                if (button1.type === "link") {
                                    row.addComponents(new ButtonBuilder()
                                        .setURL(button1.id)
                                        .setLabel(button1.label)
                                        .setStyle(ButtonStyle.Link));
                                } else {
                                    row.addComponents(new ButtonBuilder()
                                        .setCustomId(button1.id)
                                        .setLabel(button1.label)
                                        .setStyle(getButtonType(button1.type)));
                                }
                            }

                            msg.components = [row];
                        }

                        await interaction.reply(msg);
                    }
                }
            }
        }
    }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    await newMessage.guild.channels.cache.get(config.log.channelId).send({
        embeds: [{
            title: `Message edited.`,
            description: `Edited ${newMessage.author.toString()}.\n\n**Old Message**:\n${oldMessage.content}\n\n**New Message**:\n${newMessage.content}`,
            color: 0xDEC41F
        }]
    });
});

client.on(Events.MessageDelete, async (message, channel) => {
    if (message.content.startsWith("??")) return;

    await message.guild.channels.cache.get(config.log.channelId).send({
        embeds: [{
            title: `Message deleted.`,
            description: `Message by ${message.author.toString()} from ${message.channel.toString()}.\n\n**Message content**:\n${message.content}`,
            color: 0xED4245
        }]
    });
});

client.on(Events.MessageCreate, async message => {
    let send = false;
    let del = false;

    if (message.content.startsWith("!!")) {
        send = true;
    } else if (message.content.startsWith("??")) {
        send = true;
        del = true;
    }

    if (send) {
        let content = message.content.slice(2);
        let tags = content.split(",");
        let msgs = [];

        if (tags.length <= 3) for (const tag of tags) {
            const commands = tagCommands.filter(item => item.name == tag);
            if (commands.length === 0) {
                msgs.push({
                    allowedMentions: { repliedUser: false },
                    embeds: [{
                        title: "Unknown Tag!",
                        description: `Tag '${tag}' could not be found.`,
                        color: 0xED4245
                    }]
                });
            } else if (commands.length > 1) {
                msgs.push({
                    allowedMentions: { repliedUser: false },
                    embeds: [{
                        title: "Ambiguous Tag!",
                        description: `There was more than 1 tag with the name '${tag}'. Contact bot developers for a solution.`,
                        color: 0xED4245
                    }]
                });
            } else {
                let msg = commands[0].getMsg(false);

                //console.log(msg); // Used for debugging

                msgs.push(msg);
            }
        } else {
            msgs.push({
                embeds: [{
                    title: "Too many tags.",
                    description: "You provided too many tags, you may only provide a max of 3.",
                    color: 0xED4245
                }]
            });
        }

        let filteredMsgs = [];

        for (const msg of msgs) {
            if (filteredMsgs.includes(msg)) continue;
            filteredMsgs.push(msg);
        }

        msgs = filteredMsgs;

        let first = true;

        for (const msg of msgs) {
            if (first && !del) await message.reply(msg);
            else if (first && del) {
                for (const embed of msg.embeds) {
                    embed.footer = {};
                    embed.footer.text = `Triggered by ${message.author.username}`;
                }

                if (message.reference && message.reference.messageId) {
                    msg.allowedMentions.repliedUser = true;
                    await message.channel.messages.cache.get(message.reference.messageId).reply(msg);
                } else {
                    await message.channel.send(msg);
                }
            }
            else await message.channel.send(msg);
            first = false;
        }

        if (del) {
            await message.delete();
        }
    }

    if (message.content === "$ticketInteractable" && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        if (message.channel.isDMBased()) {
            await message.reply("You can only execute this in a guild.");
        } else {
            await message.delete();

            const login = new ButtonBuilder()
                .setCustomId('login_issue')
                .setLabel('Login Issue')
                .setStyle(ButtonStyle.Primary);

            const launcher = new ButtonBuilder()
                .setCustomId('launcher_issue')
                .setLabel('Launcher Issue')
                .setStyle(ButtonStyle.Success);

            const bug = new ButtonBuilder()
                .setCustomId('bug_report')
                .setLabel('Bug Report')
                .setStyle(ButtonStyle.Danger);

            const misc = new ButtonBuilder()
                .setCustomId('misc')
                .setLabel('Misc')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder()
                .addComponents(login, launcher, bug, misc);

            message.channel.send({
                embeds: [embeds.ticket],
                components: [row],
            })
        }
    }
});

function getButtonType(str) {
    if (str === "primary") {
        return ButtonStyle.Primary;
    } else if (str === "secondary") {
        return ButtonStyle.Secondary;
    } else if (str === "danger") {
        return ButtonStyle.Danger;
    } else if (str === "success") {
        return ButtonStyle.Success;
    }

    console.warn(`Button found with an invalid type ${str}.`);
    return ButtonStyle.Primary;
}

function commandReg() {
    let triggers = require('./triggers.json5');

    commands = triggers.commands;
    buttons = triggers.buttons;
    embeds = require('./embeds.json5').embeds;

    builtCommands = [];

    tagCommands = [];

    commands.forEach(function (command, index) {
        if (command.test && !test) return;

        const names = [];

        if (Array.isArray(command.name)) {
            for (const name of command.name) names.push(name);
        } else {
            names.push(command.name);
        }

        names.forEach((name, index) => {
            builtCommands.push({
                data: new SlashCommandBuilder()
                    .setName(name)
                    .setDescription(command.description),
                async execute(interaction) {
                    const msg = command.reply;

                    if (command.replyButtons) {
                        const row = new ActionRowBuilder();
                        for (const button of command.replyButtons) {
                            if (button.type === "link") {
                                row.addComponents(new ButtonBuilder()
                                    .setURL(button.id)
                                    .setLabel(button.label)
                                    .setStyle(ButtonStyle.Link));
                            } else {
                                row.addComponents(new ButtonBuilder()
                                    .setCustomId(button.id)
                                    .setLabel(button.label)
                                    .setStyle(getButtonType(button.type)));
                            }
                        }

                        msg.components = [row];
                    }
                    await interaction.reply(msg);
                }
            });

            tagCommands.push({
                name: name,
                getMsg(ping) {
                    const msg = command.reply;
                    msg.allowedMentions = { repliedUser: ping };

                    if (command.replyButtons) {
                        const row = new ActionRowBuilder();
                        for (const button of command.replyButtons) {
                            if (button.type === "link") {
                                row.addComponents(new ButtonBuilder()
                                    .setURL(button.id)
                                    .setLabel(button.label)
                                    .setStyle(ButtonStyle.Link));
                            } else {
                                row.addComponents(new ButtonBuilder()
                                    .setCustomId(button.id)
                                    .setLabel(button.label)
                                    .setStyle(getButtonType(button.type)));
                            }
                        }

                        msg.components = [row];
                    }

                    return msg;
                }
            });
        })
    });

    // Here we add anymore commands we want

    // Any commands would usually be added with the files, but refresh needs access to the client object
    builtCommands.push({
        data: new SlashCommandBuilder()
            .setName("refresh")
            .setDescription("Refreshes all commands of the bot")
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        async execute(interaction) {
            await interaction.reply({ ephemeral: true, content: "Refreshing..." });
            delete require.cache[require.resolve('./triggers.json5')]
            refresh();
            commandReg();
            await interaction.editReply({ ephemeral: true, content: "Complete." });
        },
    });

    builtCommands.forEach(function (builtCommand, index) {
        client.commands.set(builtCommand.data.name, builtCommand);
    });
}

commandReg();

/**/

client.login(token);