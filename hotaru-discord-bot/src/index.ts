import "dotenv/config";
import dns from "node:dns";
import http from "node:http";
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

// บังคับให้ Node เลือก IPv4 ก่อนเพื่อความเสถียรในการเชื่อมต่อบน Render / Docker
dns.setDefaultResultOrder("ipv4first");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
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

function parseTarotPrefixArgs(rawInput: string): { spread: "single" | "three"; question: string } {
  const arg = rawInput.slice("!tarot".length).trim();
  if (/^(1|single)\b/i.test(arg)) {
    return {
      spread: "single",
      question: arg.replace(/^(1|single)\b\s*/i, "").trim(),
    };
  }
  if (/^(3|three)\b/i.test(arg)) {
    return {
      spread: "three",
      question: arg.replace(/^(3|three)\b\s*/i, "").trim(),
    };
  }
  return {
    spread: "three",
    question: arg,
  };
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

// จัดการ Slash Command /tarot
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
  } catch (error) {
    console.error(error);
    const msg = "ขออภัยนะคะ เกิดขัดข้องเล็กน้อยระหว่างเปิดไพ่ค่ะ";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

// จัดการคำสั่ง !tarot และแชท AI ปกติ (@Hotaru หรือ AUTO_CHAT_CHANNEL_ID)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    const raw = message.content.trim();
    const lower = raw.toLowerCase();

    // 1. คำสั่งเปิดไพ่ทาโรต์: !tarot [1|3] [คำถาม]
    if (lower === "!tarot" || lower.startsWith("!tarot ")) {
      await message.channel.sendTyping();
      const { spread, question } = parseTarotPrefixArgs(raw);
      const userName = message.member?.displayName || message.author.username;
      const embed = await createTarotReadingEmbed(userName, question, spread);
      await message.reply({ embeds: [embed] });
      return;
    }

    // 2. พูดคุยเล่นกับโฮตารุ (เมื่อแท็ก @Hotaru หรืออยู่ในห้อง AUTO_CHAT_CHANNEL_ID)
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

function shutdownGracefully(signal: string) {
  console.log(`Received ${signal}, shutting down Hotaru gracefully...`);
  void client.destroy();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
process.on("SIGINT", () => shutdownGracefully("SIGINT"));

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