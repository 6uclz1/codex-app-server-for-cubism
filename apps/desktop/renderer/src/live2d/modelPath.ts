export function modelPathToFileUrl(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const prefixed = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `file://${prefixed.split("/").map(encodeURIComponent).join("/")}`;
}

export function readableModelError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
