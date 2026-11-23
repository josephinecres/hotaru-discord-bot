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

export type LoopMode = "off" | "track" | "queue";

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
  loopMode: LoopMode;
  skipRequested: boolean;
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
    loopMode: "off",
    skipRequested: false,
    ttsQueue: [],
    isSpeakingTts: false,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    if (state.isSpeakingTts) {
      state.isSpeakingTts = false;
      void processNextAudio(voiceChannel.guild.id);
      return;
    }

    const finishedSong = state.currentSong;
    state.currentSong = null;

    if (state.skipRequested) {
      state.skipRequested = false;
      if (state.loopMode === "queue" && finishedSong) {
        state.queue.push(finishedSong);
      }
    } else if (finishedSong) {
      if (state.loopMode === "track") {
        state.queue.unshift(finishedSong);
      } else if (state.loopMode === "queue") {
        state.queue.push(finishedSong);
      }
    }

    void processNextAudio(voiceChannel.guild.id);
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

async function resolveSpotifyQueries(spotifyUrl: string): Promise<string[]> {
  const cleanUrl = spotifyUrl.split("?")[0];
  const match = cleanUrl.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album)\/([a-zA-Z0-9]+)/i);
  if (!match) return [];

  const kind = match[1].toLowerCase();
  const id = match[2];

  // ดึงข้อมูลเพลงจาก Spotify Embed / oEmbed โดยไม่ต้องใช้ Spotify API Key
  try {
    const embedRes = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (embedRes.ok) {
      const html = await embedRes.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        const parsed = JSON.parse(nextDataMatch[1]) as {
          props?: {
            pageProps?: {
              state?: {
                data?: {
                  entity?: {
                    name?: string;
                    title?: string;
                    artists?: Array<{ name: string }>;
                    trackList?: Array<{ title?: string; subtitle?: string }>;
                  };
                };
              };
            };
          };
        };
        const entity = parsed.props?.pageProps?.state?.data?.entity;
        if (entity?.trackList && entity.trackList.length > 0) {
          return entity.trackList
            .slice(0, 15)
            .map((t) => `${t.title || ""} ${t.subtitle || ""}`.trim())
            .filter(Boolean);
        }
        if (entity?.name || entity?.title) {
          const artist = entity.artists?.map((a) => a.name).join(" ") || "";
          return [`${entity.name || entity.title} ${artist}`.trim()];
        }
      }
    }
  } catch (err) {
    console.warn("Spotify embed parse failed, trying oEmbed:", err);
  }

  // Fallback ด้วย Spotify oEmbed API สาธารณะ
  const oembedRes = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(cleanUrl)}`,
    { headers: { "User-Agent": "HotaruDiscordBot/1.0" } }
  );
  if (oembedRes.ok) {
    const oembed = (await oembedRes.json()) as { title?: string };
    if (oembed.title) return [oembed.title];
  }

  return [];
}

export async function enqueueMusic(
  voiceChannel: VoiceBasedChannel,
  rawQuery: string,
  requestedBy: string
): Promise<{ songs: SongItem[]; startPosition: number }> {
  const query = rawQuery.replace(/^<|>$/g, "").trim();
  const state = await ensureConnection(voiceChannel);
  const startPosition = state.queue.length + 1;
  const addedSongs: SongItem[] = [];

  // 1. รองรับลิงก์ Spotify (Track / Playlist / Album)
  if (/open\.spotify\.com/i.test(query)) {
    const queries = await resolveSpotifyQueries(query);
    if (queries.length === 0) {
      throw new Error("โฮตารุไม่สามารถดึงข้อมูลเพลงจากลิงก์ Spotify นี้ได้ค่ะ ลองส่งเป็นลิงก์เพลงเดี่ยวหรือชื่อเพลงดูนะคะ");
    }
    for (const q of queries) {
      const results = await play.search(q, { limit: 1 });
      if (results.length > 0) {
        const track = results[0];
        addedSongs.push({
          title: track.title || q,
          url: track.url,
          requestedBy,
          durationRaw: track.durationRaw,
        });
      }
    }
    if (addedSongs.length === 0) {
      throw new Error("ไม่พบไฟล์เสียงสำหรับลิงก์ Spotify นี้ค่ะ");
    }
  } else if (play.yt_validate(query) === "playlist") {
    // 2. รองรับลิงก์ YouTube Playlist
    const playlist = await play.playlist_info(query, { incomplete: true });
    const videos = await playlist.all_videos();
    for (const v of videos.slice(0, 15)) {
      addedSongs.push({
        title: v.title || "YouTube Track",
        url: v.url,
        requestedBy,
        durationRaw: v.durationRaw,
      });
    }
  } else if (play.yt_validate(query) === "video") {
    // 3. รองรับลิงก์ YouTube เดี่ยว
    const info = await play.video_basic_info(query);
    addedSongs.push({
      title: info.video_details.title || "Unknown Track",
      url: info.video_details.url,
      requestedBy,
      durationRaw: info.video_details.durationRaw,
    });
  } else {
    // 4. ค้นหาจากชื่อเพลง
    const results = await play.search(query, { limit: 1 });
    if (results.length === 0) {
      throw new Error("โฮตารุหาเพลงที่ต้องการไม่พบค่ะ ลองเปลี่ยนคำค้นหาดูนะคะ");
    }
    const track = results[0];
    addedSongs.push({
      title: track.title || query,
      url: track.url,
      requestedBy,
      durationRaw: track.durationRaw,
    });
  }

  state.queue.push(...addedSongs);
  if (state.player.state.status === AudioPlayerStatus.Idle && !state.isSpeakingTts) {
    await processNextAudio(voiceChannel.guild.id);
  }

  return { songs: addedSongs, startPosition };
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

export function toggleLoop(guildId: string, arg?: string): { ok: boolean; mode: LoopMode } {
  const state = guildStates.get(guildId);
  if (!state) return { ok: false, mode: "off" };

  const cleanArg = (arg || "").trim().toLowerCase();
  if (cleanArg === "queue") {
    state.loopMode = state.loopMode === "queue" ? "off" : "queue";
  } else if (cleanArg === "off") {
    state.loopMode = "off";
  } else {
    state.loopMode = state.loopMode === "off" ? "track" : "off";
  }
  return { ok: true, mode: state.loopMode };
}

export function nextMusic(guildId: string): boolean {
  const state = guildStates.get(guildId);
  if (!state || (!state.currentSong && state.queue.length === 0)) return false;
  state.skipRequested = true;
  state.player.stop();
  return true;
}

export function stopAndLeave(guildId: string): boolean {
  const state = guildStates.get(guildId);
  if (!state) return false;
  state.queue = [];
  state.ttsQueue = [];
  state.currentSong = null;
  state.loopMode = "off";
  state.skipRequested = false;
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
    loopMode: state.loopMode,
  };
}