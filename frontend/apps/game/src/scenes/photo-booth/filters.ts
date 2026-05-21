export type PhotoFilterId = 'original' | 'grayscale' | 'bright' | 'dark'

export type PhotoFilter = {
  id: PhotoFilterId
  label: string
}

export const PHOTO_FILTERS: PhotoFilter[] = [
  { id: 'original', label: '원본' },
  { id: 'grayscale', label: '흑백' },
  { id: 'bright', label: '밝게' },
  { id: 'dark', label: '어둡게' },
]

const BRIGHT_ADJUST = 35
const DARK_ADJUST = 35

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function applyPhotoFilter(dataUrl: string, filter: PhotoFilterId): Promise<string> {
  if (filter === 'original') return dataUrl

  const img = await loadImage(dataUrl)
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)

  const imgData = ctx.getImageData(0, 0, c.width, c.height)
  const d = imgData.data

  switch (filter) {
    case 'grayscale':
      for (let i = 0; i < d.length; i += 4) {
        const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
        d[i] = d[i + 1] = d[i + 2] = gray
      }
      break
    case 'bright':
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, d[i] + BRIGHT_ADJUST)
        d[i + 1] = Math.min(255, d[i + 1] + BRIGHT_ADJUST)
        d[i + 2] = Math.min(255, d[i + 2] + BRIGHT_ADJUST)
      }
      break
    case 'dark':
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.max(0, d[i] - DARK_ADJUST)
        d[i + 1] = Math.max(0, d[i + 1] - DARK_ADJUST)
        d[i + 2] = Math.max(0, d[i + 2] - DARK_ADJUST)
      }
      break
  }
  ctx.putImageData(imgData, 0, 0)
  return c.toDataURL('image/png')
}
