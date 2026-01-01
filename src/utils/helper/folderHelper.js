export function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export const getUserInfo = (user) => ({
  name: user.name || user.username || "Unknown User",
  email: user.email || "",
  avatar: user.avatar || user.profilePicture || null,
});
