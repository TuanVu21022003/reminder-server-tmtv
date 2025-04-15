require("dotenv").config();
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const cron = require("node-cron");
const { Timestamp } = require("firebase-admin/firestore");
const { GoogleAuth } = require("google-auth-library");

// Khởi tạo Firebase Admin SDK
const serviceAccount = require("./serviceAccountKey.json");

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

/**
 * Gửi thông báo FCM (sử dụng FCM HTTP v1)
 */
const sendNotification = async (token, title, body) => {
  try {
    const accessToken = await getAccessToken();

    const message = {
      message: {
        token: token,
        notification: {
          title: title,
          body: body,
        },
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
    console.error("❌ Lỗi gửi thông báo:", error);
  }
};

/**
 * Kiểm tra các nhắc nhở gần đến hạn
 */
const checkRemindersNoRepeat = async () => {
  const now = new Date();
  const timeNotifyPre = 30
  const time1 = new Date(now.getTime() + (timeNotifyPre - 1) * 60 * 1000);
  const time2 = new Date(now.getTime() + (timeNotifyPre + 1) * 60 * 1000);

  console.log(time1)
  console.log(time2)

  try {
    const snapshot = await db.collection("reminders")
      .where("remind_at", ">=", Timestamp.fromDate(time1))
      .where("remind_at", "<=", Timestamp.fromDate(time2))
      .where("is_recurring", "==", false)
      .get();

    if (snapshot.empty) {
      console.log(`🟡 Không có nhắc nhở nào trong ${timeNotifyPre} phút tới.`);
      return;
    }

    snapshot.forEach(async (doc) => {
      const reminder = doc.data();
      const userId = reminder.user_id;
      const title = reminder.title || "Thông báo";
      const body = reminder.description || "Bạn có nhắc nhở!";

      const userDoc = await db.collection("users").doc(userId).get();
      const token = userDoc.data()?.fcm_token;

      console.log(reminder);

      if (token && !reminder.is_recurring) {
        await sendNotification(token, title, body);
      } else {
        console.log(`⚠️ Không tìm thấy FCM token cho user_id: ${userId}`);
      }
    });
  } catch (error) {
    console.error("❌ Lỗi khi truy vấn Firestore:", error);
  }
};

const checkRemindersWithRepeat = async () => {
  const now = new Date();
  const timeNotifyPre = 30; // phút trước khi đến thời gian nhắc

  // Thời điểm sẽ chạy nhắc (thời điểm thực tế user set)
  const notifyTarget = new Date(now.getTime() + timeNotifyPre * 60 * 1000);
  const targetHour = notifyTarget.getHours();
  const targetMinute = notifyTarget.getMinutes();
  const targetDay = notifyTarget.getDay();    // 0: Chủ nhật, ..., 6: Thứ 7
  const targetDate = notifyTarget.getDate();  // Ngày trong tháng

  try {
    const snapshot = await db.collection("reminders")
      .where("is_recurring", "==", true)
      .get();

    if (snapshot.empty) {
      console.log("🟡 Không có nhắc nhở lặp lại.");
      return;
    }

    snapshot.forEach(async (doc) => {
      const reminder = doc.data();
      const remindTime = reminder.remind_at?.toDate();
      if (!remindTime) return;

      const remindHour = remindTime.getHours();
      const remindMinute = remindTime.getMinutes();
      const remindDay = remindTime.getDay();
      const remindDate = remindTime.getDate();

      const pattern = reminder.recurrence_pattern;
      let match = false;

      switch (pattern) {
        case "Hằng ngày":
          match = (remindHour === targetHour && remindMinute === targetMinute);
          break;
        case "Hằng tuần":
          match = (
            targetDay === remindDay &&
            remindHour === targetHour &&
            remindMinute === targetMinute
          );
          break;
        case "Hằng tháng":
          match = (
            targetDate === remindDate &&
            remindHour === targetHour &&
            remindMinute === targetMinute
          );
          break;
        default:
          break;
      }

      if (match) {
        const userId = reminder.user_id;
        const title = reminder.title || "Thông báo";
        const body = reminder.description || "Bạn có nhắc nhở (lặp lại)!";

        const userDoc = await db.collection("users").doc(userId).get();
        const token = userDoc.data()?.fcm_token;

        console.log("🔁 Reminder lặp lại:", reminder);

        if (token) {
          await sendNotification(token, title, body);
        } else {
          console.log(`⚠️ Không tìm thấy FCM token cho user_id: ${userId}`);
        }
      }
    });
  } catch (error) {
    console.error("❌ Lỗi khi xử lý nhắc nhở lặp lại:", error);
  }
};

// Lập lịch chạy mỗi phút
cron.schedule("* * * * *", () => {
  console.log("🕐 Kiểm tra nhắc nhở...");
  checkRemindersNoRepeat();
  checkRemindersWithRepeat();
});
