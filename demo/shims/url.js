export const fileURLToPath = (u) => {
  try {
    return decodeURIComponent(new URL(u).pathname);
  } catch {
    return String(u);
  }
};
