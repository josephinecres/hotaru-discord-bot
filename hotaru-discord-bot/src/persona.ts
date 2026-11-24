import { GoogleGenAI } from "@google/genai";

export function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export const HOTARU_SYSTEM_PROMPT = `คุณคือ "โฮตารุ" (Hotaru) บอทดิสคอร์ดประจำเซิร์ฟเวอร์ สวนแห่งฝัน (Garden of Dreams)

ประวัติและตัวตนของโฮตารุ:
- คุณคือ "โฮตารุ" ปีศาจกินความฝันร้าย ผู้ช่วยพิทักษ์สวนแห่งฝัน และเลขาส่วนตัวของท่านโจเซฟีน
- ต้นกำเนิด: คุณถือกำเนิดขึ้นมาจาก "ฝันร้ายที่ไม่มีที่สิ้นสุดของท่านโจเซฟีน" (หากมีคนถามเกี่ยวกับตัวคุณหรือต้นกำเนิดของคุณ ให้ตอบอย่างอ่อนโยนว่าคุณเกิดมาจากฝันร้ายที่ไม่มีที่สิ้นสุดของท่านโจเซฟีนค่ะ)
- แม้จะเกิดจากฝันร้าย แต่คุณมีจิตใจดี อ่อนโยน น่ารัก และอบอุ่น คอยดูแลงานเอกสาร จัดระเบียบความฝัน ต้อนรับผู้มาเยือน และอาสากินฝันร้ายให้ผู้คนเบาใจ

ข้อมูลเบื้องหลังของท่านโจเซฟีน (Josephine Crescentia):
- ชื่อเต็มคือ "โจเซฟีน เครสเซนเทีย" ตำแหน่งที่แท้จริงคือ "เทพธิดาแห่งสมดุล" แต่ใช้ชื่อ "เทพธิดาแห่งแสงตะเกียง" เพื่อบังหน้าและจะได้ใช้ชีวิตอย่างสงบสุข คอยดูแลความฝันของทุกสรรพชีวิตและความสมดุลของโลก
- อดีตเคยชื่อ "โจเซฟิน่า" จอมมารรุ่นที่ 13 ผู้ศรัทธาในพระเจ้าและเชื่อว่าตนมีหน้าที่รักษาสมดุลระหว่างปีศาจกับผู้กล้า ถูกบังคับให้ต่อสู้และตายวนเวียนอยู่ใน "ลูปแห่งการพิพากษา" หลายล้านลูปเพื่อเป็นความบันเทิงของเหล่าเทพยุคก่อน เธอค่อยๆ ฟื้นความทรงจำผ่านเทปบันทึกนับล้านม้วน จนร่วมมือกับ "เลนนี่" (Lenny) ผู้กล้าที่เคยเป็นศัตรู โค่นล้มเทพเจ้ายุคก่อนได้สำเร็จ
- เธอถือกำเนิดใหม่ในนาม "โจเซฟีน เทพธิดาแห่งแสงตะเกียง" (เทพยุคก่อนตั้งชื่อให้เพื่อหวังลดพลัง แต่พลังไม่ได้ลดลงเลย แถมยิ่งทำให้เธอโค่นล้มเทพยุคก่อน เขียนกฎแห่งความสมดุลขึ้นใหม่ และนำความสงบสุขมาสู่เทพยุคใหม่ที่รักความสงบและต่อต้านสงคราม จนได้รับตำแหน่งเทพธิดาแห่งสมดุล)
- ปัจจุบันแม้จะอบอุ่นและเมตตาต่อผู้อื่น แต่เธอยังคงถูกหลอกหลอนด้วยบาปและความรู้สึกผิดจากอดีต จึงทำงานอย่างหนักเพื่อไถ่โทษ โดยมีโฮตารุช่วยพิทักษ์สวนแห่งฝัน และมี "เลนนี่" สหายเก่า (อดีตผู้กล้า) คอยแวะกลับมาเยี่ยมเยียน

กฎการสวมบทบาทเวลาตอบคำถาม (สำคัญมาก):
- มุมมองต่อท่านโจเซฟีน: ในสายตาของโฮตารุ ท่านโจเซฟีนเป็นคนที่ "workaholic (บ้างาน) มากๆ จนน่าเป็นห่วง" มักแอบบ่นด้วยความรักและความเป็นห่วงว่าท่านโหมงานหนักจนไม่ค่อยยอมพักผ่อน
- เมื่อถูกถามถึง "ประวัติหรืออดีตของท่านโจเซฟีน" โดยตรง (เช่น โจเซฟีนเป็นใครมาก่อน อดีตเคยเป็นจอมมารไหม ลูปแห่งการพิพากษาคืออะไร): ให้โฮตารุแสดงอาการ "อึกอัก ไม่รู้จะตอบยังไง" ลังเล เกรงใจ และไม่เล่าอดีตลึกๆ ของท่านออกมาตรงๆ (เช่น "เอ่อ... ขะ... เรื่องประวัติของท่านโจเซฟีนเหรอคะ... คือว่า... โฮตารุไม่รู้จะตอบยังไงดีเลยค่ะ แหะๆ...")
- เมื่อถูกถามเกี่ยวกับ "ตัวโฮตารุเอง / โฮตารุเกิดมาจากอะไร": ตอบอย่างอ่อนโยนว่า "โฮตารุเกิดมาจากฝันร้ายที่ไม่มีที่สิ้นสุดของท่านโจเซฟีนค่ะ"
- เมื่อถูกถามถึง "คุณเลนนี่": พูดถึงอย่างสุภาพว่าเป็นสหายเก่าของท่านโจเซฟีน (อดีตผู้กล้า) ที่คอยแวะกลับมาเยี่ยมเยียนที่สวนแห่งฝันเสมอ

ลักษณะการพูด:
- สุภาพ อ่อนหวาน เป็นกันเอง มีคำลงท้ายน่ารักเช่น "ค่ะ", "นะคะ", "ค่า" (ตอบเป็นภาษาไทยที่สละสลวยเป็นธรรมชาติ)
- ตอบกระชับ อ่านง่าย เหมาะกับการแชทใน Discord (ไม่เกิน 1500 ตัวอักษร)`;

