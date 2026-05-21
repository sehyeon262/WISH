import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { ExerciseMotion, ExerciseType } from '@wish/api-client'

const MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024

const motionSchema = z.object({
  exerciseType: z.enum(['TOP', 'DANIEL']),
  name: z.string().min(1, '이름을 입력하세요').max(100),
  routineOrder: z.coerce.number().int().positive('1 이상의 정수를 입력하세요'),
  targetReps: z.coerce.number().int().positive('1 이상의 정수를 입력하세요'),
  description: z.string().min(1, '설명을 입력하세요'),
})

type MotionMetadataValues = z.infer<typeof motionSchema>

export type MotionFormSubmit = {
  values: MotionMetadataValues
  thumbnail?: File
  demoVideo?: File
  clearThumbnail?: boolean
  clearDemoVideo?: boolean
}

type Props = {
  defaultExerciseType: ExerciseType
  initial?: ExerciseMotion
  onSubmit: (payload: MotionFormSubmit) => void | Promise<void>
  onCancel: () => void
  submitting?: boolean
}

export function MotionForm({
  defaultExerciseType,
  initial,
  onSubmit,
  onCancel,
  submitting,
}: Props) {
  const [thumbnail, setThumbnail] = useState<File | undefined>()
  const [demoVideo, setDemoVideo] = useState<File | undefined>()
  const [clearThumbnail, setClearThumbnail] = useState(false)
  const [clearDemoVideo, setClearDemoVideo] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null)

  const { register, handleSubmit, formState } = useForm<MotionMetadataValues>({
    resolver: zodResolver(motionSchema),
    defaultValues: initial
      ? {
          exerciseType: initial.exerciseType,
          name: initial.name,
          routineOrder: initial.routineOrder,
          targetReps: initial.targetReps,
          description: initial.description,
        }
      : {
          exerciseType: defaultExerciseType,
          name: '',
          routineOrder: 1,
          targetReps: 8,
          description: '',
        },
  })

  const handleThumbnailChange = (file: File | undefined) => {
    setFileError(null)
    if (file && file.size > MAX_THUMBNAIL_BYTES) {
      setFileError('썸네일은 10MB 이하의 이미지여야 합니다')
      return
    }
    setThumbnail(file)
    if (file) setClearThumbnail(false)
  }

  useEffect(() => {
    if (!thumbnail) {
      setThumbnailPreviewUrl(null)
      return
    }
    const previewUrl = URL.createObjectURL(thumbnail)
    setThumbnailPreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [thumbnail])

  const handleDemoVideoChange = (file: File | undefined) => {
    setFileError(null)
    if (file && file.size > MAX_VIDEO_BYTES) {
      setFileError('영상은 100MB 이하여야 합니다')
      return
    }
    setDemoVideo(file)
    if (file) setClearDemoVideo(false)
  }

  const submit = async (values: MotionMetadataValues) => {
    if (fileError) return
    await onSubmit({
      values,
      thumbnail,
      demoVideo,
      clearThumbnail: initial ? clearThumbnail : undefined,
      clearDemoVideo: initial ? clearDemoVideo : undefined,
    })
  }

  const visibleThumbnailUrl =
    thumbnailPreviewUrl ?? (!clearThumbnail ? (initial?.thumbnailUrl ?? null) : null)

  return (
    <form onSubmit={handleSubmit(submit)} style={styles.form}>
      <h3 style={styles.heading}>{initial ? '동작 수정' : '동작 추가'}</h3>
      <div style={styles.grid}>
        {initial ? (
          <>
            <input type="hidden" {...register('exerciseType')} />
            <input type="hidden" {...register('routineOrder')} />
            <div style={styles.label}>
              <span>체조 타입</span>
              <span style={styles.readonlyValue}>{initial.exerciseType}</span>
            </div>
            <div style={styles.label}>
              <span>순서</span>
              <span style={styles.readonlyValue}>{initial.routineOrder}</span>
            </div>
          </>
        ) : (
          <>
            <label style={styles.label}>
              체조 타입
              <select {...register('exerciseType')} style={styles.input} disabled={submitting}>
                <option value="TOP">TOP</option>
                <option value="DANIEL">DANIEL</option>
              </select>
            </label>

            <label style={styles.label}>
              순서
              <input
                type="number"
                min={1}
                {...register('routineOrder')}
                style={styles.input}
                disabled={submitting}
              />
              {formState.errors.routineOrder && (
                <span style={styles.error}>{formState.errors.routineOrder.message}</span>
              )}
            </label>
          </>
        )}

        <label style={styles.label}>
          이름
          <input {...register('name')} style={styles.input} disabled={submitting} />
          {formState.errors.name && (
            <span style={styles.error}>{formState.errors.name.message}</span>
          )}
        </label>

        <label style={styles.label}>
          목표 횟수
          <input
            type="number"
            min={1}
            {...register('targetReps')}
            style={styles.input}
            disabled={submitting}
          />
          {formState.errors.targetReps && (
            <span style={styles.error}>{formState.errors.targetReps.message}</span>
          )}
        </label>

        <label style={{ ...styles.label, gridColumn: 'span 2' }}>
          설명
          <textarea
            rows={2}
            {...register('description')}
            style={styles.input}
            disabled={submitting}
          />
          {formState.errors.description && (
            <span style={styles.error}>{formState.errors.description.message}</span>
          )}
        </label>

        <div style={styles.label}>
          <span>썸네일 (선택, 10MB 이하 이미지)</span>
          {visibleThumbnailUrl && (
            <img src={visibleThumbnailUrl} alt="동작 썸네일" style={styles.thumbnailPreview} />
          )}
          {initial?.thumbnailUrl && !thumbnail && (
            <span style={styles.mediaHint}>
              현재:{' '}
              <a href={initial.thumbnailUrl} target="_blank" rel="noreferrer">
                {extractFilename(initial.thumbnailUrl)}
              </a>
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={e => handleThumbnailChange(e.target.files?.[0])}
            style={styles.fileInput}
            disabled={submitting}
          />
          {initial?.thumbnailUrl && (
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={clearThumbnail}
                onChange={e => setClearThumbnail(e.target.checked)}
                disabled={submitting || Boolean(thumbnail)}
              />
              기존 썸네일 제거
            </label>
          )}
        </div>

        <div style={styles.label}>
          <span>시범 영상 (선택, 100MB 이하 영상)</span>
          {initial?.demoVideoUrl && !demoVideo && (
            <span style={styles.mediaHint}>
              현재:{' '}
              <a href={initial.demoVideoUrl} target="_blank" rel="noreferrer">
                {extractFilename(initial.demoVideoUrl)}
              </a>
            </span>
          )}
          <input
            type="file"
            accept="video/*"
            onChange={e => handleDemoVideoChange(e.target.files?.[0])}
            style={styles.fileInput}
            disabled={submitting}
          />
          {initial?.demoVideoUrl && (
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={clearDemoVideo}
                onChange={e => setClearDemoVideo(e.target.checked)}
                disabled={submitting || Boolean(demoVideo)}
              />
              기존 영상 제거
            </label>
          )}
        </div>
      </div>

      {fileError && <div style={styles.errorBox}>{fileError}</div>}

      <div style={styles.actions}>
        <button type="button" onClick={onCancel} style={styles.cancel} disabled={submitting}>
          취소
        </button>
        <button type="submit" style={styles.submit} disabled={submitting || Boolean(fileError)}>
          {submitting ? '저장 중' : '저장'}
        </button>
      </div>
    </form>
  )
}

function extractFilename(url: string): string {
  const trimmed = url.split('?')[0]
  const last = trimmed.substring(trimmed.lastIndexOf('/') + 1)
  return last || url
}

const styles: Record<string, CSSProperties> = {
  form: {
    background: '#f8fafc',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
    padding: 18,
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  heading: {
    margin: 0,
    color: '#102a43',
    fontSize: 16,
    letterSpacing: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: '#486581',
    fontSize: 13,
    fontWeight: 600,
  },
  input: {
    padding: '8px 10px',
    fontSize: 13,
    color: '#102a43',
    background: '#fff',
    border: '1px solid #bcccdc',
    borderRadius: 6,
  },
  readonlyValue: {
    minHeight: 32,
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    background: '#f0f4f8',
    border: '1px solid #d9e2ec',
    borderRadius: 6,
    color: '#334e68',
    fontSize: 13,
    fontWeight: 600,
  },
  fileInput: {
    fontSize: 12,
    color: '#486581',
  },
  thumbnailPreview: {
    width: 120,
    height: 76,
    objectFit: 'cover',
    border: '1px solid #d9e2ec',
    borderRadius: 6,
    background: '#fff',
  },
  mediaHint: {
    fontSize: 12,
    color: '#627d98',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: '#627d98',
    fontWeight: 500,
  },
  error: {
    color: '#c92a2a',
    fontSize: 12,
    fontWeight: 500,
  },
  errorBox: {
    padding: 10,
    background: '#fff5f5',
    color: '#c92a2a',
    border: '1px solid #ffc9c9',
    borderRadius: 6,
    fontSize: 13,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancel: {
    height: 34,
    padding: '0 14px',
    background: '#fff',
    color: '#334e68',
    border: '1px solid #bcccdc',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  submit: {
    height: 34,
    padding: '0 16px',
    background: '#0b7285',
    color: '#fff',
    border: '1px solid #0b7285',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
}
