require("dotenv").config();

global.TOKEN = process.env.DISCORD_TOKEN;
global.CLIENT = process.env.CLIENT_ID;
global.GUILD = process.env.GUILD_ID;
global.OLLAMA = process.env.OLLAMA_API_HOST;
global.MODEL = process.OLLAMA_DEFAULT_MODEL;

module.exports = global;
