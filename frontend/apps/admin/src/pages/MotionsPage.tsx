import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createExerciseMotion,
  deleteExerciseMotion,
  listExerciseMotions,
  reorderExerciseMotions,
  updateExerciseMotion,
} from '@wish/api-client'
import type { ExerciseMotion, ExerciseType } from '@wish/api-client'
import { AdminShell } from '../shared/components/AdminShell'
import { ConfirmModal } from '../shared/components/ConfirmModal'
import { MotionForm } from './MotionForm'
import type { MotionFormSubmit } from './MotionForm'

const EXERCISE_TYPES: ExerciseType[] = ['TOP', 'DANIEL']
const EXERCISE_LABELS: Record<ExerciseType, string> = {
  TOP: 'TOP',
  DANIEL: 'DANIEL',
}

function isExerciseType(value: string | null): value is ExerciseType {
  return value === 'TOP' || value === 'DANIEL'
}

export function MotionsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialExerciseType = isExerciseType(searchParams.get('type'))
    ? (searchParams.get('type') as ExerciseType)
    : 'TOP'
  const [exerciseType, setExerciseType] = useState<ExerciseType>(initialExerciseType)
  const [editing, setEditing] = useState<ExerciseMotion | null>(null)
  const [creating, setCreating] = useState(false)
  const [orderedMotions, setOrderedMotions] = useState<ExerciseMotion[]>([])
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ExerciseMotion | null>(null)

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (next.get('type') !== exerciseType) {
      next.set('type', exerciseType)
      setSearchParams(next, { replace: true })
    }
  }, [exerciseType, searchParams, setSearchParams])

  const motionsQuery = useQuery({
    queryKey: ['motions', exerciseType],
    queryFn: () => listExerciseMotions(exerciseType).then(r => r.data),
  })

  useEffect(() => {
    if (motionsQuery.data) {
      setOrderedMotions(motionsQuery.data)
      setDraggingId(null)
    }
  }, [motionsQuery.data])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['motions'] })

  const createMutation = useMutation({
    mutationFn: (payload: MotionFormSubmit) =>
      createExerciseMotion({
        request: {
          exerciseType: payload.values.exerciseType,
          name: payload.values.name,
          routineOrder: payload.values.routineOrder,
          targetReps: payload.values.targetReps,
          description: payload.values.description,
        },
        thumbnail: payload.thumbnail,
        demoVideo: payload.demoVideo,
      }),
    onSuccess: () => {
      setCreating(false)
      invalidate()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: MotionFormSubmit }) =>
      updateExerciseMotion(id, {
        request: {
          name: payload.values.name,
          routineOrder: payload.values.routineOrder,
          targetReps: payload.values.targetReps,
          description: payload.values.description,
          clearThumbnail: payload.clearThumbnail,
          clearDemoVideo: payload.clearDemoVideo,
        },
        thumbnail: payload.thumbnail,
        demoVideo: payload.demoVideo,
      }),
    onSuccess: () => {
      setEditing(null)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteExerciseMotion(id),
    onSuccess: invalidate,
  })

  const reorderMutation = useMutation({
    mutationFn: ({ type, motionIds }: { type: ExerciseType; motionIds: number[] }) =>
      reorderExerciseMotions({ exerciseType: type, motionIds }),
    onSuccess: (response, variables) => {
      queryClient.setQueryData(['motions', variables.type], response.data)
      setOrderedMotions(response.data)
      invalidate()
    },
  })

  const hasOrderChanges = motionsQuery.data
    ? !isSameOrder(orderedMotions, motionsQuery.data)
    : false
  const thumbnailCount = orderedMotions.filter(motion => motion.thumbnailUrl).length
  const missingThumbnailCount = orderedMotions.length - thumbnailCount
  const missingVideoCount = useMemo(
    () => orderedMotions.filter(motion => !motion.demoVideoUrl).length,
    [orderedMotions],
  )

  const onExerciseTypeChange = (nextType: ExerciseType) => {
    setExerciseType(nextType)
    setEditing(null)
    setCreating(false)
    setDraggingId(null)
    setDropTargetId(null)
  }

  const onDelete = (motion: ExerciseMotion) => {
    setPendingDelete(motion)
  }

  const onConfirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteMutation.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      setPendingDelete(null)
    }
  }

  const onDragStart = (event: DragEvent<HTMLTableRowElement>, motionId: number) => {
    setDraggingId(motionId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(motionId))
  }

  const onDragOver = (event: DragEvent<HTMLTableRowElement>, targetId: number) => {
    event.preventDefault()
    const activeId = draggingId ?? Number(event.dataTransfer.getData('text/plain'))
    if (!activeId || activeId === targetId) {
      setDropTargetId(null)
      return
    }
    setDropTargetId(targetId)
    setOrderedMotions(current => moveMotion(current, activeId, targetId))
  }

  const onDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  const onMoveByButton = (motionId: number, direction: -1 | 1) => {
    setOrderedMotions(current => {
      const index = current.findIndex(motion => motion.id === motionId)
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }

  const onSaveOrder = () => {
    reorderMutation.mutate({
      type: exerciseType,
      motionIds: orderedMotions.map(motion => motion.id),
    })
  }

  const onResetOrder = () => {
    if (motionsQuery.data) setOrderedMotions(motionsQuery.data)
  }

  return (
    <AdminShell title="체조 모션 관리" description="루틴 순서, 썸네일과 시범 영상을 관리합니다.">
      <section style={styles.panel}>
        <div style={styles.toolbar}>
          <label style={styles.typeLabel}>
            체조 타입
            <select
              value={exerciseType}
              onChange={event => onExerciseTypeChange(event.target.value as ExerciseType)}
              style={styles.select}
            >
              {EXERCISE_TYPES.map(type => (
                <option key={type} value={type}>
                  {EXERCISE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <div style={styles.toolbarActions}>
            <button
              onClick={onResetOrder}
              style={styles.secondaryButton}
              disabled={!hasOrderChanges || reorderMutation.isPending}
            >
              되돌리기
            </button>
            <button
              onClick={onSaveOrder}
              style={styles.primaryButton}
              disabled={!hasOrderChanges || reorderMutation.isPending}
            >
              {reorderMutation.isPending ? '순서 저장 중' : '순서 저장'}
            </button>
            <button
              onClick={() => {
                setCreating(true)
                setEditing(null)
              }}
              style={styles.addButton}
              disabled={creating}
            >
              동작 추가
            </button>
          </div>
        </div>

        <div style={styles.summary}>
          <span style={styles.summaryItem}>총 {orderedMotions.length}개</span>
          <span style={styles.summaryItem}>썸네일 {thumbnailCount}개</span>
          {missingThumbnailCount > 0 && (
            <span style={styles.warningBadge}>썸네일 누락 {missingThumbnailCount}개</span>
          )}
          {missingVideoCount > 0 && (
            <span style={styles.warningBadge}>시범영상 누락 {missingVideoCount}개</span>
          )}
          {hasOrderChanges && <span style={styles.changedBadge}>순서 변경됨</span>}
        </div>
      </section>

      {creating && (
        <MotionForm
          defaultExerciseType={exerciseType}
          onCancel={() => setCreating(false)}
          onSubmit={async payload => {
            await createMutation.mutateAsync(payload)
          }}
          submitting={createMutation.isPending}
        />
      )}

      {createMutation.isError && (
        <div style={styles.errorBox}>추가 실패: {extractMessage(createMutation.error)}</div>
      )}
      {updateMutation.isError && (
        <div style={styles.errorBox}>수정 실패: {extractMessage(updateMutation.error)}</div>
      )}
      {deleteMutation.isError && (
        <div style={styles.errorBox}>삭제 실패: {extractMessage(deleteMutation.error)}</div>
      )}
      {reorderMutation.isError && (
        <div style={styles.errorBox}>순서 저장 실패: {extractMessage(reorderMutation.error)}</div>
      )}

      {motionsQuery.isLoading && <div style={styles.loading}>불러오는 중</div>}
      {motionsQuery.isError && (
        <div style={styles.errorBox}>목록 조회 실패: {extractMessage(motionsQuery.error)}</div>
      )}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="동작을 삭제할까요?"
        description={
          pendingDelete && (
            <span>
              <strong>"{pendingDelete.name}"</strong> 동작을 삭제합니다. 수행 기록이 남아 있으면
              삭제가 거부됩니다.
            </span>
          )
        }
        confirmLabel="삭제"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={onConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {motionsQuery.data && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>이동</th>
                <th style={styles.th}>썸네일</th>
                <th style={styles.th}>순서</th>
                <th style={styles.th}>이름</th>
                <th style={styles.th}>목표</th>
                <th style={styles.th}>설명</th>
                <th style={styles.th}>미디어</th>
                <th style={styles.th}>액션</th>
              </tr>
            </thead>
            <tbody>
              {orderedMotions.length === 0 && (
                <tr>
                  <td colSpan={8} style={styles.emptyRow}>
                    <div style={styles.emptyTitle}>아직 등록된 동작이 없습니다</div>
                    <div style={styles.emptyHint}>
                      우측 상단의 <strong>동작 추가</strong>로 첫 동작을 등록해 보세요.
                    </div>
                  </td>
                </tr>
              )}
              {orderedMotions.map((motion, index) => (
                <tr
                  key={motion.id}
                  draggable={!editing && !reorderMutation.isPending}
                  onDragStart={event => onDragStart(event, motion.id)}
                  onDragOver={event => onDragOver(event, motion.id)}
                  onDrop={onDragEnd}
                  onDragEnd={onDragEnd}
                  style={{
                    ...styles.row,
                    ...(draggingId === motion.id ? styles.draggingRow : {}),
                    ...(dropTargetId === motion.id && draggingId !== motion.id
                      ? styles.dropTargetRow
                      : {}),
                  }}
                >
                  {editing?.id === motion.id ? (
                    <td colSpan={8} style={styles.editCell}>
                      <MotionForm
                        defaultExerciseType={exerciseType}
                        initial={motion}
                        onCancel={() => setEditing(null)}
                        onSubmit={async payload => {
                          await updateMutation.mutateAsync({ id: motion.id, payload })
                        }}
                        submitting={updateMutation.isPending}
                      />
                    </td>
                  ) : (
                    <>
                      <td style={styles.dragCell}>
                        <span style={styles.dragHandle} title="드래그로 순서 변경">
                          ::
                        </span>
                        <div style={styles.orderControls}>
                          <button
                            type="button"
                            onClick={() => onMoveByButton(motion.id, -1)}
                            style={styles.moveButton}
                            disabled={index === 0 || reorderMutation.isPending}
                          >
                            위
                          </button>
                          <button
                            type="button"
                            onClick={() => onMoveByButton(motion.id, 1)}
                            style={styles.moveButton}
                            disabled={
                              index === orderedMotions.length - 1 || reorderMutation.isPending
                            }
                          >
                            아래
                          </button>
                        </div>
                      </td>
                      <td style={styles.td}>
                        {motion.thumbnailUrl ? (
                          <img
                            src={motion.thumbnailUrl}
                            alt={`${motion.name} 썸네일`}
                            style={styles.thumbnail}
                          />
                        ) : (
                          <div style={styles.thumbnailPlaceholder}>없음</div>
                        )}
                      </td>
                      <td style={styles.td}>
                        <span style={styles.orderBadge}>{index + 1}</span>
                      </td>
                      <td style={styles.nameCell}>{motion.name}</td>
                      <td style={styles.td}>{motion.targetReps}회</td>
                      <td style={styles.descriptionCell}>{motion.description}</td>
                      <td style={styles.td}>
                        {motion.demoVideoUrl ? (
                          <a
                            href={motion.demoVideoUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.link}
                          >
                            시범 영상
                          </a>
                        ) : (
                          <span style={styles.muted}>없음</span>
                        )}
                      </td>
                      <td style={styles.actionCell}>
                        <button
                          onClick={() => {
                            setEditing(motion)
                            setCreating(false)
                          }}
                          style={styles.editButton}
                        >
                          수정
                        </button>
                        <button onClick={() => onDelete(motion)} style={styles.deleteButton}>
                          삭제
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  )
}

function moveMotion(motions: ExerciseMotion[], activeId: number, targetId: number) {
  const fromIndex = motions.findIndex(motion => motion.id === activeId)
  const toIndex = motions.findIndex(motion => motion.id === targetId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return motions
  const next = [...motions]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function isSameOrder(left: ExerciseMotion[], right: ExerciseMotion[]) {
  if (left.length !== right.length) return false
  return left.every((motion, index) => motion.id === right[index]?.id)
}

function extractMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const res = (error as { response?: { data?: { message?: string; code?: string } } }).response
    if (res?.data?.message) return res.data.message
    if (res?.data?.code) return res.data.code
  }
  if (error instanceof Error) return error.message
  return '알 수 없는 오류'
}

const styles: Record<string, CSSProperties> = {
  panel: {
    padding: 18,
    marginBottom: 16,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
  },
  typeLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    color: '#486581',
    fontSize: 13,
  },
  select: {
    minWidth: 150,
    padding: '8px 10px',
    fontSize: 14,
    border: '1px solid #bcccdc',
    borderRadius: 6,
    background: '#fff',
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryButton: {
    padding: '8px 12px',
    background: '#0b7285',
    color: '#fff',
    border: '1px solid #0b7285',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  secondaryButton: {
    padding: '8px 12px',
    background: '#fff',
    color: '#334e68',
    border: '1px solid #bcccdc',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  addButton: {
    padding: '8px 12px',
    background: '#2f855a',
    color: '#fff',
    border: '1px solid #2f855a',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  summaryItem: {
    padding: '5px 8px',
    background: '#f0f4f8',
    border: '1px solid #d9e2ec',
    borderRadius: 6,
    color: '#486581',
    fontSize: 12,
  },
  changedBadge: {
    padding: '5px 8px',
    background: '#fff3bf',
    border: '1px solid #ffe066',
    borderRadius: 6,
    color: '#8d6b00',
    fontSize: 12,
    fontWeight: 700,
  },
  warningBadge: {
    padding: '5px 8px',
    background: '#fff5f5',
    border: '1px solid #ffc9c9',
    borderRadius: 6,
    color: '#c92a2a',
    fontSize: 12,
    fontWeight: 700,
  },
  tableWrap: {
    overflowX: 'auto',
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
  },
  table: {
    width: '100%',
    minWidth: 980,
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  th: {
    padding: '11px 12px',
    textAlign: 'left',
    fontSize: 12,
    color: '#486581',
    background: '#f8fafc',
    borderBottom: '1px solid #d9e2ec',
  },
  row: {
    background: '#fff',
  },
  draggingRow: {
    opacity: 0.55,
    background: '#e6f6ff',
  },
  dropTargetRow: {
    boxShadow: 'inset 0 2px 0 0 #0b7285, inset 0 -2px 0 0 #0b7285',
    background: '#f0f9fb',
  },
  td: {
    padding: 12,
    borderBottom: '1px solid #edf2f7',
    color: '#334e68',
    fontSize: 13,
    verticalAlign: 'middle',
  },
  dragCell: {
    width: 120,
    padding: 12,
    borderBottom: '1px solid #edf2f7',
    verticalAlign: 'middle',
  },
  dragHandle: {
    width: 30,
    height: 30,
    display: 'inline-grid',
    placeItems: 'center',
    border: '1px solid #bcccdc',
    borderRadius: 6,
    background: '#fff',
    color: '#486581',
    cursor: 'grab',
    fontSize: 14,
    lineHeight: 1,
  },
  orderControls: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: 4,
    marginLeft: 8,
    verticalAlign: 'middle',
  },
  moveButton: {
    minWidth: 46,
    padding: '3px 6px',
    background: '#fff',
    color: '#486581',
    border: '1px solid #d9e2ec',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 11,
  },
  thumbnail: {
    width: 84,
    height: 56,
    objectFit: 'cover',
    border: '1px solid #d9e2ec',
    borderRadius: 6,
    background: '#f0f4f8',
    display: 'block',
  },
  thumbnailPlaceholder: {
    width: 84,
    height: 56,
    display: 'grid',
    placeItems: 'center',
    border: '1px dashed #bcccdc',
    borderRadius: 6,
    color: '#829ab1',
    fontSize: 12,
    background: '#f8fafc',
  },
  orderBadge: {
    minWidth: 30,
    height: 30,
    display: 'inline-grid',
    placeItems: 'center',
    borderRadius: 6,
    background: '#e6f6ff',
    color: '#0b7285',
    fontWeight: 700,
  },
  nameCell: {
    width: 160,
    padding: 12,
    borderBottom: '1px solid #edf2f7',
    color: '#102a43',
    fontSize: 13,
    fontWeight: 700,
    verticalAlign: 'middle',
  },
  descriptionCell: {
    maxWidth: 320,
    padding: 12,
    borderBottom: '1px solid #edf2f7',
    color: '#486581',
    fontSize: 13,
    lineHeight: 1.45,
    verticalAlign: 'middle',
  },
  actionCell: {
    width: 130,
    padding: 12,
    borderBottom: '1px solid #edf2f7',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  },
  editButton: {
    padding: '5px 9px',
    background: '#fff',
    border: '1px solid #0b7285',
    color: '#0b7285',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 12,
    marginRight: 6,
  },
  deleteButton: {
    padding: '5px 9px',
    background: '#fff',
    border: '1px solid #c92a2a',
    color: '#c92a2a',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 12,
  },
  link: {
    color: '#0b7285',
    textDecoration: 'none',
    fontWeight: 700,
  },
  muted: {
    color: '#829ab1',
  },
  editCell: {
    padding: 0,
    borderBottom: '1px solid #edf2f7',
  },
  emptyRow: {
    padding: '36px 16px',
    textAlign: 'center',
    color: '#829ab1',
    fontSize: 13,
  },
  emptyTitle: {
    color: '#486581',
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
  },
  emptyHint: {
    color: '#829ab1',
    fontSize: 12,
    lineHeight: 1.6,
  },
  loading: {
    padding: 20,
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: 8,
    color: '#486581',
  },
  errorBox: {
    padding: 12,
    background: '#fff5f5',
    color: '#c92a2a',
    border: '1px solid #ffc9c9',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 12,
  },
}