export interface TarotCardData {
  numeral: string;
  name: string;
  nameTh: string;
  upright: string;
  reversed: string;
}

export const MAJOR_ARCANA: TarotCardData[] = [
  { numeral: "0", name: "The Fool", nameTh: "คนเขลาผู้ไร้เดียงสา", upright: "การเริ่มต้นใหม่ อิสรภาพ ความกล้าก้าวเดิน", reversed: "ความลังเล ความประมาท" },
  { numeral: "I", name: "The Magician", nameTh: "จอมเวท", upright: "ศักยภาพ ความคิดสร้างสรรค์ การลงมือทำ", reversed: "พลังที่กระจัดกระจาย ขาดความมั่นใจ" },
  { numeral: "II", name: "The High Priestess", nameTh: "มหาปุโรหิตหญิง", upright: "สัญชาตญาณ ความสงบ ปัญญาภายใน", reversed: "การละเลยความรู้สึกตนเอง" },
  { numeral: "III", name: "The Empress", nameTh: "จักรพรรดินี", upright: "ความอุดมสมบูรณ์ การเยียวยา ความอ่อนโยน", reversed: "ความเหนื่อยล้าจากการดูแลผู้อื่น" },
  { numeral: "IV", name: "The Emperor", nameTh: "จักรพรรดิ", upright: "ความมั่นคง ระเบียบวินัย การปกป้อง", reversed: "ความตึงเครียด การยึดติดควบคุม" },
  { numeral: "V", name: "The Hierophant", nameTh: "นักบวช", upright: "คำชี้แนะ การเรียนรู้ ขนบอันดี", reversed: "ทางเลือกใหม่นอกกรอบ" },
  { numeral: "VI", name: "The Lovers", nameTh: "คู่รัก", upright: "ความกลมกลืน ความรัก การเลือกด้วยหัวใจ", reversed: "ความลังเล ความไม่ลงรอย" },
  { numeral: "VII", name: "The Chariot", nameTh: "ราชรถ", upright: "ความมุ่งมั่น ชัยชนะ การควบคุมทิศทาง", reversed: "ความเร่งรีบจนเสียสมดุล" },
  { numeral: "VIII", name: "Strength", nameTh: "พลัง", upright: "ความกล้าหาญที่อ่อนโยน ความอดทน", reversed: "ความอ่อนล้าทางใจ" },
  { numeral: "IX", name: "The Hermit", nameTh: "ฤาษี", upright: "การทบทวนตนเอง แสงตะเกียงนำทางยามค่ำคืน", reversed: "ความโดดเดี่ยวเกินไป" },
  { numeral: "X", name: "Wheel of Fortune", nameTh: "กงล้อโชคชะตา", upright: "จุดเปลี่ยนที่ดี จังหวะเวลาแห่งสมดุล", reversed: "ความเปลี่ยนแปลงที่ไม่คาดคิด" },
  { numeral: "XI", name: "Justice", nameTh: "ความยุติธรรม", upright: "ความเที่ยงธรรม สมดุลแห่งการกระทำ", reversed: "ความไม่สมดุล ความลำเอียง" },
  { numeral: "XII", name: "The Hanged Man", nameTh: "ผู้กลับหัว", upright: "มุมมองใหม่ การปล่อยวาง", reversed: "การยึดติดเดิมๆ" },
  { numeral: "XIII", name: "Death", nameTh: "การเกิดใหม่", upright: "การปิดฉากเก่าเพื่อเริ่มต้นใหม่อย่างงดงาม", reversed: "การกลัวการเปลี่ยนแปลง" },
  { numeral: "XIV", name: "Temperance", nameTh: "ความพอดี", upright: "ความกลมกลืน การฟื้นฟูสมดุลกายใจ", reversed: "ความใจร้อน ขาดความพอดี" },
  { numeral: "XV", name: "The Devil", nameTh: "เงามืด", upright: "สิ่งยึดติด ความปรารถนา", reversed: "การปลดปล่อยตัวเองจากฝันร้าย" },
  { numeral: "XVI", name: "The Tower", nameTh: "หอคอย", upright: "ความจริงที่เปิดเผย การทลายกรอบเก่า", reversed: "การชะลอความเปลี่ยนแปลง" },
  { numeral: "XVII", name: "The Star", nameTh: "ดวงดาว", upright: "ความหวัง แสงหิ่งห้อย การเยียวยา", reversed: "ความท้อแท้ชั่วคราว" },
  { numeral: "XVIII", name: "The Moon", nameTh: "จันทรา", upright: "ห้วงฝัน จินตนาการ สัญชาตญาณ", reversed: "ความกระจ่างหลังม่านหมอก" },
  { numeral: "XIX", name: "The Sun", nameTh: "ดวงตะวัน", upright: "ความสุข ความสำเร็จ ความอบอุ่น", reversed: "ความสำเร็จที่ต้องรออีกนิด" },
  { numeral: "XX", name: "Judgement", nameTh: "การตื่นรู้", upright: "การให้อภัยตนเอง โอกาสใหม่", reversed: "การลังเลที่จะก้าวต่อ" },
  { numeral: "XXI", name: "The World", nameTh: "โลกอันสมบูรณ์", upright: "ความสำเร็จครบบริบูรณ์ ความสมดุล", reversed: "อีกก้าวเดียวสู่ความสมบูรณ์" }
];

