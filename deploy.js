function refresh() {
    const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
    const { clientId, guildIds, token } = require('./config.json');
    const fs = require('node:fs');
    const path = require('node:path');

    const JSON5 = require('json5');
    require('json5/lib/register');

    const { commands } = require('./triggers.json5');

    const commandData = [];
    const builtCommands = []

    commands.forEach(function (command, index) {
        if (Array.isArray(command.name)) {
            command.name.forEach((name, index) => {
                builtCommands.push({
                    data: new SlashCommandBuilder()
                        .setName(name)
                        .setDescription(command.description)
                });
            })
        } else {
            builtCommands.push({
                data: new SlashCommandBuilder()
                    .setName(command.name)
                    .setDescription(command.description)
            });
        }
    });

    builtCommands.push({data: new SlashCommandBuilder()
        .setName("refresh")
        .setDescription("Refreshes all commands of the bot")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)})

    builtCommands.forEach(function (builtCommand, index) {
        commandData.push(builtCommand.data);
    });

    const rest = new REST().setToken(token);

    (async () => {
        try {
            for (const guildId of guildIds) {
                console.log(`Starting refresh for Guild ${guildId}.`)
                console.log(`Started refreshing ${builtCommands.length} application (/) commands.`);
                const data = await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commandData },
                );
                console.log(`Successfully reloaded ${data.length} application (/) commands.\n`);
            }
        } catch (error) {
            console.error(error);
        }
    })();
}

module.exports.refresh = refresh;