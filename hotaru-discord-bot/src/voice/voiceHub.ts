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

async function processNextAudio(guildId: string): Promise<void> {
  const state = guildStates.get(guildId);
  if (!state) return;

  try {
    // ให้ความสำคัญกับการอ่าน TTS ก่อนถ้ามีคิวข้อความรอพูด
    if (state.ttsQueue.length > 0) {
      const nextText = state.ttsQueue.shift()!;
      state.isSpeakingTts = true;

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: nextText,
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
        const wavBuffer = Buffer.from(base64Audio, "base64");
        const stream = Readable.from(wavBuffer);
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