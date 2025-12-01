/**
 * File System Access API Helper
 * Modern browser API for accessing directories (Chrome 86+, Edge 86+)
 * Provides better UX than webkitdirectory input hack
 */

export interface FileSystemSupport {
  showDirectoryPicker: boolean;
  webkitDirectory: boolean;
}

/**
 * Check browser support for directory selection methods
 */
export function checkFileSystemSupport(): FileSystemSupport {
  return {
    showDirectoryPicker: 'showDirectoryPicker' in window,
    webkitDirectory: 'webkitdirectory' in document.createElement('input'),
  };
}

/**
 * Open native directory picker using File System Access API
 * Returns the full directory path (Chrome/Edge only)
 */
export async function selectDirectoryWithAPI(): Promise<string | null> {
  try {
    // @ts-ignore - File System Access API not in TypeScript lib yet
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });

    // Get the directory path (only available in some browsers)
    // Note: File System Access API doesn't give us the full path for security reasons
    // We can only get the directory name and work with handles
    return dirHandle.name; // Returns just the folder name, not full path
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // User cancelled
      return null;
    }
    console.error('Directory picker error:', error);
    throw error;
  }
}

/**
 * Fallback: Use webkit directory input
 * This shows "upload files" dialog which is confusing
 */
export async function selectDirectoryWithInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.setAttribute('mozdirectory', '');
    input.style.display = 'none';
    input.style.position = 'fixed';
    input.style.left = '-9999px';

    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        // Get directory path from first file
        const file = target.files[0];
        // @ts-ignore - webkitRelativePath not in standard types
        const fullPath = file.webkitRelativePath || '';
        const dirPath = fullPath.split('/')[0] || '';

        // Clean up
        document.body.removeChild(input);

        // This only gives us the folder name, not full path
        resolve(dirPath || null);
      } else {
        document.body.removeChild(input);
        resolve(null);
      }
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Main function: Try modern API first, fallback to input
 *
 * IMPORTANT LIMITATION:
 * For security reasons, browsers don't give full file paths.
 * File System Access API only provides directory handles and names.
 * The input method also can't get full paths.
 *
 * RECOMMENDATION: Use manual path input as primary method.
 */
export async function selectDirectory(): Promise<string | null> {
  const support = checkFileSystemSupport();

  if (support.showDirectoryPicker) {
    try {
      return await selectDirectoryWithAPI();
    } catch (error) {
      console.warn('File System Access API failed, falling back to input:', error);
    }
  }

  if (support.webkitDirectory) {
    return await selectDirectoryWithInput();
  }

  // No support at all
  throw new Error('Directory selection not supported in this browser');
}

/**
 * Get user's Documents folder path based on OS
 */
export function getDocumentsPath(): string {
  const platform = navigator.platform.toLowerCase();
  const username = 'user'; // Can't get actual username from browser

  if (platform.includes('mac')) {
    return `/Users/${username}/Documents/tarko-backups`;
  } else if (platform.includes('win')) {
    return `C:\\Users\\${username}\\Documents\\tarko-backups`;
  } else {
    // Linux
    return `/home/${username}/Documents/tarko-backups`;
  }
}
