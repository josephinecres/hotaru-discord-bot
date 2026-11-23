import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { VoiceBasedChannel } from "discord.js";
import play from "play-dl";
import { Readable } from "stream";
import { getAi } from "../persona.js";

export interface SongItem {
  title: string;
  url: string;
  requestedBy: string;
  durationRaw: string;
}

interface GuildAudioState {
  connection: VoiceConnection;
  player: AudioPlayer;
  queue: SongItem[];
  currentSong: SongItem | null;
  ttsQueue: string[];
  isSpeakingTts: boolean;
}

const guildStates = new Map<string, GuildAudioState>();

async function ensureConnection(voiceChannel: VoiceBasedChannel): Promise<GuildAudioState> {
  const existing = guildStates.get(voiceChannel.guild.id);
  if (existing && existing.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    return existing;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  connection.subscribe(player);

  const state: GuildAudioState = {
    connection,
    player,
    queue: [],
    currentSong: null,
    ttsQueue: [],
    isSpeakingTts: false,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    if (state.isSpeakingTts) {
      state.isSpeakingTts = false;
      void processNextAudio(voiceChannel.guild.id);
    } else {
      state.currentSong = null;
      void processNextAudio(voiceChannel.guild.id);
    }
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    guildStates.delete(voiceChannel.guild.id);
  });

  guildStates.set(voiceChannel.guild.id, state);
  return state;
}

function splitTtsChunks(text: string, maxLen = 170): string[] {
  const words = text.trim().split(/\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxLen) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
}

async function synthesizeFreeTtsBuffer(text: string): Promise<Buffer> {
  const isThai = /[\u0E00-\u0E7F]/.test(text);
  const lang = isThai ? "th" : "en";
  const chunks = splitTtsChunks(text);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(
      chunk
    )}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!res.ok) {
      throw new Error(`Free TTS HTTP ${res.status}`);
    }
    const arr = await res.arrayBuffer();
    buffers.push(Buffer.from(arr));
  }

  return Buffer.concat(buffers);
}

async function synthesizeTtsBuffer(text: string): Promise<Buffer | null> {
  const ttsMode = (process.env.TTS_PROVIDER || "auto").toLowerCase();
  const ai = ttsMode === "free" ? null : getAi();

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text,
                speechMetadata: {
                  style: "Gentle, warm, polite young female secretary voice",
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return Buffer.from(base64Audio, "base64");
      }
    } catch (err) {
      console.warn("Gemini TTS failed, switching to Free Thai/EN TTS:", err);
    }
  }

  return synthesizeFreeTtsBuffer(text);
}

async function processNextAudio(guildId: string): Promise<void> {
  const state = guildStates.get(guildId);
  if (!state) return;

  try {
    // ให้ความสำคัญกับการอ่าน TTS ก่อนถ้ามีคิวข้อความรอพูด
    if (state.ttsQueue.length > 0) {
      const nextText = state.ttsQueue.shift()!;
      state.isSpeakingTts = true;

      const audioBuffer = await synthesizeTtsBuffer(nextText);
      if (audioBuffer && audioBuffer.length > 0) {
        const stream = Readable.from(audioBuffer);
        const resource: AudioResource = createAudioResource(stream, {
          inputType: StreamType.Arbitrary,
        });
        state.player.play(resource);
        return;
      }
      state.isSpeakingTts = false;
    }

    // เล่นเพลงถัดไปในคิว
    if (!state.currentSong && state.queue.length > 0) {
      const nextSong = state.queue.shift()!;
      state.currentSong = nextSong;
      const streamInfo = await play.stream(nextSong.url);
      const resource = createAudioResource(streamInfo.stream, {
        inputType: streamInfo.type,
      });
      state.player.play(resource);
    }
  } catch (err) {
    console.error("Voice playback error:", err);
    state.isSpeakingTts = false;
    state.currentSong = null;
  }
}

export async function enqueueMusic(
  voiceChannel: VoiceBasedChannel,
  query: string,
  requestedBy: string
): Promise<{ song: SongItem; position: number }> {
  const state = await ensureConnection(voiceChannel);

  let song: SongItem;
  if (play.yt_validate(query) === "video") {
    const info = await play.video_basic_info(query);
    song = {
      title: info.video_details.title || "Unknown Track",
      url: info.video_details.url,
      requestedBy,
      durationRaw: info.video_details.durationRaw,
    };
  } else {
    const results = await play.search(query, { limit: 1 });
    if (results.length === 0) {
      throw new Error("โฮตารุหาเพลงที่ต้องการไม่พบค่ะ ลองเปลี่ยนคำค้นหาดูนะคะ");
    }
    const track = results[0];
    song = {
      title: track.title || query,
      url: track.url,
      requestedBy,
      durationRaw: track.durationRaw,
    };
  }

  state.queue.push(song);
  if (state.player.state.status === AudioPlayerStatus.Idle && !state.isSpeakingTts) {
    await processNextAudio(voiceChannel.guild.id);
  }

  return { song, position: state.queue.length };
}

export async function speakTtsInVoice(
  voiceChannel: VoiceBasedChannel,
  text: string
): Promise<void> {
  const state = await ensureConnection(voiceChannel);
  state.ttsQueue.push(text.slice(0, 400));
  if (state.player.state.status === AudioPlayerStatus.Idle) {
    await processNextAudio(voiceChannel.guild.id);
  }
}

export function skipMusic(guildId: string): boolean {
  const state = guildStates.get(guildId);
  if (!state) return false;
  state.player.stop();
  return true;
}

export function stopAndLeave(guildId: string): boolean {
  const state = guildStates.get(guildId);
  if (!state) return false;
  state.queue = [];
  state.ttsQueue = [];
  state.currentSong = null;
  state.player.stop();
  state.connection.destroy();
  guildStates.delete(guildId);
  return true;
}

export function getQueueSnapshot(guildId: string) {
  const state = guildStates.get(guildId);
  if (!state) return null;
  return {
    current: state.currentSong,
    upcoming: state.queue,
  };
}