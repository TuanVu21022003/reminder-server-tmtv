const { Timestamp } = require('firebase-admin/firestore');
const { db, admin } = require('./firebase');  // Import Firebase db connection
const { formatTimestampToTimeString, formatTimestampToDateString } = require('./utils');

const createNotificationReminder = async (reminder) => {
  try {
    let timeNotify;
    if(reminder.is_recurring) {
        timeNotify = `${formatTimestampToTimeString(reminder.remind_at)} - ${reminder.recurrence_pattern}`
    }
    else {
        timeNotify = `${formatTimestampToTimeString(reminder.remind_at)} - ${formatTimestampToDateString(reminder.remind_at)}`
    }
    // Lưu thông báo vào Firestore
    const notificationData = {
      user_id: reminder.user_id,  // Nhận user_id từ reminder
      category: "reminder",  // Chỉ định loại thông báo
      type: "reminder_due",  // Thêm kiểu thông báo là nhắc nhở
      reference_id: reminder.id,  // Liên kết đến reminder
      title: JSON.stringify({ time: timeNotify, description: reminder.description}),
      is_read: false,  // Mặc định là chưa đọc
      created_at: Timestamp.now(),  // Thời gian gửi
    };

    // Lưu vào collection 'notifications' và lấy tài liệu reference
    const docRef = await db.collection("notifications").add(notificationData);
    
    // Thêm trường 'id' vào dữ liệu
    await docRef.update({
      id: docRef.id,  // Thêm ID tài liệu vào trường 'id'
    });

    console.log("✅ Đã lưu thông báo vào Firestore với ID:", docRef.id);
  } catch (error) {
    console.error("❌ Lỗi khi tạo thông báo:", error.message);
  }
};
const fetch = require("node-fetch");
const { GoogleAuth } = require("google-auth-library");
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

/**
 * Gửi thông báo đến 1 thiết bị thông qua Firebase Cloud Messaging
 * @param {string} token - FCM Token của thiết bị
 * @param {string} title - Tiêu đề thông báo
 * @param {string} body - Nội dung thông báo
 * @param {Object} [data] - Dữ liệu tùy chọn đi kèm (có thể null)
 * @returns {Promise<boolean>} - Trả về true nếu gửi thành công, false nếu lỗi
 */
const sendNotificationFC = async (token, title, body, data = {}) => {
  try {
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });

    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const accessToken = accessTokenResponse.token;

    const message = {
      message: {
        token,
        notification: { title, body },
        data: {
          ...data, // custom key-value data gửi kèm thông báo
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

    const result = await response.json();
    if (response.ok) {
      console.log(`✅ [FCM] Đã gửi thông báo tới ${token}:`, title);
      return true;
    } else {
      console.error(`❌ [FCM] Lỗi gửi thông báo:`, result);
      return false;
    }
  } catch (error) {
    console.error("❌ [FCM] Exception khi gửi thông báo:", error.message);
    return false;
  }
};

module.exports = { createNotificationReminder, sendNotificationFC };
