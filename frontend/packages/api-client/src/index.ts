export { apiClient, ensureFreshAccessToken } from './client'
export { getAdminDashboard, getAdminPatientDashboard, notifyGuardian } from './admin-dashboard'
export { authInterceptor } from './interceptors/auth'
export { login, refreshTokens, signup } from './auth'
export {
  createArtwork,
  deleteArtwork,
  getArtwork,
  getMyArtworks,
  submitDrawingGuess,
  updateArtwork,
} from './artworks'
export {
  createQuizRoom,
  getQuizRoom,
  getWaitingQuizRooms,
  joinQuizRoom,
  leaveQuizRoom,
  startQuizRoom,
  type PromptAssignment,
  type QuizGameStartedResponse,
  type QuizMember,
  type QuizRoomListItem,
  type QuizRoomSnapshot,
  type QuizRoomStatus,
  type QuizStrokeMessage,
  type StartQuizRoomRequest,
} from './quiz'
export {
  createPhotoBooth,
  deletePhotoBooth,
  getMyPhotoBooths,
  getPhotoBooth,
  getPublicPhotoBooths,
  updatePhotoBooth,
} from './photo-booths'
export {
  createExerciseMotion,
  deleteExerciseMotion,
  getExerciseMotion,
  listExerciseMotions,
  reorderExerciseMotions,
  updateExerciseMotion,
} from './exercise-motions'
export {
  CREATE_EXERCISE_SESSION_ERROR_MESSAGE,
  createExerciseSession,
  createExerciseSessionMotion,
  EXERCISE_MOTION_MOVEMENT_ANALYSIS_ERROR_MESSAGE,
  EXERCISE_SESSION_DETAIL_ERROR_MESSAGE,
  EXERCISE_SESSION_ERROR_MESSAGE,
  EXERCISE_MOTION_REPLAY_ERROR_MESSAGE,
  getExerciseMotionMovementAnalysis,
  getExerciseMotionReplay,
  getExerciseSessionDetail,
  getExerciseSessions,
  getMyExerciseSessions,
  validateCreateExerciseSessionMotionRequest,
  validateCreateExerciseSessionRequest,
} from './exercise-sessions'
export {
  createGomokuRoom,
  getGomokuMessages,
  getGomokuRanking,
  getGomokuRoom,
  getGomokuRooms,
  getMyGomokuMatches,
  getMyGomokuStats,
  getWaitingGomokuRooms,
  heartbeatGomokuRoom,
  joinGomokuRoom,
  leaveGomokuRoom,
  playGomokuMove,
  rematchGomokuRoom,
  resignGomokuRoom,
  sendGomokuMessage,
  startGomokuRoom,
  swapGomokuRoomStones,
} from './gomoku'
export {
  getChartRanking,
  getChartStats,
  getMusicResult,
  getMyBestMusicResults,
  getMyMusicResults,
  saveMusicResult,
} from './music-results'
export { consumeFuel, getFuelInbox, getFuelStatus, sendFuel } from './fuel'
export {
  getGuardianDialogueDailySummary,
  getGuardianDialogueSession,
  getGuardianDialogueWeeklyTrend,
  listGuardianDialogueSessions,
} from './guardian-dialogue'
export { getReportAiSummary } from './guardian-report'
export { requestPresignedUploadUrls, uploadToPresignedUrl } from './uploads'
export { createPatientProfile, listPatientProfiles, updatePatientProfile } from './patient-profiles'
export { endLoginSession, heartbeatLoginSession, startLoginSession } from './login-sessions'
export {
  endContent,
  getActiveLiveSession,
  requestGameLivekitToken,
  requestGuardianLivekitToken,
  startContent,
  subscribeGamePresence,
  subscribeRealtimeEvents,
  subscribeWatching,
} from './realtime'
export {
  getCumulativeUsageStats,
  getDailyUsageStats,
  getUsageAverages,
  getUsageRankings,
} from './usage-stats'
export {
  createTaekwondoMotion,
  deleteTaekwondoMotion,
  getTaekwondoMotion,
  getTaekwondoPoomsaeNumber,
  getTaekwondoPoomsaeLabel,
  listTaekwondoMotionsByPoomsae,
  listTaekwondoMotions,
  reorderTaekwondoMotions,
  TAEKWONDO_POOMSAE_VALUES,
  updateTaekwondoMotion,
} from './taekwondo-motions'
export {
  DEFAULT_TAEKWONDO_BELT_COLOR,
  getLatestTaekwondoBeltColor,
  getTaekwondoBeltHistory,
  normalizeTaekwondoBeltColor,
  TAEKWONDO_BELT_COLORS,
} from './taekwondo-belt-history'
export {
  createTaekwondoSession,
  createTaekwondoSessionMotion,
  formatTaekwondoAiFeedback,
  getMyTaekwondoSessions,
  getTaekwondoSessions,
  getTaekwondoSessionDetail,
  toCreateTaekwondoSessionMotionRequest,
  toTaekwondoAccuracy,
} from './taekwondo-sessions'
export { getTaekwondoProgress } from './taekwondo-progress'
export type { TaekwondoProgressResponse } from './taekwondo-progress'
export { aiApiClient, analyzeTaegeuk1Motion } from './taekwondo-ai'
export type { TaegeukAnalyzeRequest, TaegeukAnalyzeResponse } from './taekwondo-ai'
export { changeUserRole, listUsers } from './users'
export type {
  LoginRequest,
  RefreshTokenRequest,
  SignupRequest,
  TokenResponse,
  UserResponse,
  UserRole,
} from './auth'
export type { AdminUserResponse } from './users'
export type {
  AdminDashboard,
  AdminDashboardAlert,
  AdminDashboardContentShare,
  AdminDashboardDailyUsage,
  AdminDashboardPatientActivity,
  AdminDashboardPatientStatus,
  AdminDashboardPreviousPeriodSummary,
  AdminDashboardSummary,
  AdminPatientDashboard,
  AdminPatientDashboardDailyUsage,
  AdminPatientDashboardPatient,
  AdminPatientDashboardSummary,
  AdminPatientHeatmapCell,
  AdminPatientHourlyHeatmap,
  GetAdminDashboardParams,
  GuardianNotificationRequest,
  GuardianNotificationResponse,
  GuardianNotificationType,
} from './admin-dashboard'
export type {
  ApiResponse,
  Artwork,
  ArtworkPage,
  CreateArtworkParams,
  CreateArtworkRequest,
  DrawingGuessRequest,
  DrawingGuessResult,
  GetMyArtworksParams,
  Pageable,
  PageResponse,
  PageSort,
  UpdateArtworkParams,
  UpdateArtworkRequest,
} from './artworks'
export type {
  CreatePhotoBoothParams,
  CreatePhotoBoothRequest,
  ListPhotoBoothParams,
  PhotoBooth,
  PhotoBoothPage,
  PublicPhotoBooth,
  PublicPhotoBoothAuthor,
  PublicPhotoBoothPage,
  UpdatePhotoBoothRequest,
} from './photo-booths'
export type {
  CreateExerciseMotionParams,
  CreateExerciseMotionRequest,
  ExerciseMotion,
  ExerciseMotionReorderRequest,
  ExerciseType,
  UpdateExerciseMotionParams,
  UpdateExerciseMotionRequest,
} from './exercise-motions'
export type {
  CreateExerciseSessionMotionRequest,
  CreateExerciseSessionRequest,
  ExerciseSessionDetail,
  ExerciseSessionMotionSaveResponse,
  ExerciseMotionMovementAnalysisJointRange,
  ExerciseMotionMovementAnalysisResponse,
  ExerciseMotionMovementAnalysisSegment,
  ExerciseMotionReplayClip,
  ExerciseMotionReplayResponse,
  ExerciseSessionMotionResult,
  ExerciseSessionPage,
  ExerciseSessionSummary,
  ExerciseSessionType,
  GetMyExerciseSessionsParams,
  MotionReplayFrame,
  MotionReplayLandmarkTuple,
  MotionReplaySegment,
} from './exercise-sessions'
export type {
  GomokuEndReason,
  GomokuMatchPage,
  GomokuChatMessage,
  GomokuChatMessageSendRequest,
  GomokuMatchResult,
  GomokuMatchStatus,
  GomokuMatchSummary,
  GomokuMoveRecord,
  GomokuMoveRequest,
  GomokuPageParams,
  GomokuPlayer,
  GomokuRanking,
  GomokuRankingEntry,
  GomokuRoom,
  GomokuRoomCreateRequest,
  GomokuRoomJoinRequest,
  GomokuRoomPage,
  GomokuRuleSet,
  GomokuStats,
  GomokuStone,
  GomokuViewerRole,
} from './gomoku'
export type {
  ChartStats,
  GetMyMusicResultsParams,
  MusicBestResult,
  MusicChartRanking,
  MusicMyRanking,
  MusicRankingEntry,
  MusicResult,
  MusicResultDetail,
  MusicResultPage,
  MusicResultRequest,
} from './music-results'
export type {
  FuelConsumeRequest,
  FuelConsumeResponse,
  FuelEvent,
  FuelInboxEvent,
  FuelSendRequest,
  FuelStatus,
} from './fuel'
export type {
  GuardianDialogueChoiceTone,
  GuardianDialogueChoiceValence,
  GuardianDialogueDailySummary,
  GuardianDialogueFinishReason,
  GuardianDialogueGeneratedBy,
  GuardianDialogueNpc,
  GuardianDialogueSentimentTone,
  GuardianDialogueSentimentWord,
  GuardianDialogueSessionDetail,
  GuardianDialogueSessionMeta,
  GuardianDialogueSessionStatus,
  GuardianDialogueSignal,
  GuardianDialogueSignalKind,
  GuardianDialogueTurn,
  GuardianDialogueValenceDistribution,
  GuardianDialogueWeeklyTrend,
  GuardianDialogueWeeklyTrendPoint,
  GuardianNpcVisited,
  ListGuardianDialogueSessionsParams,
} from './guardian-dialogue'
export type { WeeklyReportAiSummary } from './guardian-report'
export type {
  PresignedUploadItem,
  PresignedUploadRequest,
  PresignedUploadResponse,
} from './uploads'
export type {
  Gender,
  PatientProfile,
  PatientProfileCreateRequest,
  PatientProfileUpdateRequest,
} from './patient-profiles'
export type { LoginSession, LoginSessionStartRequest } from './login-sessions'
export type {
  ActiveLiveSessionResponse,
  GamePresenceEvent,
  LiveKitTokenResponse,
  RealtimeContentType,
  RealtimeEvent,
  StartContentRequest,
} from './realtime'
export type {
  ContentUsageAverage,
  CumulativeUsageStats,
  DailyUsageItem,
  DailyUsageStats,
  DailyUsageStatsParams,
  UsageAverage,
  UsageAverages,
  UsageAveragesParams,
  UsageRankingEntry,
  UsageRankings,
  UsageRankingsParams,
} from './usage-stats'
export type {
  CreateTaekwondoMotionParams,
  CreateTaekwondoMotionRequest,
  Poomsae,
  TaekwondoMotion,
  TaekwondoMotionsByPoomsaeResult,
  TaekwondoMotionReorderRequest,
  UpdateTaekwondoMotionParams,
  UpdateTaekwondoMotionRequest,
} from './taekwondo-motions'
export type { TaekwondoBeltColor, TaekwondoBeltHistory } from './taekwondo-belt-history'
export type {
  BeltPromotionResponse,
  CreateTaekwondoSessionMotionRequest,
  CreateTaekwondoSessionRequest,
  GetMyTaekwondoSessionsParams,
  TaekwondoSessionDetail,
  TaekwondoSessionMotionResult,
  TaekwondoSessionMotionSaveResponse,
  TaekwondoSessionPage,
  ToCreateTaekwondoSessionMotionRequestParams,
  TaekwondoSessionSummary,
} from './taekwondo-sessions'
