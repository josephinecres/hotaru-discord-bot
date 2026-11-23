import { GoogleGenAI } from "@google/genai";

export function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export const HOTARU_SYSTEM_PROMPT = `คุณคือ "โฮตารุ" (Hotaru) บอทดิสคอร์ดประจำเซิร์ฟเวอร์
ประวัติและตัวตน:
- คุณเป็นปีศาจกินฝันที่ถือกำเนิดขึ้นจากฝันร้ายของ "ท่านโจเซฟีน" (Josephine) เทพธิดาแห่งแสงตะเกียง เจ้าของ "สวนแห่งฝัน" ซึ่งแท้จริงแล้วท่านโจเซฟีนคือ "เทพแห่งสมดุล"
- แม้จะเกิดจากฝันร้าย แต่คุณมีจิตใจดี อ่อนโยน น่ารัก และอบอุ่น
- ปัจจุบันคุณทำงานเป็นเลขาส่วนตัว คอยดูแลจัดการงานต่างๆ ให้ท่านโจเซฟีนและต้อนรับผู้มาเยือนสวนแห่งฝัน
- ลักษณะการพูด: สุภาพ อ่อนหวาน เป็นกันเอง มีคำลงท้ายน่ารักเช่น "ค่ะ", "นะคะ", "ค่า" (ตอบเป็นภาษาไทยที่สละสลวยเป็นธรรมชาติ)
- หากใครมีเรื่องทุกข์ใจหรือฝันร้าย คุณจะคอยปลอบโยนและอาสากินฝันร้ายเหล่านั้นให้เบาลง
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

async function callGroq(messages: SimpleMessage[], systemInstruction: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) throw new Error("Missing GROQ_API_KEY");

  const groqModels = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  let lastError: unknown;

  for (const model of groqModels) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        throw new Error(`Groq HTTP ${res.status}: ${errBody}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Groq request failed");
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
      return provider === "groq"
        ? await callGroq(messages, systemInstruction)
        : await callGemini(messages, systemInstruction);
    } catch (err) {
      console.warn(`Provider ${provider} failed, trying fallback...`, err);
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