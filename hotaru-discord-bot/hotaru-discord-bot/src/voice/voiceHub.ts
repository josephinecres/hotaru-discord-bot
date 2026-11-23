import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  entersState,
  generateDependencyReport,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { VoiceBasedChannel } from "discord.js";
import sodium from "libsodium-wrappers";
import play from "play-dl";
import { Readable } from "stream";
import YouTubeModule from "youtube-sr";
import YTDlpWrapModule from "yt-dlp-wrap";
import { getAi } from "../persona.js";

const YouTube =
  (YouTubeModule as unknown as { default?: typeof YouTubeModule }).default || YouTubeModule;
const YTDlpWrap =
  (YTDlpWrapModule as unknown as { default?: typeof YTDlpWrapModule }).default || YTDlpWrapModule;

export type LoopMode = "off" | "track" | "queue";

export interface SongItem {
  title: string;
  url: string;
  requestedBy: string;
  durationRaw: string;
}

export interface SendableChannelLike {
  send: (content: string) => Promise<unknown>;
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
  textChannel?: SendableChannelLike;
}

export const voiceDiagnostics = {
  ytDlpPath: null as string | null,
  lastVoiceError: null as string | null,
  lastPlayedTitle: null as string | null,
  connectionState: "idle" as string,
  stateHistory: [] as string[],
  dependencyReport: (() => {
    try {
      return generateDependencyReport();
    } catch {
      return "unavailable";
    }
  })(),
};

const guildStates = new Map<string, GuildAudioState>();

let ytDlpInstance: InstanceType<typeof YTDlpWrap> | null = null;
let ytDlpInitPromise: Promise<InstanceType<typeof YTDlpWrap> | null> | null = null;

function findSystemYtDlp(): string | null {
  const candidates = ["/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp", path.join("/tmp", "yt-dlp")];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const resolved = execSync("which yt-dlp", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (resolved) return resolved;
  } catch {
    // Not found in PATH
  }
  return null;
}

async function getYtDlp(): Promise<InstanceType<typeof YTDlpWrap> | null> {
  if (ytDlpInstance) return ytDlpInstance;
  if (ytDlpInitPromise) return ytDlpInitPromise;

  ytDlpInitPromise = (async () => {
    try {
      let binaryPath = findSystemYtDlp();
      if (!binaryPath) {
        const tmpBin = path.join("/tmp", "yt-dlp");
        console.log("Downloading yt-dlp binary for YouTube audio streaming...");
        await YTDlpWrap.downloadFromGithub(tmpBin);
        fs.chmodSync(tmpBin, 0o755);
        binaryPath = tmpBin;
      }
      voiceDiagnostics.ytDlpPath = binaryPath;
      ytDlpInstance = new YTDlpWrap(binaryPath);
      return ytDlpInstance;
    } catch (err) {
      console.warn("yt-dlp initialization failed, will fallback to play-dl:", err);
      return null;
    }
  })();

  return ytDlpInitPromise;
}

