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
import { aiDiagnostics, chatAsHotaru } from "./persona.js";
import { createTarotReadingEmbed } from "./commands/tarot.js";
import {
  enqueueMusic,
  getQueueSnapshot,
  nextMusic,
  speakTtsInVoice,
  stopAndLeave,
  toggleLoop,
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
  new SlashCommandBuilder().setName("queue").setDescription("ดูรายการเพลงในคิวของโฮตารุ"),
  new SlashCommandBuilder()
    .setName("tts")
    .setDescription("ให้โฮตารุพูดข้อความที่คุณพิมพ์ออกเสียงในห้องเสียง")
    .addStringOption((opt) =>
      opt.setName("text").setDescription("ข้อความที่ต้องการให้อ่านออกเสียง").setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

let lastDiscordError: string | null = null;

async function registerSlashCommands(token: string) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) {
    console.warn("DISCORD_CLIENT_ID is not set; skipping slash command registration.");
    return;
  }
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });
    console.log("Hotaru slash commands registered.");
  } catch (err) {
    console.error("Failed to register slash commands:", err);
  }
}

client.on(Events.Error, (err) => {
  lastDiscordError = err.message;
  console.error("Discord client error:", err);
});

client.once(Events.ClientReady, async (readyClient) => {
  lastDiscordError = null;
  console.log(`Hotaru is awake in the Garden of Dreams as ${readyClient.user.tag}`);
  const token = process.env.DISCORD_TOKEN?.trim();
  if (token) {
    await registerSlashCommands(token);
  }
});

// จัดการ Slash Commands (/tarot, /queue, /tts)
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

    if (interaction.commandName === "queue") {
      const snap = interaction.guildId ? getQueueSnapshot(interaction.guildId) : null;
      if (!snap || (!snap.current && snap.upcoming.length === 0)) {
        await interaction.reply("ตอนนี้คิวเพลงยังว่างอยู่เลยค่ะ ลองใช้คำสั่ง `!runmusic ชื่อเพลงหรือลิงก์` ได้นะคะ");
        return;
      }
      const list = snap.upcoming.slice(0, 8).map((s, i) => `${i + 1}. ${s.title} (${s.durationRaw})`).join("\n");
      const loopText = snap.loopMode === "track" ? "เปิดลูปเพลงนี้" : snap.loopMode === "queue" ? "เปิดลูปทั้งคิว" : "ปิดลูป";
      await interaction.reply(
        `**กำลังเล่น:** ${snap.current?.title || "-"} (${loopText})\n**คิวถัดไป:**\n${list || "ไม่มีเพลงรอคิว"}`
      );
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

// จัดการคำสั่งเพลง (!runmusic, !loop, !next, !leave, !queue), !say TTS, และแชท AI ปกติ
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    const raw = message.content.trim();
    const lower = raw.toLowerCase();

    // 1. คำสั่งเปิดเพลง: !runmusic <ชื่อเพลง / ลิงก์ YouTube / ลิงก์ Spotify>
    if (lower === "!runmusic" || lower.startsWith("!runmusic ")) {
      const query = raw.slice("!runmusic".length).trim();
      if (!query) {
        await message.reply("พิมพ์ชื่อเพลง หรือวางลิงก์ YouTube / Spotify หลังคำสั่งได้เลยนะคะ เช่น `!runmusic https://open.spotify.com/...`");
        return;
      }
      const voiceChannel = message.member?.voice.channel;
      if (!voiceChannel) {
        await message.reply("กรุณาเข้าห้องเสียงก่อนนะคะ โฮตารุจะได้ตามเข้าไปเปิดเพลงให้ค่ะ");
        return;
      }
      await message.channel.sendTyping();
      const { songs, startPosition } = await enqueueMusic(
        voiceChannel,
        query,
        message.member?.displayName || message.author.username
      );
      if (songs.length === 1) {
        await message.reply(
          `จัดเตรียมเพลง **${songs[0].title}** (${songs[0].durationRaw}) เข้าคิวลำดับที่ ${startPosition} ให้เรียบร้อยแล้วค่ะ`
        );
      } else {
        await message.reply(
          `เพิ่มเพลย์ลิสต์ทั้งหมด **${songs.length} เพลง** (เริ่มจาก **${songs[0].title}**) เข้าคิวให้เรียบร้อยแล้วค่ะ`
        );
      }
      return;
    }

    // 2. คำสั่งลูปเพลง: !loop (สลับเปิด/ปิดลูปเพลงปัจจุบัน) หรือ !loop queue (ลูปทั้งคิว)
    if (lower === "!loop" || lower.startsWith("!loop ")) {
      const arg = raw.slice("!loop".length).trim();
      const res = toggleLoop(message.guild.id, arg);
      if (!res.ok) {
        await message.reply("ตอนนี้โฮตารุยังไม่ได้เปิดเพลงในห้องเสียงเลยค่ะ");
        return;
      }
      const label =
        res.mode === "track"
          ? "เปิดลูปเพลงที่กำลังเล่นอยู่แล้วค่ะ"
          : res.mode === "queue"
            ? "เปิดลูปทั้งคิวเพลงแล้วค่ะ"
            : "ปิดโหมดลูปเพลงแล้วนะคะ";
      await message.reply(label);
      return;
    }

    // 3. คำสั่งข้ามเพลง: !next
    if (lower === "!next") {
      const ok = nextMusic(message.guild.id);
      await message.reply(ok ? "ข้ามไปเพลงถัดไปให้แล้วนะคะ" : "ตอนนี้ยังไม่มีเพลงกำลังเล่นอยู่เลยค่ะ");
      return;
    }

    // 4. คำสั่งออกจากห้องเสียง: !leave
    if (lower === "!leave") {
      const ok = stopAndLeave(message.guild.id);
      await message.reply(
        ok ? "โฮตารุเก็บตะเกียงและออกจากห้องเสียงเรียบร้อยแล้วค่ะ" : "ตอนนี้โฮตารุไม่ได้อยู่ในห้องเสียงค่ะ"
      );
      return;
    }

    // 5. ดูคิวเพลง: !queue
    if (lower === "!queue") {
      const snap = getQueueSnapshot(message.guild.id);
      if (!snap || (!snap.current && snap.upcoming.length === 0)) {
        await message.reply("ตอนนี้คิวเพลงยังว่างอยู่เลยค่ะ ลองพิมพ์ `!runmusic ชื่อเพลงหรือลิงก์` ได้นะคะ");
        return;
      }
      const list = snap.upcoming.slice(0, 8).map((s, i) => `${i + 1}. ${s.title} (${s.durationRaw})`).join("\n");
      const loopText = snap.loopMode === "track" ? "เปิดลูปเพลงนี้" : snap.loopMode === "queue" ? "เปิดลูปทั้งคิว" : "ปิดลูป";
      await message.reply(
        `**กำลังเล่น:** ${snap.current?.title || "-"} (${loopText})\n**คิวถัดไป:**\n${list || "ไม่มีเพลงรอคิว"}`
      );
      return;
    }

    // 6. Auto-TTS Channel: พิมพ์อะไรในห้องนี้ โฮตารุจะพูดตามใน Voice Chat ทันที
    if (process.env.AUTO_TTS_CHANNEL_ID && message.channelId === process.env.AUTO_TTS_CHANNEL_ID) {
      const voiceChannel = message.member?.voice.channel;
      if (voiceChannel && raw) {
        await speakTtsInVoice(voiceChannel, raw);
      }
      return;
    }

    // 7. Prefix command !say สำหรับ TTS ด่วน
    if (lower.startsWith("!say ")) {
      const text = raw.slice(5).trim();
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

    // 8. พูดคุยเล่นกับโฮตารุ (เมื่อแท็ก @Hotaru หรืออยู่ในห้อง AUTO_CHAT_CHANNEL_ID)
    const isMentioned = client.user ? message.mentions.has(client.user) : false;
    const isAutoChat = process.env.AUTO_CHAT_CHANNEL_ID === message.channelId;

    if (isMentioned || isAutoChat) {
      const cleanContent = raw.replace(/<@!?\d+>/g, "").trim();
      if (!cleanContent) return;

      await message.channel.sendTyping();
      const reply = await chatAsHotaru(
        message.channelId,
        message.member?.displayName || message.author.username,
        cleanContent
      );
      await message.reply(reply);
    }
  } catch (err) {
    console.error("Message handler error:", err);
    try {
      await message.reply(
        "ขออภัยนะคะ เกิดขัดข้องเล็กน้อยระหว่างจัดการคำขอ ลองใหม่อีกครั้งนะคะ"
      );
    } catch {
      // Ignore if unable to reply
    }
  }
});

