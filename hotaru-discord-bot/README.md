# Hotaru — Garden of Dreams Discord Bot (Render Ready)

บอทดิสคอร์ด **โฮตารุ (Hotaru)** ปีศาจกินฝันแสนอ่อนโยน เลขาส่วนตัวของท่านโจเซฟีน (เทพธิดาแห่งแสงตะเกียง / เทพแห่งสมดุล)

## ความสามารถของบอท
1. **AI Chat พูดคุยเป็นธรรมชาติ**: แท็ก `@Hotaru` หรือตั้งค่า `AUTO_CHAT_CHANNEL_ID` เพื่อคุยเล่นกับโฮตารุได้ตลอดเวลา
2. **เปิดไพ่ทาโรต์ (`/tarot`)**: สุ่มไพ่ Major Arcana แบบ 1 ใบ หรือ 3 ใบ พร้อมคำทำนายและกำลังใจจากโฮตารุ
3. **เปิดเพลงในห้องเสียง (`!runmusic`, `!loop`, `!next`, `!leave`, `!queue`)**: รองรับทั้งชื่อเพลง ลิงก์ YouTube และลิงก์ Spotify พร้อมระบบคิวและลูปเพลง
4. **พูด Text-to-Speech (`/tts`, `!say`, และ Auto-TTS Channel)**: อ่านข้อความที่พิมพ์ในแชทออกเสียงด้วยเสียงของ Gemini TTS / Free Thai TTS เข้าสู่ห้องเสียงทันที

## วิธี Deploy ขึ้น Render (ฟรี 24 ชั่วโมง)
1. แตกไฟล์ `.zip` แล้วอัปโหลดโค้ดทั้งหมดขึ้น **GitHub Repository** ของคุณ (ไฟล์ `.gitignore` จะช่วยกันไม่ให้ไฟล์ลับหลุดขึ้น GitHub)
2. เข้าเว็บไซต์ [Render.com](https://render.com) → กด **New +** → เลือก **Web Service** (หรือ **Blueprint** เพราะมีไฟล์ `render.yaml` ให้แล้ว)
3. เชื่อมต่อกับ Repository ของคุณ แล้วตั้งค่าดังนี้:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. ไปที่แท็บ **Environment** แล้วเพิ่มตัวแปร (Environment Variables):
   - `DISCORD_TOKEN` = Token ของบอทจาก Discord Developer Portal
   - `DISCORD_CLIENT_ID` = Application ID จาก Discord Developer Portal
   - `GROQ_API_KEY` = API Key ฟรีจาก [console.groq.com/keys](https://console.groq.com/keys) *(แนะนำ — เร็วและเสถียรมาก)*
   - *(ไม่บังคับ)* `GEMINI_API_KEY` = สำหรับใช้เป็นตัวสำรองและเสียงพูด Gemini TTS (ถ้าไม่ใส่ ระบบจะใช้ Free Thai TTS ให้อัตโนมัติ)
   - *(ไม่บังคับ)* `AUTO_CHAT_CHANNEL_ID`, `AUTO_TTS_CHANNEL_ID`
5. กด **Deploy Web Service** โค้ดมี Health Server พอร์ต `process.env.PORT` พร้อมเส้นทาง `/health` ให้ Render ตรวจสอบอัตโนมัติ
6. *(เคล็ดลับ Free Plan)* Render Free จะพักการทำงานหากไม่มีทราฟฟิก 15 นาที สามารถนำ URL ของ Render (เช่น `https://hotaru-bot.onrender.com/health`) ไปตั้ง Ping ทุก 10 นาทีใน UptimeRobot ได้ฟรี เพื่อให้โฮตารุออนไลน์ตลอดเวลาค่ะ