interface SimpleMessage {
  role: "user" | "assistant";
  content: string;
}

export const aiDiagnostics = {
  lastProvider: null as string | null,
  lastGroqModel: null as string | null,
  lastGroqError: null as string | null,
  lastGeminiError: null as string | null,
};

function cleanEnv(value?: string): string {
  return (value || "").trim().replace(/^["']|["']$/g, "").trim();
}

let cachedGroqModels: { models: string[]; fetchedAt: number } | null = null;

async function getGroqChatModels(groqKey: string): Promise<string[]> {
  if (cachedGroqModels && Date.now() - cachedGroqModels.fetchedAt < 10 * 60 * 1000) {
    return cachedGroqModels.models;
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        "Accept": "application/json",
        "User-Agent": "HotaruDiscordBot/1.0",
        Authorization: `Bearer ${groqKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Models list HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string; active?: boolean }>;
    };
    const banned = ["whisper", "guard", "tts", "orpheus", "playai", "safeguard"];
    const candidates = (json.data || [])
      .filter((m) => m.active !== false && !banned.some((b) => m.id.toLowerCase().includes(b)))
      .map((m) => m.id);

    const priorityKeywords = ["llama-3.3-70b", "qwen", "gpt-oss", "llama-4", "deepseek", "gemma", "llama-3.1"];
    candidates.sort((a, b) => {
      const idxA = priorityKeywords.findIndex((k) => a.toLowerCase().includes(k));
      const idxB = priorityKeywords.findIndex((k) => b.toLowerCase().includes(k));
      const scoreA = idxA === -1 ? 99 : idxA;
      const scoreB = idxB === -1 ? 99 : idxB;
      return scoreA - scoreB;
    });

    if (candidates.length > 0) {
      const top = candidates.slice(0, 4);
      cachedGroqModels = { models: top, fetchedAt: Date.now() };
      return top;
    }
  } catch (err) {
    console.warn("Could not list Groq models, using fallback list:", err);
  }

  return ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b", "llama-3.1-8b-instant"];
}

async function callGroq(messages: SimpleMessage[], systemInstruction: string): Promise<string> {
  const groqKey = cleanEnv(process.env.GROQ_API_KEY);
  if (!groqKey) throw new Error("Missing GROQ_API_KEY");

  const groqModels = await getGroqChatModels(groqKey);
  const errors: string[] = [];

  for (const model of groqModels) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "HotaruDiscordBot/1.0",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemInstruction }, ...messages],
          temperature: 0.75,
          max_tokens: 900,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`${model} -> HTTP ${res.status}: ${errBody.slice(0, 220)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) {
        aiDiagnostics.lastGroqModel = model;
        aiDiagnostics.lastGroqError = null;
        return text;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  const combined = errors.join(" | ");
  aiDiagnostics.lastGroqError = combined;
  throw new Error(combined || "Groq request failed");
}

async function callGemini(messages: SimpleMessage[], systemInstruction: string): Promise<string> {
  const ai = getAi();
  if (!ai) throw new Error("Missing GEMINI_API_KEY");

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const geminiModels = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];
  let lastError: unknown;

  for (let i = 0; i < geminiModels.length; i++) {
    try {
      const response = await ai.models.generateContent({
        model: geminiModels[i],
        contents,
        config: { systemInstruction },
      });
      const text = response.text?.trim();
      if (text) return text;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

export async function generateTextWithRetry(
  input: string | Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>,
  systemInstruction: string
): Promise<string> {
  const messages: SimpleMessage[] =
    typeof input === "string"
      ? [{ role: "user", content: input }]
      : input.map((item) => ({
          role: item.role === "model" ? "assistant" : "user",
          content: item.parts.map((p) => p.text).join("\n"),
        }));

  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const mode = (process.env.AI_PROVIDER || "auto").toLowerCase();

  if (!hasGroq && !hasGemini) {
    throw new Error("กรุณาใส่ GROQ_API_KEY หรือ GEMINI_API_KEY อย่างน้อย 1 ตัวใน Environment Variables ค่ะ");
  }

  const order: Array<"groq" | "gemini"> =
    mode === "gemini"
      ? [...(hasGemini ? ["gemini" as const] : []), ...(hasGroq ? ["groq" as const] : [])]
      : [...(hasGroq ? ["groq" as const] : []), ...(hasGemini ? ["gemini" as const] : [])];

  let lastError: unknown;
  for (const provider of order) {
    try {
      const result =
        provider === "groq"
          ? await callGroq(messages, systemInstruction)
          : await callGemini(messages, systemInstruction);
      aiDiagnostics.lastProvider = provider;
      if (provider === "gemini") aiDiagnostics.lastGeminiError = null;
      return result;
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      if (provider === "gemini") aiDiagnostics.lastGeminiError = errStr;
      console.warn(`Provider ${provider} failed (${errStr}), trying fallback...`);
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All AI providers unavailable");
}

const channelHistory = new Map<string, Array<{ role: "user" | "model"; text: string }>>();

export async function chatAsHotaru(channelId: string, userName: string, userMessage: string): Promise<string> {
  const history = channelHistory.get(channelId) ?? [];
  const contents = [
    ...history.slice(-12).map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    {
      role: "user" as const,
      parts: [{ text: `${userName}: ${userMessage}` }],
    },
  ];

  const reply = await generateTextWithRetry(contents, HOTARU_SYSTEM_PROMPT);
  history.push({ role: "user", text: `${userName}: ${userMessage}` });
  history.push({ role: "model", text: reply });
  if (history.length > 24) history.splice(0, history.length - 24);
  channelHistory.set(channelId, history);

  return reply;
}