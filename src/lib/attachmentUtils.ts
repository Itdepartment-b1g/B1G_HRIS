const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i;

export function isImageUrl(url: string): boolean {
  return IMAGE_EXTENSIONS.test(url.toLowerCase());
}
