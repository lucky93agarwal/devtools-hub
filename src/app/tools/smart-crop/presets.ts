/** Ready-made sizes for social media, thumbnails and link previews. */

export interface CropPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const CROP_PRESETS: readonly CropPreset[] = [
  { id: 'youtube', label: 'YouTube thumbnail', width: 1280, height: 720 },
  { id: 'instagram-square', label: 'Instagram post (square)', width: 1080, height: 1080 },
  { id: 'instagram-portrait', label: 'Instagram post (portrait)', width: 1080, height: 1350 },
  { id: 'story', label: 'Instagram / WhatsApp story', width: 1080, height: 1920 },
  { id: 'linkedin-post', label: 'LinkedIn post', width: 1200, height: 627 },
  { id: 'linkedin-banner', label: 'LinkedIn banner', width: 1584, height: 396 },
  { id: 'x-post', label: 'X (Twitter) post', width: 1600, height: 900 },
  { id: 'facebook-cover', label: 'Facebook cover', width: 820, height: 312 },
  { id: 'og-image', label: 'Link preview (Open Graph)', width: 1200, height: 630 },
  { id: 'profile', label: 'Profile picture', width: 400, height: 400 },
];

/** The largest box of the preset's shape that fits in the image, as smartcrop wants it. */
export function cropBox(imageWidth: number, imageHeight: number, targetWidth: number, targetHeight: number) {
  const scale = Math.min(imageWidth / targetWidth, imageHeight / targetHeight);
  return { width: Math.floor(targetWidth * scale), height: Math.floor(targetHeight * scale) };
}

/** True when the crop is smaller than the preset, so the saved image is enlarged and may look soft. */
export function isUpscaled(cropWidth: number, targetWidth: number): boolean {
  return cropWidth < targetWidth;
}

/** Keeps a crop inside the image after the user moves it. */
export function clampCrop(crop: { x: number; y: number; width: number; height: number }, imageWidth: number, imageHeight: number) {
  return {
    ...crop,
    x: Math.round(Math.min(Math.max(0, crop.x), imageWidth - crop.width)),
    y: Math.round(Math.min(Math.max(0, crop.y), imageHeight - crop.height)),
  };
}
