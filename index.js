require("dotenv").config();
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const cron = require("node-cron");
const { Timestamp } = require("firebase-admin/firestore");
const { GoogleAuth } = require("google-auth-library");
const path = require("path");

// Parse chuỗi JSON từ .env
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Khởi tạo Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Lấy access token từ service account
const getAccessToken = async () => {
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  return accessTokenResponse.token;
};

// Gửi FCM
const sendNotification = async (token, title, body) => {
  try {
    const accessToken = await getAccessToken();

    const message = {
      message: {
        token,
        notification: { title, body },
      },
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      }
    );

    const data = await response.json();
    console.log("✅ Gửi thông báo thành công:", data);
  } catch (error) {
    console.error("❌ Gửi thông báo thất bại:", error.message);
  }
};

// Nhắc nhở không lặp
const checkRemindersNoRepeat = async () => {
  const now = new Date();
  const preMinutes = Number(process.env.NOTIFY_BEFORE_MINUTES || 30);
  const time1 = new Date(now.getTime() + (preMinutes - 1) * 60000);
  const time2 = new Date(now.getTime() + (preMinutes + 1) * 60000);

  try {
    const snapshot = await db.collection("reminders")
      .where("remind_at", ">=", Timestamp.fromDate(time1))
      .where("remind_at", "<=", Timestamp.fromDate(time2))
      .where("is_recurring", "==", false)
      .get();

    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
      const reminder = doc.data();
      const userDoc = await db.collection("users").doc(reminder.user_id).get();
      const token = userDoc.data()?.fcm_token;

      if (token) {
        await sendNotification(
          token,
          reminder.title || "Thông báo",
          reminder.description || "Bạn có nhắc nhở!"
        );
      }
    }
  } catch (err) {
    console.error("❌ Lỗi Firestore:", err.message);
  }
};

// Nhắc nhở lặp lại
const checkRemindersWithRepeat = async () => {
  const now = new Date();
  const preMinutes = Number(process.env.NOTIFY_BEFORE_MINUTES || 30);
  const target = new Date(now.getTime() + preMinutes * 60000);

  const hour = target.getHours();
  const minute = target.getMinutes();
  const day = target.getDay(); // 0-6
  const date = target.getDate(); // 1-31

  try {
    const snapshot = await db.collection("reminders")
      .where("is_recurring", "==", true)
      .get();

    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
      const reminder = doc.data();
      const remindTime = reminder.remind_at?.toDate();
      if (!remindTime) continue;

      const match = (() => {
        const rh = remindTime.getHours();
        const rm = remindTime.getMinutes();
        const rd = remindTime.getDay();
        const rdate = remindTime.getDate();
        switch (reminder.recurrence_pattern) {
          case "Hằng ngày": return rh === hour && rm === minute;
          case "Hằng tuần": return rh === hour && rm === minute && rd === day;
          case "Hằng tháng": return rh === hour && rm === minute && rdate === date;
          default: return false;
        }
      })();

      if (match) {
        const userDoc = await db.collection("users").doc(reminder.user_id).get();
        const token = userDoc.data()?.fcm_token;
        if (token) {
          await sendNotification(
            token,
            reminder.title || "Thông báo",
            reminder.description || "Bạn có nhắc nhở lặp lại!"
          );
        }
      }
    }
  } catch (err) {
    console.error("❌ Lỗi nhắc nhở lặp:", err.message);
  }
};

// Cron chạy mỗi phút
cron.schedule("* * * * *", () => {
  console.log("🕐 Đang kiểm tra nhắc nhở...");
  checkRemindersNoRepeat();
  checkRemindersWithRepeat();
});

// Tùy chọn: server express (nếu cần giữ app "alive" trên hosting)
const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Reminder Server đang chạy..."));
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Reminder server đã sẵn sàng!");
});