async function ensureConnection(
  voiceChannel: VoiceBasedChannel,
  textChannel?: SendableChannelLike
): Promise<GuildAudioState> {
  await sodium.ready;

  const existing = guildStates.get(voiceChannel.guild.id);
  if (existing && existing.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    if (textChannel) existing.textChannel = textChannel;
    if (
      existing.connection.joinConfig.channelId === voiceChannel.id &&
      existing.connection.state.status === VoiceConnectionStatus.Ready
    ) {
      return existing;
    }
    try {
      if (existing.connection.joinConfig.channelId !== voiceChannel.id) {
        existing.connection.rejoin({
          channelId: voiceChannel.id,
          selfDeaf: false,
          selfMute: false,
        });
      }
      await entersState(existing.connection, VoiceConnectionStatus.Ready, 20_000);
      return existing;
    } catch {
      try {
        existing.connection.destroy();
      } catch {
        // Ignore cleanup error
      }
      guildStates.delete(voiceChannel.guild.id);
    }
  }

  // สำคัญ: ตั้ง selfDeaf: false เพื่อไม่ให้บอทขึ้นไอคอนปิดหูฟังตัวเองในห้องเสียง
  let connection: VoiceConnection | null = null;
  let lastConnectErr: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const candidate = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    voiceDiagnostics.stateHistory = [];
    candidate.on("stateChange", (oldState, newState) => {
      voiceDiagnostics.connectionState = newState.status;
      const entry = `${oldState.status}->${newState.status}`;
      voiceDiagnostics.stateHistory = [...voiceDiagnostics.stateHistory.slice(-6), entry];
    });
    candidate.on("error", (err) => {
      voiceDiagnostics.lastVoiceError = err.message;
      console.error("VoiceConnection error:", err);
    });

    try {
      await entersState(candidate, VoiceConnectionStatus.Ready, 20_000);
      connection = candidate;
      voiceDiagnostics.lastVoiceError = null;
      break;
    } catch (err) {
      lastConnectErr = err;
      const stuckAt = candidate.state.status;
      const msg = err instanceof Error ? err.message : String(err);
      voiceDiagnostics.lastVoiceError = `Attempt ${attempt} failed at state [${stuckAt}]: ${msg}`;
      console.warn(voiceDiagnostics.lastVoiceError);
      try {
        candidate.destroy();
      } catch {
        // Ignore destroy error
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  if (!connection) {
    const errMsg = lastConnectErr instanceof Error ? lastConnectErr.message : String(lastConnectErr);
    throw new Error(
      `เชื่อมต่อห้องเสียงไม่สำเร็จ (${voiceDiagnostics.connectionState}): ${errMsg} — หากเปิดบน Render แล้วค้างที่ connecting/signalling อาจเกิดจาก Render บล็อกพอร์ต UDP ของ Discord Voice ค่ะ`
    );
  }

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
    textChannel,
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

  player.on("error", (err) => {
    console.error("AudioPlayer error:", err);
    voiceDiagnostics.lastVoiceError = err.message;
    state.isSpeakingTts = false;
    state.currentSong = null;
    void state.textChannel
      ?.send(`เกิดปัญหาขณะส่งเสียงเพลง: ${err.message.slice(0, 180)}`)
      .catch(() => {});
    void processNextAudio(voiceChannel.guild.id);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
      guildStates.delete(voiceChannel.guild.id);
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
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

function wrapPcmWithWavHeader(pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  // ถ้ามี RIFF header อยู่แล้ว ไม่ต้องครอบซ้ำ
  if (pcmBuffer.length >= 4 && pcmBuffer.subarray(0, 4).toString("ascii") === "RIFF") {
    return pcmBuffer;
  }
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
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

      const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inline?.data) {
        const rawBuf = Buffer.from(inline.data, "base64");
        const mime = (inline.mimeType || "").toLowerCase();
        if (mime.includes("pcm") || mime.includes("l16") || !mime.includes("wav")) {
          return wrapPcmWithWavHeader(rawBuf, 24000, 1, 16);
        }
        return rawBuf;
      }
    } catch (err) {
      console.warn("Gemini TTS failed, switching to Free Thai/EN TTS:", err);
    }
  }

  return synthesizeFreeTtsBuffer(text);
}

async function createMusicResource(songUrl: string): Promise<AudioResource> {
  const ytDlp = await getYtDlp();
  if (ytDlp) {
    try {
      const stream = ytDlp.execStream([
        songUrl,
        "-f",
        "bestaudio[ext=webm]/bestaudio/best",
        "--no-playlist",
        "--no-warnings",
        "-o",
        "-",
      ]);
      stream.on("error", (err) => {
        voiceDiagnostics.lastVoiceError = err.message;
        console.error("yt-dlp stream error:", err.message);
      });
      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });
      resource.volume?.setVolume(0.85);
      return resource;
    } catch (err) {
      console.warn("yt-dlp failed, trying play-dl fallback:", err);
    }
  }

  const streamInfo = await play.stream(songUrl);
  const resource = createAudioResource(streamInfo.stream, {
    inputType: streamInfo.type,
    inlineVolume: true,
  });
  resource.volume?.setVolume(0.85);
  return resource;
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
          inlineVolume: true,
        });
        resource.volume?.setVolume(1.0);
        state.player.play(resource);
        voiceDiagnostics.lastVoiceError = null;
        return;
      }
      state.isSpeakingTts = false;
    }

    // เล่นเพลงถัดไปในคิว
    if (!state.currentSong && state.queue.length > 0) {
      const nextSong = state.queue.shift()!;
      state.currentSong = nextSong;
      const resource = await createMusicResource(nextSong.url);
      state.player.play(resource);
      voiceDiagnostics.lastPlayedTitle = nextSong.title;
      voiceDiagnostics.lastVoiceError = null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Voice playback error:", err);
    voiceDiagnostics.lastVoiceError = msg;
    state.isSpeakingTts = false;
    state.currentSong = null;
    void state.textChannel
      ?.send(`ขออภัยนะคะ โฮตารุไม่สามารถเปิดเสียงเพลงนี้ได้: ${msg.slice(0, 180)}`)
      .catch(() => {});
  }
}

