/**
 * Compresses an image file to reduce network payload size and optimize Gemini token usage.
 * Maintains text readability by downscaling to a maximum of 1600px width/height and saving as JPEG format.
 */
export function compressImage(file: File, maxW = 1200, maxH = 1200, quality = 0.70): Promise<{ base64: string; compressedSize: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions keeping aspect ratio
        if (width > maxW || height > maxH) {
          if (width > height) {
            height = Math.round((height * maxW) / width);
            width = maxW;
          } else {
            width = Math.round((width * maxH) / height);
            height = maxH;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          // Fallback to original base64 if canvas context is unavailable
          const base64 = (e.target?.result as string).split(",")[1];
          resolve({ base64, compressedSize: file.size });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Export as jpeg with designated quality
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1];
        
        // Calculate approximate size of base64
        const compressedSize = Math.round((base64.length * 3) / 4);
        resolve({ base64, compressedSize });
      };
      
      img.onerror = () => {
        reject(new Error("Không thể load hình ảnh để thực hiện nén. Vui lòng thử lại."));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
