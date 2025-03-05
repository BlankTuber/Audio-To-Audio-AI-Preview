import os
import discord
import asyncio
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')
VOICE_CHANNEL_ID = 1344418892948312154

class AIVoiceBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.voice_states = True
        super().__init__(intents=intents)
        self.voice_client = None
        
    async def on_ready(self):
        print(f'Bot connected as {self.user}')
        await self.connect_to_voice_channel()
        
    async def connect_to_voice_channel(self):
        channel = self.get_channel(VOICE_CHANNEL_ID)
        if not channel:
            print(f"Could not find voice channel with ID: {VOICE_CHANNEL_ID}")
            return
            
        try:
            self.voice_client = await channel.connect()
            print(f"Connected to voice channel: {channel.name}")
        except Exception as e:
            print(f"Failed to connect to voice channel: {e}")
    
    
    async def on_voice_state_update(self, member, before, after):
        if member.id == self.user.id and before.channel and not after.channel:
            print("Bot was disconnected, attempting to reconnect...")
            await asyncio.sleep(2)
            await self.connect_to_voice_channel()
        
        if not self.voice_client and after.channel and after.channel.id == VOICE_CHANNEL_ID:
            if member.id != self.user.id:
                await self.connect_to_voice_channel()

def main():
    if not TOKEN:
        print("ERROR: DISCORD_TOKEN environment variable not set")
        return
        
    bot = AIVoiceBot()
    bot.run(TOKEN)

if __name__ == "__main__":
    main()