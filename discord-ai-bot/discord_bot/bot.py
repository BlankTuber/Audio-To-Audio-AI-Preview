import discord

class MyClient (discord.Client):
    async def on_ready(self):
        print('Logged on as', self.user)

    async def on_message(self, message):
        print('Message from {0.author}: {0.content}'.format(message))
        
intents = discord.Intents.default()
intents.message_content = False

client = MyClient(intents=intents)

client.run('your token here')