async function resolveSpotifyQueries(spotifyUrl: string): Promise<string[]> {
  const cleanUrl = spotifyUrl.split("?")[0];
  const match = cleanUrl.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album)\/([a-zA-Z0-9]+)/i);
  if (!match) return [];

  const kind = match[1].toLowerCase();
  const id = match[2];

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

async function searchOneYouTube(query: string, requestedBy: string): Promise<SongItem | null> {
  try {
    const video = await YouTube.searchOne(query);
    if (video?.url) {
      return {
        title: video.title || query,
        url: video.url,
        requestedBy,
        durationRaw: video.durationFormatted || "Live/Audio",
      };
    }
  } catch (err) {
    console.warn("youtube-sr searchOne failed, trying play-dl:", err);
  }

  const results = await play.search(query, { limit: 1 });
  if (results.length > 0) {
    const track = results[0];
    return {
      title: track.title || query,
      url: track.url,
      requestedBy,
      durationRaw: track.durationRaw,
    };
  }
  return null;
}

export async function enqueueMusic(
  voiceChannel: VoiceBasedChannel,
  rawQuery: string,
  requestedBy: string,
  textChannel?: SendableChannelLike
): Promise<{ songs: SongItem[]; startPosition: number }> {
  const query = rawQuery.replace(/^<|>$/g, "").trim();
  const state = await ensureConnection(voiceChannel, textChannel);
  const startPosition = state.queue.length + 1;
  const addedSongs: SongItem[] = [];

  // 1. รองรับลิงก์ Spotify (Track / Playlist / Album)
  if (/open\.spotify\.com/i.test(query)) {
    const queries = await resolveSpotifyQueries(query);
    if (queries.length === 0) {
      throw new Error("โฮตารุไม่สามารถดึงข้อมูลเพลงจากลิงก์ Spotify นี้ได้ค่ะ ลองส่งเป็นลิงก์เพลงเดี่ยวหรือชื่อเพลงดูนะคะ");
    }
    for (const q of queries) {
      const found = await searchOneYouTube(q, requestedBy);
      if (found) addedSongs.push(found);
    }
    if (addedSongs.length === 0) {
      throw new Error("ไม่พบไฟล์เสียงสำหรับลิงก์ Spotify นี้ค่ะ");
    }
  } else if (/list=/.test(query) && /youtube\.com|youtu\.be/i.test(query)) {
    // 2. รองรับลิงก์ YouTube Playlist
    try {
      const playlist = await YouTube.getPlaylist(query, { fetchAll: false });
      for (const v of playlist.videos.slice(0, 15)) {
        if (v.url) {
          addedSongs.push({
            title: v.title || "YouTube Track",
            url: v.url,
            requestedBy,
            durationRaw: v.durationFormatted || "-",
          });
        }
      }
    } catch {
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
    }
  } else if (/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(query)) {
    // 3. รองรับลิงก์ YouTube เดี่ยว
    let title = "YouTube Audio";
    let durationRaw = "-";
    try {
      const info = await YouTube.getVideo(query);
      if (info) {
        title = info.title || title;
        durationRaw = info.durationFormatted || durationRaw;
      }
    } catch {
      try {
        const info = await play.video_basic_info(query);
        title = info.video_details.title || title;
        durationRaw = info.video_details.durationRaw || durationRaw;
      } catch {
        // Fallback: ให้ yt-dlp ดึงสตรีมจาก URL โดยตรง
      }
    }
    addedSongs.push({
      title,
      url: query,
      requestedBy,
      durationRaw,
    });
  } else {
    // 4. ค้นหาจากชื่อเพลง
    const found = await searchOneYouTube(query, requestedBy);
    if (!found) {
      throw new Error("โฮตารุหาเพลงที่ต้องการไม่พบค่ะ ลองเปลี่ยนคำค้นหาดูนะคะ");
    }
    addedSongs.push(found);
  }

  state.queue.push(...addedSongs);
  if (state.player.state.status === AudioPlayerStatus.Idle && !state.isSpeakingTts) {
    await processNextAudio(voiceChannel.guild.id);
  }

  return { songs: addedSongs, startPosition };
}

export async function speakTtsInVoice(
  voiceChannel: VoiceBasedChannel,
  text: string,
  textChannel?: SendableChannelLike
): Promise<void> {
  const state = await ensureConnection(voiceChannel, textChannel);
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

export function destroyAllVoiceConnections() {
  for (const [guildId, state] of guildStates.entries()) {
    try {
      state.player.stop();
      state.connection.destroy();
    } catch {
      // Ignore cleanup error
    }
    guildStates.delete(guildId);
  }
}