// เปิด HTTP Server บน PORT ที่ Render กำหนด เพื่อให้ Web Service ผ่าน Health Check และเช็กสถานะบอทได้
const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  if (urlPath === "/health" || urlPath === "/") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(
      JSON.stringify({
        ok: true,
        discordReady: client.isReady(),
        bot: client.user?.tag ?? null,
        hasDiscordToken: Boolean(process.env.DISCORD_TOKEN?.trim()),
        hasClientId: Boolean(process.env.DISCORD_CLIENT_ID?.trim()),
        hasGroqKey: Boolean(process.env.GROQ_API_KEY?.trim()),
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
        aiProvider: process.env.AI_PROVIDER || "auto",
        ttsProvider: process.env.TTS_PROVIDER || "auto",
        aiDiagnostics,
        lastError: lastDiscordError,
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

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  lastDiscordError = msg;
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  lastDiscordError = err.message;
  console.error("Uncaught exception:", err);
});

const discordToken = process.env.DISCORD_TOKEN?.trim();
if (!discordToken) {
  lastDiscordError = "Missing DISCORD_TOKEN in Environment Variables.";
  console.error(lastDiscordError);
} else {
  client.login(discordToken).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    lastDiscordError = msg;
    console.error("Discord login failed:", msg);
    if (msg.toLowerCase().includes("disallowed intents")) {
      console.error("HINT: Open Discord Developer Portal -> Bot -> Enable 'MESSAGE CONTENT INTENT' and 'SERVER MEMBERS INTENT'.");
    }
  });
}