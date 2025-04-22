// firebase.js hoặc file tương ứng bạn đang sử dụng
const admin = require("firebase-admin");

// Khởi tạo Firebase Admin nếu chưa khởi tạo
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)),
  });
}

const db = admin.firestore();

module.exports = { db, admin };
