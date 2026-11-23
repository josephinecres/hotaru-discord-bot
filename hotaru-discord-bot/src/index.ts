import "dotenv/config";
import http from "node:http";
import ffmpegPath from "ffmpeg-static";
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { chatAsHotaru } from "./persona.js";
import { createTarotReadingEmbed } from "./commands/tarot.js";
import {
  enqueueMusic,
  getQueueSnapshot,
  skipMusic,
  speakTtsInVoice,
  stopAndLeave,
} from "./voice/voiceHub.js";

// ตั้งค่า path ของ FFmpeg ให้ @discordjs/voice ใช้งานได้บน Render Linux
if (ffmpegPath && !process.env.FFMPEG_PATH) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName("tarot")
    .setDescription("ให้โฮตารุเปิดไพ่ทาโรต์ทำนายดวงชะตาและสมดุลของใจ")
    .addStringOption((opt) =>
      opt.setName("question").setDescription("คำถามหรือเรื่องที่อยากให้โฮตารุช่วยเปิดไพ่")
    )
    .addStringOption((opt) =>
      opt
        .setName("spread")
        .setDescription("รูปแบบการเปิดไพ่")
        .addChoices(
          { name: "1 ใบ (สารแห่งแสงตะเกียง)", value: "single" },
          { name: "3 ใบ (อดีต - ปัจจุบัน - อนาคต)", value: "three" }
        )
    ),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("ให้โฮตารุเปิดเพลงในห้องเสียง (Voice Channel)")
    .addStringOption((opt) =>
      opt.setName("query").setDescription("ชื่อเพลงหรือลิงก์ YouTube").setRequired(true)
    ),
  new SlashCommandBuilder().setName("skip").setDescription("ข้ามเพลงที่กำลังเล่นอยู่"),
  new SlashCommandBuilder().setName("queue").setDescription("ดูรายการเพลงในคิวของโฮตารุ"),
  new SlashCommandBuilder().setName("stop").setDescription("หยุดเพลงและออกจากห้องเสียง"),
  new SlashCommandBuilder()
    .setName("tts")
    .setDescription("ให้โฮตารุพูดข้อความที่คุณพิมพ์ออกเสียงในห้องเสียง")
    .addStringOption((opt) =>
      opt.setName("text").setDescription("ข้อความที่ต้องการให้อ่านออกเสียง").setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), {
    body: commands,
  });
  console.log("Hotaru slash commands registered.");
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Hotaru is awake in the Garden of Dreams as ${readyClient.user.tag}`);
  await registerSlashCommands();
});

// จัดการ Slash Commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "tarot") {
      await interaction.deferReply();
      const question = interaction.options.getString("question") || "";
      const spread = (interaction.options.getString("spread") as "single" | "three") || "three";
      const embed = await createTarotReadingEmbed(interaction.user.displayName, question, spread);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "play") {
      const member = await interaction.guild?.members.fetch(interaction.user.id);
      const voiceChannel = member?.voice.channel;
      if (!voiceChannel) {
        await interaction.reply({ content: "กรุณาเข้าห้องเสียงก่อนนะคะ โฮตารุจะได้ตามเข้าไปเปิดเพลงให้ค่ะ", ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const query = interaction.options.getString("query", true);
      const { song, position } = await enqueueMusic(voiceChannel, query, interaction.user.displayName);
      await interaction.editReply(
        `จัดเตรียมเพลง **${song.title}** (${song.durationRaw}) เข้าคิวลำดับที่ ${position} ให้เรียบร้อยแล้วค่ะ`
      );
      return;
    }

    if (interaction.commandName === "skip") {
      const ok = interaction.guildId ? skipMusic(interaction.guildId) : false;
      await interaction.reply(ok ? "ข้ามไปเพลงถัดไปให้แล้วนะคะ" : "ตอนนี้ยังไม่มีเพลงกำลังเล่นอยู่เลยค่ะ");
      return;
    }

    if (interaction.commandName === "queue") {
      const snap = interaction.guildId ? getQueueSnapshot(interaction.guildId) : null;
      if (!snap || (!snap.current && snap.upcoming.length === 0)) {
        await interaction.reply("ตอนนี้คิวเพลงยังว่างอยู่เลยค่ะ ลองใช้คำสั่ง `/play` ได้นะคะ");
        return;
      }
      const list = snap.upcoming.slice(0, 8).map((s, i) => `${i + 1}. ${s.title} (${s.durationRaw})`).join("\n");
      await interaction.reply(
        `**กำลังเล่น:** ${snap.current?.title || "-"}\n**คิวถัดไป:**\n${list || "ไม่มีเพลงรอคิว"}`
      );
      return;
    }

    if (interaction.commandName === "stop") {
      const ok = interaction.guildId ? stopAndLeave(interaction.guildId) : false;
      await interaction.reply(ok ? "โฮตารุเก็บตะเกียงและออกจากห้องเสียงเรียบร้อยแล้วค่ะ" : "โฮตารุไม่ได้อยู่ในห้องเสียงค่ะ");
      return;
    }

    if (interaction.commandName === "tts") {
      const member = await interaction.guild?.members.fetch(interaction.user.id);
      const voiceChannel = member?.voice.channel;
      if (!voiceChannel) {
        await interaction.reply({ content: "รบกวนเข้าห้องเสียงก่อนนะคะ โฮตารุจะได้พูดให้ฟังได้ค่ะ", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const text = interaction.options.getString("text", true);
      await speakTtsInVoice(voiceChannel, text);
      await interaction.editReply(`โฮตารุอ่านข้อความ "${text}" ในห้องเสียงเรียบร้อยแล้วค่ะ`);
    }
  } catch (error) {
    console.error(error);
    const msg = "ขออภัยนะคะ เกิดขัดข้องเล็กน้อยระหว่างจัดการคำขอค่ะ";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

// จัดการแชทพูดคุยปกติ (เมื่อ Mention บอท หรือพิมพ์ในห้องแชทที่กำหนด) และ Auto-TTS
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  // 1. Auto-TTS Channel: พิมพ์อะไรในห้องนี้ โฮตารุจะพูดตามใน Voice Chat ทันที
  if (process.env.AUTO_TTS_CHANNEL_ID && message.channelId === process.env.AUTO_TTS_CHANNEL_ID) {
    const voiceChannel = message.member?.voice.channel;
    if (voiceChannel && message.content.trim()) {
      await speakTtsInVoice(voiceChannel, message.content.trim());
    }
    return;
  }

  // 2. Prefix command !say สำหรับ TTS ด่วน
  if (message.content.startsWith("!say ")) {
    const text = message.content.slice(5).trim();
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      await message.reply("เข้าห้องเสียงก่อนนะคะ เดี๋ยวโฮตารุตามเข้าไปอ่านให้ฟังค่ะ");
      return;
    }
    if (text) {
      await speakTtsInVoice(voiceChannel, text);
    }
    return;
  }

  // 3. พูดคุยเล่นกับโฮตารุ (เมื่อแท็ก @Hotaru หรืออยู่ในห้อง AUTO_CHAT_CHANNEL_ID)
  const isMentioned = client.user ? message.mentions.has(client.user) : false;
  const isAutoChat = process.env.AUTO_CHAT_CHANNEL_ID === message.channelId;

  if (isMentioned || isAutoChat) {
    const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();
    if (!cleanContent) return;

    await message.channel.sendTyping();
    const reply = await chatAsHotaru(message.channelId, message.member?.displayName || message.author.username, cleanContent);
    await message.reply(reply);
  }
});

// เปิด HTTP Server บน PORT ที่ Render กำหนด เพื่อให้ Web Service ผ่าน Health Check
const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        bot: client.user?.tag ?? "connecting",
        uptimeSeconds: Math.floor(process.uptime()),
      })
    );
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Hotaru health server listening on port ${PORT}`);
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in environment variables.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);