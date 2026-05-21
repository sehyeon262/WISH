import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PublicPhotoBooth } from '@wish/api-client'
import { usePublicPhotoBooths } from './hooks'

type PhotoGalleryOverlayProps = {
  open: boolean
  onClose: () => void
}

const FONT = "'Jua', 'Apple SD Gothic Neo', sans-serif"
const MIN_ZOOM = 1
const DETAIL_ZOOM = 2.35

type Point = {
  x: number
  y: number
}

type DragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startPan: Point
  moved: boolean
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(31, 26, 21, 0.55)',
    fontFamily: FONT,
  },
  panel: {
    width: 'min(960px, calc(100vw - 32px))',
    maxHeight: 'min(820px, calc(100vh - 32px))',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 24,
    background: '#fff7fa',
    border: '3px solid #ffc1d8',
    boxShadow: '0 24px 48px rgba(35, 24, 13, 0.32)',
    color: '#5b3a2c',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 28px 12px',
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  title: {
    margin: 0,
    fontSize: 28,
    color: '#ff7aa3',
  },
  subtitle: {
    margin: 0,
    fontSize: 14,
    color: '#b39e8d',
  },
  closeButton: {
    border: 0,
    borderRadius: 999,
    padding: '10px 18px',
    background: '#ff8ba0',
    color: '#ffffff',
    fontFamily: FONT,
    fontSize: 16,
    cursor: 'pointer',
  },
  body: {
    padding: '8px 28px 24px',
    overflowX: 'hidden',
    overflowY: 'auto',
    scrollbarWidth: 'none' as CSSProperties['scrollbarWidth'],
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
    gap: 16,
    alignItems: 'start',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
    padding: 10,
    borderRadius: 16,
    background: '#ffffff',
    border: '2px solid #ffe0ec',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: FONT,
    color: '#5b3a2c',
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: 10,
    background: '#fdeef3',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as CSSProperties['objectFit'],
    display: 'block',
  },
  cardFooter: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  author: {
    fontSize: 14,
    color: '#ff7aa3',
  },
  date: {
    fontSize: 12,
    color: '#b39e8d',
  },
  message: {
    margin: '40px auto',
    textAlign: 'center',
    fontSize: 16,
    color: '#b39e8d',
  },
  retryButton: {
    marginTop: 12,
    border: 0,
    borderRadius: 999,
    padding: '8px 18px',
    background: '#ff8ba0',
    color: '#ffffff',
    fontFamily: FONT,
    cursor: 'pointer',
  },
  detailBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1010,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(31, 26, 21, 0.7)',
    padding: 24,
  },
  detailPanel: {
    position: 'relative',
    width: 'min(920px, calc(100vw - 48px))',
    maxHeight: 'calc(100vh - 48px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    alignItems: 'center',
  },
  detailStage: {
    width: '100%',
    height: 'min(720px, calc(100vh - 170px))',
    minHeight: 'min(320px, calc(100vh - 180px))',
    overflow: 'hidden',
    display: 'flex',
    borderRadius: 16,
    touchAction: 'none',
  },
  detailImageFrame: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 'auto',
  },
  detailImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    borderRadius: 12,
    display: 'block',
    userSelect: 'none',
    willChange: 'transform',
  },
  detailInfo: {
    color: '#fff7fa',
    fontFamily: FONT,
    textAlign: 'center',
  },
  detailClose: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 0,
    background: '#ffffff',
    color: '#ff7aa3',
    fontFamily: FONT,
    fontSize: 20,
    cursor: 'pointer',
    boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
  },
} satisfies Record<string, CSSProperties>

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value))
}

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

