import { useCallback, useEffect, useRef, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createGame } from './phaser'
import type Phaser from 'phaser'
import DanielForwardPressDebugPage from './debug/DanielForwardPressDebugPage'
import DanielForwardBendDebugPage from './debug/DanielForwardBendDebugPage'
import DanielLeftSideBendDebugPage from './debug/DanielLeftSideBendDebugPage'
import DanielRightSideBendDebugPage from './debug/DanielRightSideBendDebugPage'
import DanielStretchDebugPage from './debug/DanielStretchDebugPage'
import DanielUpwardPressDebugPage from './debug/DanielUpwardPressDebugPage'
import CanvasRecorderDebugPage from './debug/CanvasRecorderDebugPage'
import DiagonalBodyPunchDebugPage from './debug/DiagonalBodyPunchDebugPage'
import DiagonalFacePunchDebugPage from './debug/DiagonalFacePunchDebugPage'
import MarchDebugPage from './debug/MarchDebugPage'
import SideStepDebugPage from './debug/SideStepDebugPage'
import SquatDebugPage from './debug/SquatDebugPage'
import { AuthOverlay } from './features/auth'
import { ExerciseSessionListOverlay } from './features/exerciseSessions'
import { GomokuOverlay } from './features/gomoku'
import { PhotoGalleryOverlay } from './features/photoGallery'
import { QuizGuessOverlay } from './features/quiz-realtime'
import { NicknameEditOverlay } from './features/settings'
import { LighthouseEmotionController } from './features/lighthouse-emotion/components/LighthouseEmotionController'
import { VillagerDialogueController } from './features/village-dialogue/components/VillagerDialogueController'
import type { VillagerDialogueOpenPayload, VillagerNpcId } from './features/village-dialogue/types'
import {
  clearPatientProfileId,
  resolvePatientProfileIdOrFetch,
} from './features/exerciseSessions/patientProfile'
import { useLoginSession } from './features/loginSession'
import { useContentLifecycleSync, useRealtimePublisher } from './features/realtime'
import { queryClient } from './queryClient'

const DEBUG_MARCH_MODE = 'march'
const DEBUG_SIDE_STEP_MODE = 'side-step'
const DEBUG_DIAGONAL_BODY_PUNCH_MODE = 'diagonal-body-punch'
const DEBUG_DIAGONAL_FACE_PUNCH_MODE = 'diagonal-face-punch'
const DEBUG_SQUAT_MODE = 'squat'
const DEBUG_DANIEL_FORWARD_PRESS_MODE = 'daniel-forward-press'
const DEBUG_DANIEL_FORWARD_BEND_MODE = 'daniel-forward-bend'
const DEBUG_DANIEL_UPWARD_PRESS_MODE = 'daniel-upward-press'
const DEBUG_DANIEL_LEFT_SIDE_BEND_MODE = 'daniel-left-side-bend'
const DEBUG_DANIEL_RIGHT_SIDE_BEND_MODE = 'daniel-right-side-bend'
const DEBUG_DANIEL_STRETCH_MODE = 'daniel-stretch'
const DEBUG_CANVAS_RECORDER_MODE = 'canvas-recorder'
const DEBUG_GOMOKU_MODE = 'gomoku'

