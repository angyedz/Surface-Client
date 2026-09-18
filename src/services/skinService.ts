import { SkinProfile } from '../types/launcher';

/**
 * Fetches skin texture URL by Minecraft player username using Minotar / Mojang public proxies
 */
export async function fetchSkinByUsername(username: string): Promise<{ skinUrl: string; model: 'classic' | 'slim' }> {
  const cleanUser = username.trim();
  if (!cleanUser) {
    throw new Error('Please provide a valid Minecraft username.');
  }

  // Minotar direct skin URL
  const skinUrl = `https://minotar.net/skin/${cleanUser}`;

  // Verify image loads
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      resolve({
        skinUrl,
        model: 'classic', // Default to classic, user can toggle to slim
      });
    };
    img.onerror = () => {
      // Try fallback to Mojang UUID lookup or direct crafatar
      const fallbackUrl = `https://crafatar.com/skins/${cleanUser}`;
      resolve({
        skinUrl: fallbackUrl,
        model: 'classic',
      });
    };
    img.src = skinUrl;
  });
}

/**
 * Validates and converts an uploaded file to a valid Minecraft skin data URL
 */
export async function processSkinUpload(file: File): Promise<{ dataUrl: string; isSlimHint: boolean }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Uploaded file is not an image.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Minecraft skin dimensions check: 64x64 or legacy 64x32
        if (
          !(img.width === 64 && img.height === 64) &&
          !(img.width === 64 && img.height === 32) &&
          !(img.width === 128 && img.height === 128) // HD skin
        ) {
          // It's still allowed, but warn or auto-scale onto 64x64 canvas
        }

        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to create canvas context'));
          return;
        }

        // Disable smoothing for sharp pixel art
        ctx.imageSmoothingEnabled = false;

        if (img.height === 32) {
          // Convert legacy 64x32 skin to 64x64 (duplicate right arm/leg to left arm/leg)
          ctx.drawImage(img, 0, 0);
          // Mirror right leg to left leg: source 0,16,16,16 -> dest 16,48,16,16
          ctx.drawImage(img, 0, 16, 16, 16, 16, 48, 16, 16);
          // Mirror right arm to left arm: source 40,16,16,16 -> dest 32,48,16,16
          ctx.drawImage(img, 40, 16, 16, 16, 32, 48, 16, 16);
        } else {
          ctx.drawImage(img, 0, 0, 64, 64);
        }

        // Check if arm pixel at (54, 20) is transparent -> indicates Alex/slim model
        const pixelData = ctx.getImageData(54, 20, 1, 1).data;
        const isSlim = pixelData[3] === 0;

        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          isSlimHint: isSlim,
        });
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}
