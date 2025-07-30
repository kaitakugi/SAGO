const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const axios = require("axios");
require('dotenv').config();

// Khởi tạo Firebase Admin SDK
// 🔐 Parse chuỗi JSON từ biến môi trường
const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

const otps = new Map(); // Dùng tạm Map, có thể dùng Redis hoặc DB

async function sentOtpEmail(email, otp) {
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;
    const userId = process.env.EMAILJS_USER_ID;
    const accessToken = process.env.EMAILJS_ACCESS_TOKEN;

    const payload = {
        service_id: serviceId,
        template_id: templateId,
        user_id: userId,
        accessToken: accessToken,
        template_params: {
            to_email: email,
            otp: otp,
            name: 'SAGO',
        },
    }

    await axios.post("https://api.emailjs.com/api/v1.0/email/send", payload);
}

// Gửi OTP (tạm bằng console log / email thật)
app.post("/request-reset", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({success: false,message: "Thiếu email"});

  try {
    await admin.auth().getUserByEmail(email);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps.set(email, otp);

    setTimeout(() => otps.delete(email), 5 * 60 * 1000); // OTP hết hạn sau 5 phút

    await sentOtpEmail(email, otp);

    // Gửi email bằng EmailJS / nodemailer (bạn cấu hình)
    console.log(`OTP cho ${email}: ${otp}`);
    res.json({ success: true, message: "OTP đã gửi" });
  } catch (err) {
    console.error(err);
    res.status(404).json({ success: false, message: "Tài khoản không tồn tại" });
  }
});

// Xác minh OTP và đổi mật khẩu
app.post("/verify-otp", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword)
    return res.status(400).json({ success: false, message: "Thiếu thông tin"});

  const savedOtp = otps.get(email);
  if (savedOtp !== otp) {
    return res.status(400).json({ success: false, message: "OTP sai hoặc hết hạn" });
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password: newPassword });
    otps.delete(email);
    res.json({ success: true, message: "Đổi mật khẩu thành công" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi đổi mật khẩu" });
  }
});

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