function App() {
  const params = new URLSearchParams(window.location.search)
  const debugMode = params.get('debug')
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showExerciseSessions, setShowExerciseSessions] = useState(false)
  const [showGomoku, setShowGomoku] = useState(false)
  const [showPhotoGallery, setShowPhotoGallery] = useState(false)
  const [showQuizGuess, setShowQuizGuess] = useState(false)
  const [nicknameEdit, setNicknameEdit] = useState<{
    open: boolean
    current: string | null
  }>({ open: false, current: null })
  const [villagerNpcId, setVillagerNpcId] = useState<VillagerNpcId | null>(null)
  const [isLighthouseEmotionOpen, setIsLighthouseEmotionOpen] = useState(false)
  const [patientProfileId, setPatientProfileId] = useState<number | undefined>(undefined)
  const [gameCanvas, setGameCanvas] = useState<HTMLCanvasElement | null>(null)
  const [gameInstance, setGameInstance] = useState<Phaser.Game | null>(null)

  useLoginSession(patientProfileId)
  useRealtimePublisher(gameCanvas)
  useContentLifecycleSync(gameInstance)

  useEffect(() => {
    if (
      debugMode === DEBUG_MARCH_MODE ||
      debugMode === DEBUG_SIDE_STEP_MODE ||
      debugMode === DEBUG_DIAGONAL_BODY_PUNCH_MODE ||
      debugMode === DEBUG_DIAGONAL_FACE_PUNCH_MODE ||
      debugMode === DEBUG_SQUAT_MODE ||
      debugMode === DEBUG_DANIEL_FORWARD_PRESS_MODE ||
      debugMode === DEBUG_DANIEL_FORWARD_BEND_MODE ||
      debugMode === DEBUG_DANIEL_UPWARD_PRESS_MODE ||
      debugMode === DEBUG_DANIEL_LEFT_SIDE_BEND_MODE ||
      debugMode === DEBUG_DANIEL_RIGHT_SIDE_BEND_MODE ||
      debugMode === DEBUG_DANIEL_STRETCH_MODE ||
      debugMode === DEBUG_CANVAS_RECORDER_MODE ||
      debugMode === DEBUG_GOMOKU_MODE
    ) {
      return
    }
    if (!containerRef.current || gameRef.current) return

    let isCancelled = false

    const game = createGame(containerRef.current)
    gameRef.current = game
    setGameCanvas(game.canvas)
    setGameInstance(game)
    game.events.on('auth:request', () => setShowAuth(true))
    game.events.on('auth:logout', () => {
      clearPatientProfileId()
      setPatientProfileId(undefined)
    })
    game.events.on('auth:completed', async () => {
      const id = await resolvePatientProfileIdOrFetch()
      if (isCancelled) return
      setPatientProfileId(id)
    })
    game.events.on('exercise-sessions:open', () => setShowExerciseSessions(true))
    game.events.on('gomoku:open', () => setShowGomoku(true))
    game.events.on('photo-gallery:open', () => setShowPhotoGallery(true))
    game.events.on('quiz-guess:open', () => setShowQuizGuess(true))
    game.events.on('quiz-guess:close', () => setShowQuizGuess(false))
    game.events.on('settings:nickname-edit-open', ({ current }: { current: string | null }) => {
      setNicknameEdit({ open: true, current })
    })
    game.events.on('villager-dialogue:open', ({ npcId }: VillagerDialogueOpenPayload) => {
      setVillagerNpcId(npcId)
    })
    game.events.on('villager-dialogue:force-close', () => {
      setVillagerNpcId(null)
    })
    game.events.on('lighthouse-emotion:open', async () => {
      setIsLighthouseEmotionOpen(true)
      const id = await resolvePatientProfileIdOrFetch()
      if (isCancelled) return
      if (id) {
        setPatientProfileId(id)
        return
      }
      setIsLighthouseEmotionOpen(false)
      game.events.emit('lighthouse-emotion:closed')
      setShowAuth(true)
    })
    game.events.on('lighthouse-emotion:force-close', () => {
      setIsLighthouseEmotionOpen(false)
    })

    void resolvePatientProfileIdOrFetch().then(resolvedPatientProfileId => {
      if (!isCancelled) setPatientProfileId(resolvedPatientProfileId)
    })

    return () => {
      isCancelled = true
      gameRef.current?.destroy(true)
      gameRef.current = null
      setGameCanvas(null)
      setGameInstance(null)
    }
  }, [debugMode])

  const handleAuthSuccess = useCallback(() => {
    setShowAuth(false)
    void resolvePatientProfileIdOrFetch().then(id => {
      setPatientProfileId(id)
    })
    gameRef.current?.events.emit('auth:completed')
  }, [])

  const handleAuthCancel = useCallback(() => {
    setShowAuth(false)
    gameRef.current?.events.emit('auth:cancelled')
  }, [])

  const handleVillagerDialogueClose = useCallback(() => {
    setVillagerNpcId(null)
    gameRef.current?.events.emit('villager-dialogue:closed')
  }, [])

  const handleVillagerDialogueTextChange = useCallback((text: string) => {
    gameRef.current?.events.emit('villager-dialogue:text', { text })
  }, [])

  const handleLighthouseEmotionClose = useCallback(() => {
    setIsLighthouseEmotionOpen(false)
    gameRef.current?.events.emit('lighthouse-emotion:closed')
  }, [])

  const handleLighthouseEmotionTextChange = useCallback((text: string) => {
    gameRef.current?.events.emit('lighthouse-emotion:text', { text })
  }, [])

  const handleGomokuClose = useCallback(() => {
    setShowGomoku(false)
    gameRef.current?.events.emit('gomoku:closed')
  }, [])

  const handlePhotoGalleryClose = useCallback(() => {
    setShowPhotoGallery(false)
    gameRef.current?.events.emit('photo-gallery:closed')
  }, [])

  if (debugMode === DEBUG_MARCH_MODE) {
    return <MarchDebugPage />
  }

  if (debugMode === DEBUG_SIDE_STEP_MODE) {
    return <SideStepDebugPage />
  }

  if (debugMode === DEBUG_DIAGONAL_BODY_PUNCH_MODE) {
    return <DiagonalBodyPunchDebugPage />
  }

  if (debugMode === DEBUG_DIAGONAL_FACE_PUNCH_MODE) {
    return <DiagonalFacePunchDebugPage />
  }

  if (debugMode === DEBUG_SQUAT_MODE) {
    return <SquatDebugPage />
  }

  if (debugMode === DEBUG_DANIEL_FORWARD_PRESS_MODE) {
    return <DanielForwardPressDebugPage />
  }

  if (debugMode === DEBUG_DANIEL_FORWARD_BEND_MODE) {
    return <DanielForwardBendDebugPage />
  }

  if (debugMode === DEBUG_DANIEL_UPWARD_PRESS_MODE) {
    return <DanielUpwardPressDebugPage />
  }

  if (debugMode === DEBUG_DANIEL_LEFT_SIDE_BEND_MODE) {
    return <DanielLeftSideBendDebugPage />
  }

  if (debugMode === DEBUG_DANIEL_RIGHT_SIDE_BEND_MODE) {
    return <DanielRightSideBendDebugPage />
  }

  if (debugMode === DEBUG_DANIEL_STRETCH_MODE) {
    return <DanielStretchDebugPage />
  }

  if (debugMode === DEBUG_CANVAS_RECORDER_MODE) {
    return <CanvasRecorderDebugPage />
  }

  if (debugMode === DEBUG_GOMOKU_MODE) {
    return (
      <>
        <AuthOverlay
          open={showAuth}
          onAuthSuccess={handleAuthSuccess}
          onCancel={handleAuthCancel}
        />
        <GomokuOverlay
          open
          onClose={() => undefined}
          patientProfileId={patientProfileId}
          onAuthRequired={() => setShowAuth(true)}
        />
      </>
    )
  }

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          overscrollBehavior: 'none',
          touchAction: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
        }}
      />
      <AuthOverlay open={showAuth} onAuthSuccess={handleAuthSuccess} onCancel={handleAuthCancel} />
      <VillagerDialogueController
        npcId={villagerNpcId}
        patientProfileId={patientProfileId}
        isOpen={villagerNpcId !== null}
        onClose={handleVillagerDialogueClose}
        onTextChange={handleVillagerDialogueTextChange}
      />
      <LighthouseEmotionController
        patientProfileId={patientProfileId ?? 0}
        isOpen={isLighthouseEmotionOpen}
        onClose={handleLighthouseEmotionClose}
        onTextChange={handleLighthouseEmotionTextChange}
      />
      <GomokuOverlay
        open={showGomoku}
        onClose={handleGomokuClose}
        patientProfileId={patientProfileId}
        onAuthRequired={() => setShowAuth(true)}
      />
      <QueryClientProvider client={queryClient}>
        <ExerciseSessionListOverlay
          open={showExerciseSessions}
          onClose={() => setShowExerciseSessions(false)}
        />
        <PhotoGalleryOverlay open={showPhotoGallery} onClose={handlePhotoGalleryClose} />
      </QueryClientProvider>
      <QuizGuessOverlay
        open={showQuizGuess}
        onSubmit={text => {
          gameRef.current?.events.emit('quiz-guess:submit', { text })
        }}
        onLeave={() => {
          gameRef.current?.events.emit('quiz-guess:leave')
        }}
      />
      <NicknameEditOverlay
        open={nicknameEdit.open}
        patientProfileId={patientProfileId}
        currentNickname={nicknameEdit.current}
        onSaved={nickname => {
          setNicknameEdit({ open: false, current: nickname })
          gameRef.current?.events.emit('settings:nickname-updated', { nickname })
        }}
        onCancel={() => {
          setNicknameEdit(prev => ({ open: false, current: prev.current }))
          gameRef.current?.events.emit('settings:nickname-edit-cancelled')
        }}
      />
    </>
  )
}

export default App
