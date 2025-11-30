import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Fetch wrapper that ignores AbortSignal to avoid request-level timeouts.
 */
const fetchNoTimeout = (input: any, init: any = {}) => {
  const { signal, ...rest } = init || {};
  return fetch(input, rest);
};

export async function downloadImageToBase64(url: string): Promise<string> {
  try {
    // If it's already a base64 string, return it
    if (url.startsWith('data:')) {
      return url;
    }
    
    // Attempt to fetch the image
    const response = await fetchNoTimeout(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error downloading image to base64:', error);
    // Return original URL if download fails
    return url;
  }
}
