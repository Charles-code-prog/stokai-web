import { toJpeg } from 'html-to-image';

/**
 * Gera um JPG do elemento e abre o compartilhamento nativo (celular)
 * ou baixa o arquivo (computador).
 */
export async function shareNodeAsImage(node: HTMLElement, fileName: string, onCaptured?: () => void) {
  const dataUrl = await toJpeg(node, { quality: 0.95, pixelRatio: 2, cacheBust: true });
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], fileName, { type: 'image/jpeg' });
  onCaptured?.();

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // usuário cancelou
    }
  }
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lê uma imagem escolhida, recorta o centro em quadrado e reduz (foto de perfil leve). */
export function imageFileToSquareDataUrl(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas indisponível'));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
    img.src = url;
  });
}
