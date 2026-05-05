export function modelPathToFileUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `file://${normalized.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

export function readableModelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Failed to fetch|NetworkError|Not allowed to load local resource/i.test(message)) {
    return "Live2D asset file could not be read. Check the model folder and file permissions.";
  }
  if (/Cubism|moc|model3/i.test(message)) {
    return message;
  }
  return `Live2D runtime failed: ${message}`;
}
