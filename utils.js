const formatTimestampToTimeString = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return "";

    const date = timestamp.toDate();  // Chuyển Firebase Timestamp -> JS Date
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
};

const formatTimestampToDateString = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return "";

    const date = timestamp.toDate();  // Chuyển Firebase Timestamp -> JS Date
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');  // Tháng tính từ 0
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
};

module.exports = { formatTimestampToTimeString, formatTimestampToDateString };