export function PhotoGalleryOverlay({ open, onClose }: PhotoGalleryOverlayProps) {
  const [selected, setSelected] = useState<PublicPhotoBooth | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [zoomOrigin, setZoomOrigin] = useState<Point>({ x: 50, y: 50 })
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const detailImageRef = useRef<HTMLImageElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const ignoreNextClickRef = useRef(false)
  const { data, isLoading, isError, refetch } = usePublicPhotoBooths({
    page: 0,
    size: 36,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    void refetch()
  }, [open, refetch])

  useEffect(() => {
    if (!open) {
      setSelected(null)
      setZoom(MIN_ZOOM)
      setPan({ x: 0, y: 0 })
      setZoomOrigin({ x: 50, y: 50 })
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (selected) {
        setSelected(null)
        return
      }

      onClose()
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [onClose, open, selected])

  useEffect(() => {
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
    setZoomOrigin({ x: 50, y: 50 })
    setIsDragging(false)
    dragStateRef.current = null
    ignoreNextClickRef.current = false
  }, [selected?.id])

  if (!open) return null

  // 백엔드 응답은 { code, message, data: PageResponse } 래핑이라 한 단계 더 들어가야 함.
  const photos = data?.data?.content ?? []

  const handleDetailPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= MIN_ZOOM) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: pan,
      moved: false,
    }
    setIsDragging(true)
  }

  const handleDetailPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const dx = event.clientX - dragState.startClientX
    const dy = event.clientY - dragState.startClientY
    if (Math.hypot(dx, dy) > 3) dragState.moved = true
    setPan({ x: dragState.startPan.x + dx, y: dragState.startPan.y + dy })
  }

  const handleDetailPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    if (dragState.moved) {
      ignoreNextClickRef.current = true
      window.setTimeout(() => {
        ignoreNextClickRef.current = false
      }, 0)
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    dragStateRef.current = null
    setIsDragging(false)
  }

  const handleDetailClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false
      return
    }

    const image = detailImageRef.current
    if (!image) return

    const rect = image.getBoundingClientRect()
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return
    }

    setZoomOrigin({
      x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
    })
    setPan({ x: 0, y: 0 })
    setZoom(DETAIL_ZOOM)
  }

  const resetDetailZoom = () => {
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
    setZoomOrigin({ x: 50, y: 50 })
  }

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <style>{`.wish-gallery-body::-webkit-scrollbar{display:none}`}</style>
      <section style={styles.panel} onClick={event => event.stopPropagation()}>
        <header style={styles.header}>
          <div style={styles.titleBlock}>
            <h2 style={styles.title}>WISH 갤러리</h2>
            <p style={styles.subtitle}>친구들이 공개한 사진을 구경해보세요</p>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </header>

        <div className="wish-gallery-body" style={styles.body}>
          {isLoading && <p style={styles.message}>사진을 불러오는 중이에요…</p>}

          {isError && (
            <div style={styles.message}>
              <p>사진을 불러오지 못했어요.</p>
              <button type="button" style={styles.retryButton} onClick={() => void refetch()}>
                다시 시도
              </button>
            </div>
          )}

          {!isLoading && !isError && photos.length === 0 && (
            <p style={styles.message}>아직 공개된 사진이 없어요. 가장 먼저 공유해볼까요?</p>
          )}

          {!isLoading && !isError && photos.length > 0 && (
            <div style={styles.grid}>
              {photos.map(photo => (
                <button
                  key={photo.id}
                  type="button"
                  style={styles.card}
                  onClick={() => setSelected(photo)}
                >
                  <div style={styles.thumbWrap}>
                    <img
                      src={photo.thumbnailUrl ?? photo.imageUrl}
                      alt=""
                      style={styles.thumb}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div style={styles.cardFooter}>
                    <span style={styles.author}>{photo.author.nickname}</span>
                    <span style={styles.date}>{formatDate(photo.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {selected && (
        <div style={styles.detailBackdrop} onClick={() => setSelected(null)}>
          <div style={styles.detailPanel} onClick={event => event.stopPropagation()}>
            <button
              type="button"
              style={styles.detailClose}
              onClick={() => setSelected(null)}
              aria-label="close"
            >
              ×
            </button>
            <div
              className="wish-gallery-detail-stage"
              style={{
                ...styles.detailStage,
                cursor: zoom > MIN_ZOOM ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
              }}
              onPointerDown={handleDetailPointerDown}
              onPointerMove={handleDetailPointerMove}
              onPointerUp={handleDetailPointerUp}
              onPointerCancel={handleDetailPointerUp}
              onClick={handleDetailClick}
              onDoubleClick={resetDetailZoom}
            >
              <div style={styles.detailImageFrame}>
                <img
                  ref={detailImageRef}
                  src={selected.imageUrl}
                  alt=""
                  draggable={false}
                  style={{
                    ...styles.detailImage,
                    cursor: zoom > MIN_ZOOM ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                    transition: isDragging ? 'none' : 'transform 160ms ease-out',
                  }}
                />
              </div>
            </div>
            <div style={styles.detailInfo}>
              <div style={{ fontSize: 18 }}>{selected.author.nickname}</div>
              <div style={{ fontSize: 14, color: '#ffd9e4' }}>{formatDate(selected.createdAt)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
