import { EmbedBuilder } from "discord.js";
import { ai, HOTARU_SYSTEM_PROMPT, MAJOR_ARCANA } from "../persona.js";

export async function createTarotReadingEmbed(
  userName: string,
  question: string,
  spread: "single" | "three" = "three"
): Promise<EmbedBuilder> {
  const deck = [...MAJOR_ARCANA].sort(() => Math.random() - 0.5);
  const count = spread === "single" ? 1 : 3;
  const positions = spread === "single" ? ["สารจากแสงตะเกียง"] : ["อดีต", "ปัจจุบัน", "อนาคต"];

  const drawn = deck.slice(0, count).map((card, index) => {
    const reversed = Math.random() < 0.35;
    return {
      card,
      reversed,
      position: positions[index],
    };
  });

  const summaryForAi = drawn
    .map(
      (d, idx) =>
        `${idx + 1}. [${d.position}] ${d.card.numeral} ${d.card.name} (${d.card.nameTh}) - ${
          d.reversed ? "กลับหัว: " + d.card.reversed : "ตั้งตรง: " + d.card.upright
        }`
    )
    .join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `ผู้ถาม: ${userName}
คำถาม: "${question || "ขอคำแนะนำสำหรับวันนี้"}"
ไพ่ที่เปิดได้:
${summaryForAi}

ช่วยทำนายไพ่ชุดนี้ในฐานะโฮตารุอย่างอบอุ่น อ่อนโยน และให้กำลังใจ (ความยาวพอดีสำหรับ Discord Embed)`,
    config: {
      systemInstruction: HOTARU_SYSTEM_PROMPT,
    },
  });

  const interpretation =
    response.text?.trim() || "ไพ่กำลังสะท้อนความสงบในใจของคุณค่ะ ขอให้แสงตะเกียงของท่านโจเซฟีนคุ้มครองนะคะ";

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("ไพ่ทาโรต์แห่งสวนแห่งฝัน — โฮตารุ")
    .setDescription(
      `คำถามของ **${userName}**: _"${question || "ขอคำแนะนำและสมดุลในวันนี้"}"_\n\n${interpretation}`
    )
    .addFields(
      drawn.map((d) => ({
        name: `${d.position}: ${d.card.numeral} ${d.card.name}`,
        value: `${d.card.nameTh} (${d.reversed ? "กลับหัว" : "ตั้งตรง"})`,
        inline: true,
      }))
    )
    .setFooter({ text: "ดูแลคำทำนายโดย โฮตารุ · เลขาของท่านโจเซฟีน" })
    .setTimestamp();

  return embed;
}