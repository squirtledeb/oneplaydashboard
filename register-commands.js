const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'dnd',
    description: 'Activate Do Not Disturb mode for this ticket - bot will stop replying automatically',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    // Use the provided client ID
    const clientId = '1372610090888069190';

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
